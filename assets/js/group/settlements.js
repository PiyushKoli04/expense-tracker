/* ============================================
   SETTLEMENTS — settlements.js
   Group Settlements CRUD, Greedy suggested payments & Live actions
   ============================================ */

const SettlementsModule = (() => {

  let _user = null;
  let _profile = null;
  let _groupId = null;
  let _groupDoc = null;
  let _tableEngine = null;
  let _rawData = [];

  /**
   * Main module initialization hook
   */
  async function init(user, profile) {
    _user = user;
    _profile = profile;

    _groupId = sessionStorage.getItem('currentGroupId');
    if (!_groupId) {
      console.warn('No active groupId found in sessionStorage. Redirecting.');
      UI.showToast('Please select a group first.', 'info');
      setTimeout(() => {
        window.location.href = '/pages/group/groups.html';
      }, 1000);
      return;
    }

    console.log(`🤝 Initializing Settlements Module for Group: ${_groupId}`);

    try {
      // 1. Fetch group details
      _groupDoc = await FirestoreService.getDocument('groups', _groupId);
      if (!_groupDoc) {
        UI.showToast('Active group not found.', 'error');
        window.location.href = '/pages/group/groups.html';
        return;
      }

      // 2. Setup Dropdowns
      populateDropdowns();

      // 3. Fetch and render ledger
      await fetchAndRenderSettlements();

    } catch (error) {
      console.error('Error initializing settlements:', error);
      UI.showToast('Error loading settlements page.', 'error');
    }
  }

  /**
   * Fill Payer and Receiver dropdown select options
   */
  function populateDropdowns() {
    const selects = [
      document.getElementById('payer'),
      document.getElementById('receiver')
    ];

    selects.forEach(select => {
      if (!select) return;
      select.innerHTML = '<option value="" disabled selected>Choose member</option>';
      const memberDetails = _groupDoc.memberDetails || [];
      memberDetails.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.uid;
        opt.textContent = m.username + (m.uid === _user.uid ? ' (You)' : '');
        select.appendChild(opt);
      });
    });
  }

  /**
   * Fetch expenses and settlements to compute exact current outstanding standings
   */
  async function fetchAndRenderSettlements() {
    try {
      UI.showLoading('#settlementsTable');

      // Fetch recorded settlements
      _rawData = await FirestoreService.getGroupDocuments('groupSettlements', _groupId, { orderBy: 'date', orderDir: 'desc' });

      // Fetch expenses
      const expenses = await FirestoreService.getGroupDocuments('groupExpenses', _groupId);

      UI.hideLoading('#settlementsTable');

      // 1. Calculate Outstanding Balances
      const memberBalances = calculateOutstandingBalances(expenses, _rawData);

      // 2. Animate KPI numbers
      renderSettlementKPIs(_rawData);

      // 3. Render suggested greedy matching
      renderSuggestedP2PSettlements(memberBalances);

      // 4. Load into reusable TableEngine
      if (!_tableEngine) {
        _tableEngine = new TableEngine({
          tableId: 'settlementsTable',
          toolbarId: 'settlementsToolbar',
          paginationId: 'settlementsPagination',
          columns: [
            {
              key: 'payer',
              label: 'Payer (From)',
              sortable: true,
              render: (val) => {
                const member = (_groupDoc.memberDetails || []).find(m => m.uid === val);
                return member ? member.username : 'User';
              }
            },
            {
              key: 'receiver',
              label: 'Receiver (To)',
              sortable: true,
              render: (val) => {
                const member = (_groupDoc.memberDetails || []).find(m => m.uid === val);
                return member ? member.username : 'User';
              }
            },
            { 
              key: 'date', 
              label: 'Settlement Date', 
              sortable: true,
              render: (val) => Utils.formatDate(val, 'short')
            },
            {
              key: 'status',
              label: 'Status',
              sortable: true,
              render: (val, row) => {
                if (val === 'Settled') {
                  return '<span class="badge badge--green">Settled & Completed</span>';
                }
                // Interactive Mark Settled button for Pending items
                return `
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="badge badge--orange">Pending Confirmation</span>
                    <button class="btn btn-primary btn-xs" style="padding:1px 6px; font-size:9px;" onclick="SettlementsModule.markAsSettled('${row.id}')">Confirm</button>
                  </div>
                `;
              }
            },
            {
              key: 'notes',
              label: 'Notes / Memo',
              render: (val) => val || '—'
            },
            {
              key: 'amount',
              label: 'Amount',
              sortable: true,
              class: 'cell-amount cell-amount--positive',
              render: (val) => Utils.formatCurrency(val)
            }
          ],
          data: _rawData,
          pageSize: 10,
          onEdit: (row) => openSettleModal(row.payer, row.receiver, row.amount, row.id, row.status, row.notes, row.date),
          onDelete: (row) => deleteSettlement(row),
          emptyMessage: 'No direct settlements logged in this group yet.'
        });
      } else {
        _tableEngine.setData(_rawData);
      }

    } catch (error) {
      console.error('Error fetching settlements:', error);
      UI.showToast('Error loading settlements list.', 'error');
    }
  }

  /**
   * Helper to compute net outstanding balances
   */
  function calculateOutstandingBalances(expenses, settlements) {
    const balances = {};
    const members = _groupDoc.members || [];
    const memberDetails = _groupDoc.memberDetails || [];

    // Prefill all members with 0
    members.forEach(uid => {
      balances[uid] = 0;
    });

    // Sum Expenses
    expenses.forEach(exp => {
      const amount = parseFloat(exp.amount) || 0;
      const paidBy = exp.paidBy;
      const participants = exp.participants || [];
      const splitType = exp.splitType || 'Equal';
      const splitDetails = exp.splitDetails || {};

      // Credit paid by
      if (balances[paidBy] !== undefined) {
        balances[paidBy] += amount;
      }

      // Debit participants
      participants.forEach(uid => {
        if (balances[uid] === undefined) return;

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
        balances[uid] -= share;
      });
    });

    // Adjust for Settled Settlements
    settlements.forEach(settle => {
      if (settle.status !== 'Settled') return;
      const amount = parseFloat(settle.amount) || 0;
      const payer = settle.payer;
      const receiver = settle.receiver;

      if (balances[payer] !== undefined) {
        balances[payer] += amount;
      }
      if (balances[receiver] !== undefined) {
        balances[receiver] -= amount;
      }
    });

    const list = members.map(uid => {
      const details = memberDetails.find(d => d.uid === uid) || {};
      return {
        uid,
        username: details.username || 'User',
        balance: balances[uid]
      };
    });

    return list;
  }

  /**
   * Process top aggregations
   */
  function renderSettlementKPIs(settlements) {
    const totalPending = settlements
      .filter(s => s.status === 'Pending')
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    const totalSettled = settlements
      .filter(s => s.status === 'Settled')
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    Animations.animateCounter('totalPendingSettlementsVal', totalPending);
    Animations.animateCounter('totalSettledVal', totalSettled);
  }

  /**
   * Run P2P greedy match and display outstanding suggestion panels
   */
  function renderSuggestedP2PSettlements(memberBalances) {
    const container = document.getElementById('suggestedSettlementsContainer');
    if (!container) return;

    // Split into Debtors and Creditors
    const debtors = memberBalances.filter(m => m.balance < -0.01).map(m => ({ ...m })).sort((a, b) => a.balance - b.balance);
    const creditors = memberBalances.filter(m => m.balance > 0.01).map(m => ({ ...m })).sort((a, b) => b.balance - a.balance);

    container.innerHTML = '';

    if (debtors.length === 0 && creditors.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:32px; color:var(--text-muted); font-size:12px;">
          🎉 Congratulations! All shared bills are perfectly balanced.
        </div>
      `;
      return;
    }

    const suggestions = [];
    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const owed = Math.abs(debtor.balance);
      const credit = creditor.balance;

      const settle = Math.min(owed, credit);

      suggestions.push({
        fromUid: debtor.uid,
        fromName: debtor.username,
        toUid: creditor.uid,
        toName: creditor.username,
        amount: settle
      });

      debtor.balance += settle;
      creditor.balance -= settle;

      if (Math.abs(debtor.balance) < 0.01) dIdx++;
      if (Math.abs(creditor.balance) < 0.01) cIdx++;
    }

    suggestions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'settlement-card card--glow-purple';
      item.style.padding = '12px var(--space-4)';
      item.style.flexDirection = 'column';
      item.style.gap = '8px';

      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <div style="font-size:11px; font-weight:500;">
            <strong style="color:var(--primary-cyan);">${s.fromName}</strong> owes <strong style="color:var(--accent-purple);">${s.toName}</strong>
          </div>
          <div style="font-family:var(--font-mono); font-weight:700; color:var(--accent-green); font-size:13px;">
            ${Utils.formatCurrency(s.amount)}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="width:100%; font-size:10px; padding:4px 0;" onclick="SettlementsModule.openSettleModal('${s.fromUid}', '${s.toUid}', ${s.amount.toFixed(2)})">
          ➔ Instant Settle Up
        </button>
      `;
      container.appendChild(item);
    });
  }

  /**
   * Modal trigger with pre-filled payees
   */
  function openSettleModal(payerUid = null, receiverUid = null, amount = null, id = null, status = 'Settled', notes = '', date = null) {
    document.getElementById('settleForm').reset();
    document.getElementById('settleId').value = id || '';

    // Set title
    document.getElementById('modalTitle').textContent = id ? 'Modify Settlement Record' : 'Record Direct Settle Up';

    // Populate dropdowns if needed (already populated, but let's select matching options)
    if (payerUid) {
      document.getElementById('payer').value = payerUid;
    }
    if (receiverUid) {
      document.getElementById('receiver').value = receiverUid;
    }
    if (amount) {
      document.getElementById('amount').value = parseFloat(amount);
    }
    if (status) {
      document.getElementById('status').value = status;
    }
    if (notes) {
      document.getElementById('notes').value = notes;
    }

    // Set date
    if (date) {
      const dateObj = Utils.toDate(date);
      document.getElementById('date').value = dateObj.toISOString().split('T')[0];
    } else {
      document.getElementById('date').value = new Date().toISOString().split('T')[0];
    }

    UI.openModal('settleModal');
  }

  /**
   * Save Settlement record
   */
  async function saveSettlement() {
    const id = document.getElementById('settleId').value;
    const payer = document.getElementById('payer').value;
    const receiver = document.getElementById('receiver').value;
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const dateStr = document.getElementById('date').value;
    const status = document.getElementById('status').value;
    const notes = document.getElementById('notes').value.trim();

    if (!payer || !receiver || amount <= 0 || !dateStr || !status) {
      UI.showToast('Please fill all required fields.', 'warning');
      return;
    }

    if (payer === receiver) {
      UI.showToast('Payer and receiver cannot be the same member!', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveSettleBtn');
    UI.showButtonSpinner(saveBtn, 'Saving record...');

    const payload = {
      groupId: _groupId,
      payer,
      receiver,
      amount,
      status,
      notes,
      date: firebase.firestore.Timestamp.fromDate(new Date(dateStr))
    };

    let result;
    if (id) {
      result = await FirestoreService.updateDocument('groupSettlements', id, payload);
    } else {
      result = await FirestoreService.addDocument('groupSettlements', payload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(id ? 'Settlement transaction updated.' : 'Direct settlement recorded successfully.', 'success');
      UI.closeModal('settleModal');
      await fetchAndRenderSettlements();
    } else {
      UI.showToast(`Error saving: ${result.error}`, 'error');
    }
  }

  /**
   * Quick status confirm button
   */
  async function markAsSettled(docId) {
    UI.showToast('Confirming settlement...', 'info');
    const result = await FirestoreService.updateDocument('groupSettlements', docId, { status: 'Settled' });
    
    if (result.success) {
      UI.showToast('Settlement confirmed and marked complete!', 'success');
      await fetchAndRenderSettlements();
    } else {
      UI.showToast(`Confirmation failed: ${result.error}`, 'error');
    }
  }

  /**
   * Delete settlement CRUD helper
   */
  async function deleteSettlement(row) {
    if (confirm('Delete this settlement transaction? This will restore members standing balances.')) {
      UI.showToast('Deleting settlement...', 'info');
      const result = await FirestoreService.deleteDocument('groupSettlements', row.id);
      if (result.success) {
        UI.showToast('Settlement deleted.', 'success');
        await fetchAndRenderSettlements();
      } else {
        UI.showToast(`Error deleting: ${result.error}`, 'error');
      }
    }
  }

  /**
   * Export to PDF statement
   */
  function exportPDF() {
    const headers = ['Payer', 'Receiver', 'Status', 'Date', 'Amount'];
    const rows = _rawData.map(s => {
      const payerMem = (_groupDoc.memberDetails || []).find(m => m.uid === s.payer) || {};
      const receiverMem = (_groupDoc.memberDetails || []).find(m => m.uid === s.receiver) || {};
      return [
        payerMem.username || 'User',
        receiverMem.username || 'User',
        s.status,
        Utils.formatDate(s.date, 'short'),
        `₹${(parseFloat(s.amount) || 0).toLocaleString('en-IN')}`
      ];
    });

    PDFExport.exportDataReport('Direct Settlements Statement', headers, rows, 'group-settlements-report.pdf');
  }

  return {
    init,
    openSettleModal,
    saveSettlement,
    markAsSettled,
    exportPDF
  };
})();
