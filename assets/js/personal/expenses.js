/* ============================================
   EXPENSES — expenses.js
   Personal Expenses CRUD, Filtering, Aggregations
   ============================================ */

const ExpensesModule = (() => {

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

    console.log('💸 Initializing Personal Expenses Module...');
    
    // 1. Populate Dropdowns
    populateDropdowns();

    // 2. Fetch data and construct table
    await fetchAndRenderExpenses();
  }

  /**
   * Fill category & payment options in forms/filters
   */
  function populateDropdowns() {
    // 1. Category Dropdowns
    const filterCategory = document.getElementById('filterCategory');
    if (filterCategory) {
      filterCategory.innerHTML = '<option value="">All Categories</option>';
      Utils.expenseCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        filterCategory.appendChild(opt);
      });
    }

    const category = document.getElementById('category');
    if (category) {
      category.innerHTML = '<option value="" disabled selected>Select Category</option>';
      Utils.expenseCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        category.appendChild(opt);
      });
    }

    // 2. Payment Method Dropdowns
    const filterPayment = document.getElementById('filterPayment');
    if (filterPayment) {
      filterPayment.innerHTML = '<option value="">All Methods</option>';
      Utils.paymentMethods.forEach(method => {
        const opt = document.createElement('option');
        opt.value = method;
        opt.textContent = method;
        filterPayment.appendChild(opt);
      });
    }

    const paymentMethod = document.getElementById('paymentMethod');
    if (paymentMethod) {
      paymentMethod.innerHTML = '<option value="" disabled selected>Select Payment Method</option>';
      Utils.paymentMethods.forEach(method => {
        const opt = document.createElement('option');
        opt.value = method;
        opt.textContent = method;
        paymentMethod.appendChild(opt);
      });
    }
  }

  /**
   * Retrieve records and bind TableEngine
   */
  async function fetchAndRenderExpenses() {
    try {
      UI.showLoading('#expensesTable');
      
      _rawData = await FirestoreService.getUserDocuments('personalExpenses', _user.uid, { orderBy: 'date', orderDir: 'desc' });
      
      UI.hideLoading('#expensesTable');

      // Update Aggregation Stats
      calculateAndRenderAggregations(_rawData);

      // Create TableEngine instance if not created
      if (!_tableEngine) {
        _tableEngine = new TableEngine({
          tableId: 'expensesTable',
          toolbarId: 'expensesToolbar',
          paginationId: 'expensesPagination',
          columns: [
            { key: 'title', label: 'Title', sortable: true, searchable: true },
            { 
              key: 'category', 
              label: 'Category', 
              sortable: true,
              render: (val) => `<span style="font-size:16px; margin-right:6px;">${Utils.getCategoryIcon(val)}</span>${val}`
            },
            { key: 'paymentMethod', label: 'Method', sortable: true },
            { 
              key: 'date', 
              label: 'Date', 
              sortable: true,
              render: (val) => Utils.formatDate(val, 'short')
            },
            {
              key: 'tags',
              label: 'Tags',
              render: (val) => {
                if (!val || val.length === 0) return '—';
                const arr = Array.isArray(val) ? val : String(val).split(',').map(t => t.trim());
                return arr.map(tag => `<span class="badge badge--cyan">${tag}</span>`).join(' ');
              }
            },
            {
              key: 'amount',
              label: 'Amount',
              sortable: true,
              class: 'cell-amount cell-amount--negative',
              render: (val) => Utils.formatCurrency(val)
            }
          ],
          data: _rawData,
          pageSize: 10,
          onEdit: (row) => openEditModal(row),
          onDelete: (row) => deleteExpense(row),
          emptyMessage: 'No expenses logged. Add one above!'
        });
      } else {
        _tableEngine.setData(_rawData);
      }

    } catch (error) {
      console.error('Error fetching expenses:', error);
      UI.showToast('Error fetching expense items.', 'error');
    }
  }

  /**
   * Math summaries for top cards
   */
  function calculateAndRenderAggregations(data) {
    const currentMonth = Utils.getCurrentMonth();
    
    const totalExpenses = data.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    
    const thisMonthExpenses = data
      .filter(exp => {
        const d = Utils.toDate(exp.date);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return monthStr === currentMonth;
      })
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    // Group categories to find Top Category
    const categoriesMap = {};
    data.forEach(exp => {
      categoriesMap[exp.category] = (categoriesMap[exp.category] || 0) + (parseFloat(exp.amount) || 0);
    });

    let topCategory = '—';
    let maxAmt = 0;
    for (const [cat, amt] of Object.entries(categoriesMap)) {
      if (amt > maxAmt) {
        maxAmt = amt;
        topCategory = `${Utils.getCategoryIcon(cat)} ${cat}`;
      }
    }

    Animations.animateCounter('totalExpensesVal', totalExpenses);
    Animations.animateCounter('monthExpensesVal', thisMonthExpenses);
    
    const topCatEl = document.getElementById('topCategoryVal');
    if (topCatEl) topCatEl.innerHTML = topCategory;
  }

  /**
   * Modal actions
   */
  function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add Expense';
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = '';
    
    // Set default date to today
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    
    UI.openModal('expenseModal');
  }

  function openEditModal(expense) {
    document.getElementById('modalTitle').textContent = 'Edit Expense';
    document.getElementById('expenseId').value = expense.id;
    document.getElementById('title').value = expense.title;
    document.getElementById('amount').value = expense.amount;
    document.getElementById('category').value = expense.category;
    document.getElementById('paymentMethod').value = expense.paymentMethod;
    document.getElementById('notes').value = expense.notes || '';
    
    // Format date properly for HTML input
    const dateObj = Utils.toDate(expense.date);
    document.getElementById('date').value = dateObj.toISOString().split('T')[0];

    const tagsArr = Array.isArray(expense.tags) ? expense.tags : [];
    document.getElementById('tags').value = tagsArr.join(', ');

    UI.openModal('expenseModal');
  }

  /**
   * Add or Edit CRUD save
   */
  async function saveExpense() {
    const form = document.getElementById('expenseForm');
    const id = document.getElementById('expenseId').value;
    const title = document.getElementById('title').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const dateStr = document.getElementById('date').value;
    const category = document.getElementById('category').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const tagsVal = document.getElementById('tags').value;
    const notes = document.getElementById('notes').value.trim();

    // Verification
    if (!title || isNaN(amount) || amount <= 0 || !dateStr || !category || !paymentMethod) {
      UI.showToast('Please fill all required fields correctly.', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveExpenseBtn');
    UI.showButtonSpinner(saveBtn, 'Saving...');

    const tags = tagsVal ? tagsVal.split(',').map(t => t.trim()).filter(Boolean) : [];

    const expensePayload = {
      userId: _user.uid,
      title,
      amount,
      date: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
      category,
      paymentMethod,
      tags,
      notes
    };

    let result;
    if (id) {
      // Edit
      result = await FirestoreService.updateDocument('personalExpenses', id, expensePayload);
    } else {
      // Add new
      result = await FirestoreService.addDocument('personalExpenses', expensePayload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(id ? 'Expense updated!' : 'Expense added!', 'success');
      UI.closeModal('expenseModal');
      
      // Reload records
      await fetchAndRenderExpenses();
    } else {
      UI.showToast(`Failed to save: ${result.error}`, 'error');
    }
  }

  /**
   * Delete Action
   */
  async function deleteExpense(expense) {
    if (confirm(`Are you sure you want to delete "${expense.title}"?`)) {
      UI.showToast('Deleting expense...', 'info');
      const result = await FirestoreService.deleteDocument('personalExpenses', expense.id);
      
      if (result.success) {
        UI.showToast('Expense deleted.', 'success');
        await fetchAndRenderExpenses();
      } else {
        UI.showToast(`Delete failed: ${result.error}`, 'error');
      }
    }
  }

  /**
   * Export to PDF statement
   */
  function exportPDF() {
    const headers = ['Title', 'Category', 'Method', 'Date', 'Amount'];
    const rows = _rawData.map(exp => [
      exp.title,
      exp.category,
      exp.paymentMethod,
      Utils.formatDate(exp.date, 'short'),
      `₹${(parseFloat(exp.amount) || 0).toLocaleString('en-IN')}`
    ]);

    PDFExport.exportDataReport('Personal Expense Statement', headers, rows, 'expenses-report.pdf');
  }

  return {
    init,
    openAddModal,
    saveExpense,
    exportPDF
  };
})();
