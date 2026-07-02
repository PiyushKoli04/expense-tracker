/* ============================================
   GROUP DASHBOARD — group-dashboard.js
   Group Overview, Standings, Greedy P2P Settlements & Charts
   ============================================ */

const GroupDashboard = (() => {

  let _user = null;
  let _profile = null;
  let _groupId = null;
  let _groupDoc = null;

  // Chart instances to destroy before recreating
  let _categoryChartInstance = null;
  let _contributionsChartInstance = null;

  /**
   * Main module initialization hook from app.js
   */
  async function init(user, profile) {
    _user = user;
    _profile = profile;

    // Retrieve active groupId from session storage
    _groupId = sessionStorage.getItem('currentGroupId');
    
    if (!_groupId) {
      console.warn('⚠️ No active groupId found in sessionStorage. Redirecting to groups list.');
      UI.showToast('Please select a group first.', 'info');
      setTimeout(() => {
        window.location.href = '/pages/group/groups.html';
      }, 1000);
      return;
    }

    console.log(`🏰 Initializing Group Dashboard for Group: ${_groupId}`);

    try {
      // 1. Fetch group details
      _groupDoc = await FirestoreService.getDocument('groups', _groupId);
      if (!_groupDoc) {
        UI.showToast('Group not found.', 'error');
        window.location.href = '/pages/group/groups.html';
        return;
      }

      // Render group headers
      renderGroupHeader();

      // 2. Fetch all group-related collections
      UI.showLoading('#membersBalanceGrid');
      
      const [expenses, contributions, settlements] = await Promise.all([
        FirestoreService.getGroupDocuments('groupExpenses', _groupId),
        FirestoreService.getGroupDocuments('groupContributions', _groupId),
        FirestoreService.getGroupDocuments('groupSettlements', _groupId)
      ]);

      UI.hideLoading('#membersBalanceGrid');

      // 3. Compute Member Balances & Standings
      const memberBalances = calculateMemberBalances(expenses, settlements);

      // 4. Render Standings Cards
      renderMemberStandings(memberBalances);

      // 5. Render Core Header KPIs
      renderHeaderKPIs(expenses, memberBalances);

      // 6. Greedy P2P Settlements Algorithm
      renderGreedySettlements(memberBalances);

      // 7. Render Charts
      renderGroupCharts(expenses, contributions);

      // 8. Render Recent Group Bills Table
      renderRecentGroupExpenses(expenses);

      // 9. Attach statement export
      setupPdfExport();

    } catch (error) {
      console.error('Error initializing group dashboard:', error);
      UI.showToast('Error loading group dashboard.', 'error');
    }
  }

  /**
   * Render static group info in headers
   */
  function renderGroupHeader() {
    const titleEl = document.getElementById('groupTitleName');
    const descEl = document.getElementById('groupSubtitleDesc');
    const headerTitle = document.getElementById('groupHeaderTitle');
    const typeBadge = document.getElementById('groupTypeBadge');
    const iconBadge = document.getElementById('groupIconBadge');
    const inviteCodeVal = document.getElementById('groupInviteCodeVal');

    const groupName = _groupDoc.name || 'Shared Group';
    const groupType = _groupDoc.type || 'Trip';
    const inviteCode = _groupDoc.inviteCode || '—';
    const icon = Utils.getGroupTypeIcon(groupType);

    if (titleEl) titleEl.textContent = groupName;
    if (descEl) descEl.textContent = `${groupType} Split Network`;
    if (headerTitle) headerTitle.textContent = groupName;
    if (typeBadge) typeBadge.textContent = groupType;
    if (iconBadge) iconBadge.textContent = icon;
    if (inviteCodeVal) inviteCodeVal.textContent = inviteCode;
  }

  /**
   * Copy Group Invite Code
   */
  function copyCode() {
    if (!_groupDoc || !_groupDoc.inviteCode) return;
    navigator.clipboard.writeText(_groupDoc.inviteCode).then(() => {
      UI.showToast(`Invite code ${_groupDoc.inviteCode} copied!`, 'success');
    }).catch(err => {
      console.error('Failed to copy code:', err);
    });
  }

  /**
   * Calculate exact net peer-to-peer balance for each member
   */
  function calculateMemberBalances(expenses, settlements) {
    const balances = {};
    const members = _groupDoc.members || [];
    const memberDetails = _groupDoc.memberDetails || [];

    // Pre-initialize balances to 0 for all active members
    members.forEach(uid => {
      const detail = memberDetails.find(d => d.uid === uid) || {};
      balances[uid] = {
        uid,
        username: detail.username || 'User',
        email: detail.email || '...',
        balance: 0,
        totalPaid: 0,
        totalShare: 0
      };
    });

    // Process Expenses
    expenses.forEach(exp => {
      const amount = parseFloat(exp.amount) || 0;
      const paidBy = exp.paidBy;
      const participants = exp.participants || [];
      const splitType = exp.splitType || 'Equal';
      const splitDetails = exp.splitDetails || {};

      // If buyer is inside our active group, credit their payment
      if (balances[paidBy]) {
        balances[paidBy].balance += amount;
        balances[paidBy].totalPaid += amount;
      }

      // Calculate and deduct share for participants
      participants.forEach(uid => {
        if (!balances[uid]) return; // Participant is not in group members anymore

        let share = 0;
        if (splitType === 'Equal') {
          share = amount / participants.length;
        } else if (splitType === 'Unequal') {
          share = parseFloat(splitDetails[uid]) || 0;
        } else if (splitType === 'Percentage') {
          const pct = parseFloat(splitDetails[uid]) || 0;
          share = (pct / 100) * amount;
        } else if (splitType === 'Share-based') {
          const shares = parseFloat(splitDetails[uid]) || 0;
          const totalShares = participants.reduce((sum, pUid) => sum + (parseFloat(splitDetails[pUid]) || 0), 0);
          if (totalShares > 0) {
            share = (shares / totalShares) * amount;
          }
        }

        balances[uid].balance -= share;
        balances[uid].totalShare += share;
      });
    });

    // Process Settled Settlements (status === 'Settled')
    settlements.forEach(settle => {
      if (settle.status !== 'Settled') return; // Only process actual settlements
      const payer = settle.payer;
      const receiver = settle.receiver;
      const amount = parseFloat(settle.amount) || 0;

      // Payer gets credited (spent money to reduce their negative balance)
      if (balances[payer]) {
        balances[payer].balance += amount;
      }

      // Receiver gets debited (got money to reduce their positive balance)
      if (balances[receiver]) {
        balances[receiver].balance -= amount;
      }
    });

    return balances;
  }

  /**
   * Render Standings Cards
   */
  function renderMemberStandings(memberBalances) {
    const grid = document.getElementById('membersBalanceGrid');
    if (!grid) return;

    const list = Object.values(memberBalances);
    grid.innerHTML = '';

    list.forEach(m => {
      const card = document.createElement('div');
      card.className = 'member-balance-card card--glow-cyan';

      const isPositive = m.balance > 0.01;
      const isNegative = m.balance < -0.01;
      
      let amtClass = 'member-balance-card__amount--zero';
      let statusText = 'Settled Up';
      
      if (isPositive) {
        amtClass = 'member-balance-card__amount--positive';
        statusText = 'is owed';
      } else if (isNegative) {
        amtClass = 'member-balance-card__amount--negative';
        statusText = 'owes';
      }

      const initials = Utils.getInitials(m.username);
      const color = Utils.getAvatarColor(m.username);

      card.innerHTML = `
        <div class="sidebar__avatar" style="width: 42px; height: 42px; border-radius: 50%; font-size:14px; background:var(--accent-${color}-glow); color:var(--accent-${color}); font-weight:bold; display:flex; align-items:center; justify-content:center;">
          ${initials}
        </div>
        <div class="member-balance-card__info">
          <div class="member-balance-card__name">${m.username} ${m.uid === _user.uid ? '(You)' : ''}</div>
          <div class="member-balance-card__email">${statusText}</div>
        </div>
        <div class="member-balance-card__amount ${amtClass}">
          ${Utils.formatCurrency(m.balance, true)}
        </div>
      `;
      grid.appendChild(card);
    });
  }

  /**
   * Render Core Header KPIs
   */
  function renderHeaderKPIs(expenses, memberBalances) {
    const totalGroupSpent = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const userBalance = memberBalances[_user.uid] || { balance: 0, totalShare: 0 };

    Animations.animateCounter('totalGroupSpentVal', totalGroupSpent);
    Animations.animateCounter('userShareSpentVal', userBalance.totalShare);

    const userNetValEl = document.getElementById('userNetBalanceVal');
    if (userNetValEl) {
      Animations.animateCounter('userNetBalanceVal', userBalance.balance, { isCurrency: true });
      if (userBalance.balance > 0.01) {
        userNetValEl.style.color = 'var(--accent-green)';
      } else if (userBalance.balance < -0.01) {
        userNetValEl.style.color = 'var(--accent-red)';
      } else {
        userNetValEl.style.color = 'var(--text-muted)';
      }
    }
  }

  /**
   * Greedy peer-to-peer settlement ledger generator
   */
  function renderGreedySettlements(memberBalances) {
    const container = document.getElementById('pendingSettlementsContainer');
    if (!container) return;

    // Clone balances for greedy calculations
    const balances = Object.values(memberBalances).map(m => ({
      uid: m.uid,
      username: m.username,
      balance: m.balance
    }));

    // Split into Debtors and Creditors
    const debtors = balances.filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance); // Most negative first
    const creditors = balances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance); // Most positive first

    container.innerHTML = '';

    if (debtors.length === 0 && creditors.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:32px; color:var(--text-muted);">
          🎉 Everyone is completely settled up! No transactions needed.
        </div>
      `;
      return;
    }

    const settlementsList = [];

    let dIdx = 0;
    let cIdx = 0;

    // Greedy matching logic
    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const owedAmount = Math.abs(debtor.balance);
      const creditAmount = creditor.balance;

      const settleAmount = Math.min(owedAmount, creditAmount);

      settlementsList.push({
        fromUid: debtor.uid,
        fromName: debtor.username,
        toUid: creditor.uid,
        toName: creditor.username,
        amount: settleAmount
      });

      debtor.balance += settleAmount;
      creditor.balance -= settleAmount;

      if (Math.abs(debtor.balance) < 0.01) dIdx++;
      if (Math.abs(creditor.balance) < 0.01) cIdx++;
    }

    settlementsList.forEach(s => {
      const card = document.createElement('div');
      card.className = 'settlement-card card--glow-purple';
      card.style.padding = '12px var(--space-5)';

      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; flex:1;">
          <span style="font-size:20px;">👤</span>
          <div>
            <div class="settlement-card__from" style="font-weight:600;">${s.fromName}</div>
            <div style="font-size:10px; color:var(--text-muted);">owes</div>
          </div>
          <span style="font-size:16px; color:var(--primary-purple); margin:0 8px;">➔</span>
          <span style="font-size:20px;">👤</span>
          <div>
            <div class="settlement-card__to" style="font-weight:600;">${s.toName}</div>
            <div style="font-size:10px; color:var(--text-muted);">will receive</div>
          </div>
        </div>
        <div class="settlement-card__amount" style="font-family:var(--font-display); font-size:16px;">
          ${Utils.formatCurrency(s.amount)}
        </div>
      `;
      container.appendChild(card);
    });
  }

  /**
   * Render shared group statistics charts
   */
  function renderGroupCharts(expenses, contributions) {
    // 1. Group category doughnut chart
    const categoryMap = {};
    expenses.forEach(exp => {
      const cat = exp.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + (parseFloat(exp.amount) || 0);
    });

    const categoryLabels = Object.keys(categoryMap);
    const categoryData = Object.values(categoryMap);

    if (_categoryChartInstance) _categoryChartInstance.destroy();
    
    if (categoryLabels.length > 0) {
      _categoryChartInstance = Charts.createDoughnutChart('groupCategoryChart', categoryLabels, categoryData);
    } else {
      clearCanvasPlaceholder('groupCategoryChart', 'No shared expenses logged yet');
    }

    // 2. Kitty contributions per member chart
    const contributionsMap = {};
    // Prefill all members with 0
    (_groupDoc.members || []).forEach(uid => {
      const details = (_groupDoc.memberDetails || []).find(d => d.uid === uid) || {};
      contributionsMap[details.username || 'User'] = 0;
    });

    contributions.forEach(contrib => {
      const name = contrib.memberName || 'User';
      contributionsMap[name] = (contributionsMap[name] || 0) + (parseFloat(contrib.amount) || 0);
    });

    const contribLabels = Object.keys(contributionsMap);
    const contribData = Object.values(contributionsMap);

    if (_contributionsChartInstance) _contributionsChartInstance.destroy();

    const hasContributions = contribData.some(val => val > 0);

    if (hasContributions) {
      _contributionsChartInstance = Charts.createBarChart('groupContributionsChart', contribLabels, [
        { label: 'Kitty Balance Contribution', data: contribData }
      ]);
    } else {
      clearCanvasPlaceholder('groupContributionsChart', 'No kitty deposits logged');
    }
  }

  /**
   * Safe helper to show a text placeholder on empty canvas elements
   */
  function clearCanvasPlaceholder(canvasId, text) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  /**
   * Render Recent 5 Shared Expenses Table
   */
  function renderRecentGroupExpenses(expenses) {
    const tbody = document.getElementById('recentGroupExpensesTbody');
    if (!tbody) return;

    // Sort by date descending
    const sorted = [...expenses].sort((a, b) => Utils.toDate(b.date).getTime() - Utils.toDate(a.date).getTime());
    const top5 = sorted.slice(0, 5);

    if (top5.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:24px; color:var(--text-muted);">
            No joint expenses split yet.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = '';
    top5.forEach(exp => {
      const tr = document.createElement('tr');
      const paidMember = (_groupDoc.memberDetails || []).find(d => d.uid === exp.paidBy) || {};
      const paidName = paidMember.username || 'User';

      tr.innerHTML = `
        <td style="font-weight: 500;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span>${Utils.getCategoryIcon(exp.category)}</span>
            <span>${exp.title}</span>
          </div>
        </td>
        <td>${paidName}</td>
        <td>${Utils.formatDate(exp.date, 'short')}</td>
        <td style="text-align:right; font-family:var(--font-mono); font-weight:600; color:var(--primary-cyan);">
          ${Utils.formatCurrency(exp.amount)}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * Setup interactive PDF Export statements
   */
  function setupPdfExport() {
    const btn = document.getElementById('exportGroupReportBtn');
    if (!btn) return;
    
    btn.onclick = (e) => {
      e.preventDefault();
      const groupName = _groupDoc.name || 'Shared-Group';
      const cleanName = groupName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      UI.showToast('Generating group report...', 'info');
      PDFExport.exportElementToPDF('groupDashboardContent', `${cleanName}-financial-report.pdf`);
    };
  }

  return {
    init,
    copyCode
  };
})();
