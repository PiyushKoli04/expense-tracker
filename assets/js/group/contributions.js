/* ============================================
   CONTRIBUTIONS — contributions.js
   Group central kitty contributions & weight visualizers
   ============================================ */

const ContributionsModule = (() => {

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

    console.log(`📥 Initializing Kitty Contributions Module for Group: ${_groupId}`);

    try {
      // 1. Fetch group details
      _groupDoc = await FirestoreService.getDocument('groups', _groupId);
      if (!_groupDoc) {
        UI.showToast('Active group not found.', 'error');
        window.location.href = '/pages/group/groups.html';
        return;
      }

      // 2. Setup Contributor dropdown options
      populateDropdowns();

      // 3. Fetch and render data
      await fetchAndRenderContributions();

    } catch (error) {
      console.error('Error initializing contributions:', error);
      UI.showToast('Error loading kitty contributions page.', 'error');
    }
  }

  /**
   * Fill Contributor select box options
   */
  function populateDropdowns() {
    const select = document.getElementById('memberId');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Choose contributor</option>';
    const memberDetails = _groupDoc.memberDetails || [];
    memberDetails.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.uid;
      opt.textContent = m.username + (m.uid === _user.uid ? ' (You)' : '');
      select.appendChild(opt);
    });
  }

  /**
   * Retrieve contributions list and render UI modules
   */
  async function fetchAndRenderContributions() {
    try {
      UI.showLoading('#contributionsTable');

      // Fetch contributions
      _rawData = await FirestoreService.getGroupDocuments('groupContributions', _groupId, { orderBy: 'date', orderDir: 'desc' });

      UI.hideLoading('#contributionsTable');

      // 1. Calculate Aggregations
      renderKittyAggregations(_rawData);

      // 2. Render progressive weight bars
      renderContributionBars(_rawData);

      // 3. Mount reusable TableEngine
      if (!_tableEngine) {
        _tableEngine = new TableEngine({
          tableId: 'contributionsTable',
          toolbarId: 'contributionsToolbar',
          paginationId: 'contributionsPagination',
          columns: [
            { key: 'purpose', label: 'Purpose', sortable: true, searchable: true },
            {
              key: 'memberName',
              label: 'Contributor',
              sortable: true
            },
            { 
              key: 'date', 
              label: 'Deposit Date', 
              sortable: true,
              render: (val) => Utils.formatDate(val, 'short')
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
          onEdit: (row) => openEditModal(row),
          onDelete: (row) => deleteContribution(row),
          emptyMessage: 'No kitty deposits logged. Log the first one above!'
        });
      } else {
        _tableEngine.setData(_rawData);
      }

    } catch (error) {
      console.error('Error fetching contributions:', error);
      UI.showToast('Error loading contributions database.', 'error');
    }
  }

  /**
   * Process top KPI widgets
   */
  function renderKittyAggregations(data) {
    const totalKitty = data.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const userDeposits = data
      .filter(c => c.memberId === _user.uid)
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    const ownershipShare = Utils.calcPercentage(userDeposits, totalKitty);

    Animations.animateCounter('totalKittyVal', totalKitty);
    Animations.animateCounter('userDepositsVal', userDeposits);
    
    const ownerEl = document.getElementById('userOwnershipVal');
    if (ownerEl) ownerEl.textContent = `${ownershipShare}%`;
  }

  /**
   * Render custom visual progress bars
   */
  function renderContributionBars(data) {
    const container = document.getElementById('contributionBarsContainer');
    if (!container) return;

    const totalKitty = data.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    // Group contributions per member
    const contributionsMap = {};
    (_groupDoc.memberDetails || []).forEach(m => {
      contributionsMap[m.uid] = {
        name: m.username,
        amount: 0
      };
    });

    data.forEach(contrib => {
      if (contributionsMap[contrib.memberId]) {
        contributionsMap[contrib.memberId].amount += parseFloat(contrib.amount) || 0;
      }
    });

    const list = Object.values(contributionsMap).sort((a, b) => b.amount - a.amount);

    container.innerHTML = '';

    if (totalKitty === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:32px; color:var(--text-muted); font-size:12px;">
          Empty Kitty. Deposit funds to see visual central weights!
        </div>
      `;
      return;
    }

    list.forEach(m => {
      const pct = Utils.calcPercentage(m.amount, totalKitty);

      const bar = document.createElement('div');
      bar.className = 'contribution-bar';
      
      bar.innerHTML = `
        <span class="contribution-bar__name" style="font-size: 11px; font-weight: 500;" title="${m.name}">${m.name}</span>
        <div class="contribution-bar__track">
          <div class="contribution-bar__fill" style="width: ${pct}%; background: var(--primary-gradient); font-size:9px; height:100%; border-radius:var(--radius-full); display:flex; align-items:center; justify-content:flex-end; padding-right:8px; color:#fff; font-weight:600;">
            ${pct}%
          </div>
        </div>
        <span class="contribution-bar__value" style="font-family:var(--font-mono); font-size:11px; font-weight:600;">
          ${Utils.formatCurrency(m.amount)}
        </span>
      `;
      container.appendChild(bar);
    });
  }

  /**
   * Modal actions
   */
  function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Deposit Central Kitty';
    document.getElementById('contribForm').reset();
    document.getElementById('contribId').value = '';

    // Default contributor is current user
    document.getElementById('memberId').value = _user.uid;
    // Default date is today
    document.getElementById('date').value = new Date().toISOString().split('T')[0];

    UI.openModal('contribModal');
  }

  function openEditModal(contrib) {
    document.getElementById('modalTitle').textContent = 'Modify Kitty Deposit';
    document.getElementById('contribId').value = contrib.id;
    document.getElementById('memberId').value = contrib.memberId;
    document.getElementById('purpose').value = contrib.purpose;
    document.getElementById('amount').value = contrib.amount;
    document.getElementById('notes').value = contrib.notes || '';

    const dateObj = Utils.toDate(contrib.date);
    document.getElementById('date').value = dateObj.toISOString().split('T')[0];

    UI.openModal('contribModal');
  }

  /**
   * Save central contribution payload
   */
  async function saveContribution() {
    const id = document.getElementById('contribId').value;
    const memberId = document.getElementById('memberId').value;
    const purpose = document.getElementById('purpose').value.trim();
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const dateStr = document.getElementById('date').value;
    const notes = document.getElementById('notes').value.trim();

    if (!memberId || !purpose || amount <= 0 || !dateStr) {
      UI.showToast('Please fill all required fields.', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveContribBtn');
    UI.showButtonSpinner(saveBtn, 'Saving deposit...');

    // Lookup memberName to save flat in firestore for quick renders
    const memberObj = (_groupDoc.memberDetails || []).find(m => m.uid === memberId) || {};
    const memberName = memberObj.username || 'User';

    const payload = {
      groupId: _groupId,
      memberId,
      memberName,
      amount,
      purpose,
      date: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
      notes
    };

    let result;
    if (id) {
      result = await FirestoreService.updateDocument('groupContributions', id, payload);
    } else {
      result = await FirestoreService.addDocument('groupContributions', payload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(id ? 'Deposit record updated successfully!' : 'Central kitty deposit logged!', 'success');
      UI.closeModal('contribModal');
      await fetchAndRenderContributions();
    } else {
      UI.showToast(`Error saving contribution: ${result.error}`, 'error');
    }
  }

  /**
   * Delete contribution CRUD helper
   */
  async function deleteContribution(row) {
    if (confirm(`Remove kitty deposit "${row.purpose}" by ${row.memberName}?`)) {
      UI.showToast('Deleting deposit...', 'info');
      const result = await FirestoreService.deleteDocument('groupContributions', row.id);
      if (result.success) {
        UI.showToast('Deposit record deleted.', 'success');
        await fetchAndRenderContributions();
      } else {
        UI.showToast(`Error deleting: ${result.error}`, 'error');
      }
    }
  }

  /**
   * Export to PDF statement
   */
  function exportPDF() {
    const headers = ['Purpose', 'Contributor', 'Date', 'Amount'];
    const rows = _rawData.map(c => [
      c.purpose,
      c.memberName,
      Utils.formatDate(c.date, 'short'),
      `₹${(parseFloat(c.amount) || 0).toLocaleString('en-IN')}`
    ]);

    PDFExport.exportDataReport('Kitty Contributions Statement', headers, rows, 'group-contributions-statement.pdf');
  }

  return {
    init,
    openAddModal,
    saveContribution,
    exportPDF
  };
})();
