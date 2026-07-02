/* ============================================
   INCOME — income.js
   Personal Income Inflow CRUD, Filtering, Aggregations
   ============================================ */

const IncomeModule = (() => {

  let _user = null;
  let _profile = null;
  let _tableEngine = null;
  let _rawData = [];

  /**
   * Module initialization hook
   */
  async function init(user, profile) {
    _user = user;
    _profile = profile;

    console.log('💵 Initializing Personal Income Module...');
    
    // Fetch data and build table
    await fetchAndRenderIncome();
  }

  /**
   * Retrieve records and bind TableEngine
   */
  async function fetchAndRenderIncome() {
    try {
      UI.showLoading('#incomeTable');
      
      _rawData = await FirestoreService.getUserDocuments('personalIncome', _user.uid, { orderBy: 'date', orderDir: 'desc' });
      
      UI.hideLoading('#incomeTable');

      // Update Aggregation Stats
      calculateAndRenderAggregations(_rawData);

      // Create TableEngine instance if not created
      if (!_tableEngine) {
        _tableEngine = new TableEngine({
          tableId: 'incomeTable',
          toolbarId: 'incomeToolbar',
          paginationId: 'incomePagination',
          columns: [
            { key: 'source', label: 'Revenue Source', sortable: true, searchable: true },
            { 
              key: 'date', 
              label: 'Inflow Date', 
              sortable: true,
              render: (val) => Utils.formatDate(val, 'short')
            },
            {
              key: 'notes',
              label: 'Notes',
              render: (val) => val ? Utils.truncate(val, 40) : '—'
            },
            {
              key: 'amount',
              label: 'Amount',
              sortable: true,
              class: 'cell-amount cell-amount--positive',
              render: (val) => Utils.formatCurrency(val, true)
            }
          ],
          data: _rawData,
          pageSize: 10,
          onEdit: (row) => openEditModal(row),
          onDelete: (row) => deleteIncome(row),
          emptyMessage: 'No income logged. Add one above!'
        });
      } else {
        _tableEngine.setData(_rawData);
      }

    } catch (error) {
      console.error('Error fetching income:', error);
      UI.showToast('Error fetching income items.', 'error');
    }
  }

  /**
   * Calculate aggregates for summary cards
   */
  function calculateAndRenderAggregations(data) {
    const currentMonth = Utils.getCurrentMonth();
    
    const totalIncome = data.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    
    const thisMonthIncome = data
      .filter(inc => {
        const d = Utils.toDate(inc.date);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return monthStr === currentMonth;
      })
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    // Group sources to find Top Revenue Source
    const sourcesMap = {};
    data.forEach(inc => {
      sourcesMap[inc.source] = (sourcesMap[inc.source] || 0) + (parseFloat(inc.amount) || 0);
    });

    let topSource = '—';
    let maxAmt = 0;
    for (const [source, amt] of Object.entries(sourcesMap)) {
      if (amt > maxAmt) {
        maxAmt = amt;
        topSource = source;
      }
    }

    Animations.animateCounter('totalIncomeVal', totalIncome);
    Animations.animateCounter('monthIncomeVal', thisMonthIncome);
    
    const topSourceEl = document.getElementById('topSourceVal');
    if (topSourceEl) topSourceEl.textContent = topSource;
  }

  /**
   * Modal actions
   */
  function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add Income';
    document.getElementById('incomeForm').reset();
    document.getElementById('incomeId').value = '';
    
    // Set default date to today
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    
    UI.openModal('incomeModal');
  }

  function openEditModal(income) {
    document.getElementById('modalTitle').textContent = 'Edit Income';
    document.getElementById('incomeId').value = income.id;
    document.getElementById('source').value = income.source;
    document.getElementById('amount').value = income.amount;
    document.getElementById('notes').value = income.notes || '';
    
    // Format date properly for HTML input
    const dateObj = Utils.toDate(income.date);
    document.getElementById('date').value = dateObj.toISOString().split('T')[0];

    UI.openModal('incomeModal');
  }

  /**
   * Add or Edit CRUD save
   */
  async function saveIncome() {
    const form = document.getElementById('incomeForm');
    const id = document.getElementById('incomeId').value;
    const source = document.getElementById('source').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const dateStr = document.getElementById('date').value;
    const notes = document.getElementById('notes').value.trim();

    // Verification
    if (!source || isNaN(amount) || amount <= 0 || !dateStr) {
      UI.showToast('Please fill all required fields correctly.', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveIncomeBtn');
    UI.showButtonSpinner(saveBtn, 'Saving...');

    const incomePayload = {
      userId: _user.uid,
      source,
      amount,
      date: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
      notes
    };

    let result;
    if (id) {
      // Edit
      result = await FirestoreService.updateDocument('personalIncome', id, incomePayload);
    } else {
      // Add new
      result = await FirestoreService.addDocument('personalIncome', incomePayload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(id ? 'Income updated!' : 'Income added!', 'success');
      UI.closeModal('incomeModal');
      
      // Reload records
      await fetchAndRenderIncome();
    } else {
      UI.showToast(`Failed to save: ${result.error}`, 'error');
    }
  }

  /**
   * Delete Action
   */
  async function deleteIncome(income) {
    if (confirm(`Are you sure you want to delete "${income.source}"?`)) {
      UI.showToast('Deleting income...', 'info');
      const result = await FirestoreService.deleteDocument('personalIncome', income.id);
      
      if (result.success) {
        UI.showToast('Income deleted.', 'success');
        await fetchAndRenderIncome();
      } else {
        UI.showToast(`Delete failed: ${result.error}`, 'error');
      }
    }
  }

  /**
   * Export to PDF statement
   */
  function exportPDF() {
    const headers = ['Source', 'Date', 'Notes', 'Amount'];
    const rows = _rawData.map(inc => [
      inc.source,
      Utils.formatDate(inc.date, 'short'),
      inc.notes || '—',
      `+₹${(parseFloat(inc.amount) || 0).toLocaleString('en-IN')}`
    ]);

    PDFExport.exportDataReport('Personal Income Statement', headers, rows, 'income-report.pdf');
  }

  return {
    init,
    openAddModal,
    saveIncome,
    exportPDF
  };
})();
