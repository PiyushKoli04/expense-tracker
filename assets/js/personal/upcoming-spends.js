/* ============================================
   UPCOMING SPENDS — upcoming-spends.js
   Scenario simulation checklist & balance timeline forecasting
   ============================================ */

const UpcomingSpendsModule = (() => {

  let _user = null;
  let _profile = null;
  let _tableEngine = null;
  let _rawData = [];
  let _checkedSpendIds = [];
  let _currentLiquidBalance = 0;
  let _totalIncome = 0;
  let _forecastChartInstance = null;

  /**
   * Module initialization hook
   */
  async function init(user, profile) {
    _user = user;
    _profile = profile;

    console.log('📅 Initializing Personal Upcoming Spends Module...');

    // 1. Set up event delegation on the table for checkboxes and "Mark as Spent" buttons
    const tableEl = document.getElementById('upcomingTable');
    if (tableEl) {
      // Checkbox scenario toggles
      tableEl.addEventListener('change', (e) => {
        if (e.target.classList.contains('simulation-checkbox')) {
          const spendId = e.target.dataset.spendId;
          const isChecked = e.target.checked;
          
          if (isChecked) {
            if (!_checkedSpendIds.includes(spendId)) {
              _checkedSpendIds.push(spendId);
            }
          } else {
            _checkedSpendIds = _checkedSpendIds.filter(id => id !== spendId);
          }
          
          updateSimulationsAndForecast();
        }
      });

      // Mark as Spent buttons
      tableEl.addEventListener('click', async (e) => {
        const markBtn = e.target.closest('.btn-mark-spent');
        if (markBtn) {
          e.stopPropagation();
          const spendId = markBtn.dataset.spendId;
          const spend = _rawData.find(s => s.id === spendId);
          if (spend) {
            await markAsSpent(spend);
          }
        }
      });
    }

    // 2. Populate Category dropdowns
    populateDropdowns();

    // 3. Load collections & render UI
    await fetchAndRenderSpends(true);
  }

  /**
   * Fill category select fields in forms/filters
   */
  function populateDropdowns() {
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
  }

  /**
   * Fetch relevant collections and render the table
   */
  async function fetchAndRenderSpends(resetCheckboxes = false) {
    try {
      UI.showLoading('#upcomingTable');

      // Fetch personal finance datasets concurrently
      const [income, expenses, investments, spends] = await Promise.all([
        FirestoreService.getUserDocuments('personalIncome', _user.uid),
        FirestoreService.getUserDocuments('personalExpenses', _user.uid),
        FirestoreService.getUserDocuments('personalInvestments', _user.uid),
        FirestoreService.getUserDocuments('upcomingSpends', _user.uid, { orderBy: 'expectedDate', orderDir: 'asc' })
      ]);

      UI.hideLoading('#upcomingTable');

      // 1. Calculate liquid balance: Income - Expenses - Invested Principal
      _totalIncome = income.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
      const totalExpenses = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
      const totalInvested = investments.reduce((acc, curr) => acc + (parseFloat(curr.investedAmount) || 0), 0);
      
      _currentLiquidBalance = _totalIncome - totalExpenses - totalInvested;

      // Update liquid balance counter visually
      Animations.animateCounter('currentLiquidBalanceVal', _currentLiquidBalance);

      _rawData = spends;

      // 2. Manage initial scenario builder selection state (default: all checked)
      if (resetCheckboxes || _checkedSpendIds.length === 0) {
        _checkedSpendIds = spends.map(s => s.id);
      } else {
        // Purge any stale IDs that no longer exist
        const allIds = spends.map(s => s.id);
        _checkedSpendIds = _checkedSpendIds.filter(id => allIds.includes(id));
      }

      // 3. Initialize or update TableEngine
      if (!_tableEngine) {
        _tableEngine = new TableEngine({
          tableId: 'upcomingTable',
          toolbarId: 'upcomingToolbar',
          paginationId: 'upcomingPagination',
          columns: [
            {
              key: 'isChecked',
              label: 'Active',
              class: 'checkbox-cell',
              render: (val, row) => {
                const isChecked = _checkedSpendIds.includes(row.id);
                return `<input type="checkbox" class="simulation-checkbox" data-spend-id="${row.id}" ${isChecked ? 'checked' : ''}>`;
              }
            },
            { key: 'title', label: 'Spend Item', sortable: true, searchable: true },
            {
              key: 'category',
              label: 'Category',
              sortable: true,
              render: (val) => `<span style="font-size:16px; margin-right:6px;">${Utils.getCategoryIcon(val)}</span>${val}`
            },
            {
              key: 'expectedDate',
              label: 'Expected Date',
              sortable: true,
              render: (val) => Utils.formatDate(val, 'short')
            },
            {
              key: 'status',
              label: 'Status',
              sortable: true,
              render: (val) => {
                const isConfirmed = val === 'Confirmed';
                return `<span class="badge badge--${isConfirmed ? 'cyan' : 'muted'}">${val}</span>`;
              }
            },
            {
              key: 'amount',
              label: 'Amount',
              sortable: true,
              class: 'cell-amount cell-amount--negative',
              render: (val) => Utils.formatCurrency(val)
            },
            {
              key: 'actionMark',
              label: 'Convert',
              class: 'cell-actions-custom',
              render: (val, row) => {
                return `
                  <button class="btn btn-secondary btn-xs btn-mark-spent" data-spend-id="${row.id}" style="padding: 4px 8px; font-size: 11px; display:inline-flex; align-items:center; gap:4px;">
                    <i data-lucide="check" style="width:12px; height:12px;"></i> Spent
                  </button>
                `;
              }
            }
          ],
          data: _rawData,
          pageSize: 10,
          onEdit: (row) => openEditModal(row),
          onDelete: (row) => deleteSpend(row),
          emptyMessage: 'No upcoming spends planned. Set a new future purchase!'
        });
      } else {
        _tableEngine.setData(_rawData);
      }

      // 4. Calculate scenario impact & render visual chart
      updateSimulationsAndForecast();

    } catch (error) {
      console.error('Error fetching planned spends:', error);
      UI.showToast('Error loading upcoming spends.', 'error');
    }
  }

  /**
   * Dynamic calculations, deficit warnings, timeline projections and Chart drawing
   */
  function updateSimulationsAndForecast() {
    // 1. Calculate checked planned outflows
    const checkedSpends = _rawData.filter(s => _checkedSpendIds.includes(s.id));
    const totalUpcomingAmount = checkedSpends.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const simulatedRemaining = _currentLiquidBalance - totalUpcomingAmount;

    Animations.animateCounter('totalUpcomingVal', totalUpcomingAmount);
    Animations.animateCounter('simulatedRemainingVal', simulatedRemaining);

    // Update simulation counters summary
    const countEl = document.getElementById('activeSpendsCount');
    if (countEl) {
      countEl.textContent = `${checkedSpends.length} of ${_rawData.length} plans simulated`;
    }

    const simAlertEl = document.getElementById('simulatedBalanceAlertText');
    const projectedIconEl = document.getElementById('projectedBalanceIcon');
    if (simulatedRemaining >= 0) {
      if (simAlertEl) {
        simAlertEl.textContent = 'Cash Reserve Secure';
        simAlertEl.className = 'stat-card__change stat-card__change--up';
      }
      if (projectedIconEl) {
        projectedIconEl.className = 'stat-card__icon stat-card__icon--green';
      }
    } else {
      if (simAlertEl) {
        simAlertEl.textContent = 'Deficit Risk Detected!';
        simAlertEl.className = 'stat-card__change stat-card__change--down';
      }
      if (projectedIconEl) {
        projectedIconEl.className = 'stat-card__icon stat-card__icon--red';
      }
    }

    // 2. Strategic Planner Advice
    const liquidityRatioEl = document.getElementById('liquidityRatioVal');
    if (liquidityRatioEl) {
      const ratio = _totalIncome > 0 ? (simulatedRemaining / _totalIncome) * 100 : 0;
      liquidityRatioEl.textContent = `${ratio.toFixed(1)}% Liquid`;
    }

    // 3. Evaluate Step-by-Step Chronological Cash Flow to find first Deficit Date
    const sortedActiveSpends = [...checkedSpends].sort((a, b) => {
      return Utils.toDate(a.expectedDate).getTime() - Utils.toDate(b.expectedDate).getTime();
    });

    let runningBalance = _currentLiquidBalance;
    let deficitItem = null;
    let deficitDate = null;
    let minBalance = _currentLiquidBalance;

    for (const spend of sortedActiveSpends) {
      runningBalance -= (parseFloat(spend.amount) || 0);
      if (runningBalance < 0 && deficitItem === null) {
        deficitItem = spend.title;
        deficitDate = Utils.formatDate(spend.expectedDate, 'short');
      }
      if (runningBalance < minBalance) {
        minBalance = runningBalance;
      }
    }

    const alertContainer = document.getElementById('deficitAlertContainer');
    const alertMessage = document.getElementById('deficitAlertMessage');

    if (deficitItem !== null && alertContainer && alertMessage) {
      alertContainer.style.display = 'block';
      alertMessage.innerHTML = `Your liquidity falls into a deficit (projected min: <strong>${Utils.formatCurrency(minBalance)}</strong>) on <strong>${deficitDate}</strong> due to purchase item <strong>"${deficitItem}"</strong>. Consider adjusting date schedules or scaling back optional spending.`;
    } else if (alertContainer) {
      alertContainer.style.display = 'none';
    }

    // 4. Construct stepped coordinates list for Chart timeline
    const dateMap = {};
    sortedActiveSpends.forEach(spend => {
      const dateStr = Utils.formatDate(spend.expectedDate, 'short');
      if (!dateMap[dateStr]) dateMap[dateStr] = 0;
      dateMap[dateStr] += (parseFloat(spend.amount) || 0);
    });

    const labels = ['Today'];
    const chartData = [_currentLiquidBalance];
    let chartRunning = _currentLiquidBalance;

    for (const [dateStr, amt] of Object.entries(dateMap)) {
      chartRunning -= amt;
      labels.push(dateStr);
      chartData.push(chartRunning);
    }

    // 5. Draw Forecast Line Chart
    const canvas = document.getElementById('forecastChart');
    if (canvas) {
      if (_forecastChartInstance) {
        _forecastChartInstance.destroy();
      }

      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 200);
      
      const hasDeficit = minBalance < 0;
      if (hasDeficit) {
        gradient.addColorStop(0, 'rgba(255, 82, 82, 0.22)');
        gradient.addColorStop(1, 'rgba(255, 82, 82, 0)');
      } else {
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0.22)');
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');
      }

      const lineColor = hasDeficit ? '#FF5252' : '#00D4FF';

      _forecastChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Projected Balance',
            data: chartData,
            borderColor: lineColor,
            borderWidth: 3,
            backgroundColor: gradient,
            fill: true,
            stepped: true, // Step curve matches cashflow timeline steps
            tension: 0,
            pointBackgroundColor: lineColor,
            pointBorderColor: '#111827',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { weight: '500' } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              border: { dash: [4, 4] }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  }

  /**
   * Action: Open Modal Dialog for addition
   */
  function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add Planned Spend';
    document.getElementById('upcomingForm').reset();
    document.getElementById('spendId').value = '';
    
    // Default expected date to today + 7 days
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    document.getElementById('expectedDate').value = nextWeek.toISOString().split('T')[0];
    
    UI.openModal('upcomingModal');
  }

  /**
   * Action: Open Modal Dialog for edit
   */
  function openEditModal(spend) {
    document.getElementById('modalTitle').textContent = 'Edit Planned Spend';
    document.getElementById('spendId').value = spend.id;
    document.getElementById('title').value = spend.title;
    document.getElementById('amount').value = spend.amount;
    document.getElementById('category').value = spend.category;
    document.getElementById('status').value = spend.status;
    document.getElementById('notes').value = spend.notes || '';

    const dateObj = Utils.toDate(spend.expectedDate);
    document.getElementById('expectedDate').value = dateObj.toISOString().split('T')[0];

    UI.openModal('upcomingModal');
  }

  /**
   * Action: Save Planned Spend CRUD operation
   */
  async function saveSpend() {
    const id = document.getElementById('spendId').value;
    const title = document.getElementById('title').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const dateStr = document.getElementById('expectedDate').value;
    const category = document.getElementById('category').value;
    const status = document.getElementById('status').value;
    const notes = document.getElementById('notes').value.trim();

    if (!title || isNaN(amount) || amount <= 0 || !dateStr || !category || !status) {
      UI.showToast('Please fill all required fields correctly.', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveSpendBtn');
    UI.showButtonSpinner(saveBtn, 'Saving...');

    const spendPayload = {
      userId: _user.uid,
      title,
      amount,
      expectedDate: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
      category,
      status,
      notes
    };

    let result;
    if (id) {
      result = await FirestoreService.updateDocument('upcomingSpends', id, spendPayload);
    } else {
      result = await FirestoreService.addDocument('upcomingSpends', spendPayload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(id ? 'Planned spend updated!' : 'Planned spend added!', 'success');
      UI.closeModal('upcomingModal');
      
      // Reload spends (preserving checks)
      await fetchAndRenderSpends(false);
    } else {
      UI.showToast(`Failed to save plan: ${result.error}`, 'error');
    }
  }

  /**
   * Action: Delete Planned Spend
   */
  async function deleteSpend(spend) {
    if (confirm(`Are you sure you want to delete planned spend "${spend.title}"?`)) {
      UI.showToast('Deleting plan...', 'info');
      const result = await FirestoreService.deleteDocument('upcomingSpends', spend.id);
      
      if (result.success) {
        UI.showToast('Planned spend removed.', 'success');
        await fetchAndRenderSpends(false);
      } else {
        UI.showToast(`Delete failed: ${result.error}`, 'error');
      }
    }
  }

  /**
   * Action: Toggle All Simulation Checkboxes
   */
  function toggleAllCheckboxes(checked) {
    if (checked) {
      _checkedSpendIds = _rawData.map(s => s.id);
    } else {
      _checkedSpendIds = [];
    }

    // Refresh visual check states in TableEngine
    if (_tableEngine) {
      _tableEngine.render();
    }
    
    updateSimulationsAndForecast();
  }

  /**
   * Integration: Record Planned Spend as actual Expense
   */
  async function markAsSpent(spend) {
    const confirmMessage = `Do you want to log "${spend.title}" as an actual expense?\n\nThis will remove it from Planned Spends and create a corresponding entry in your Expense Log today.`;
    
    if (confirm(confirmMessage)) {
      try {
        UI.showToast('Converting to actual expense...', 'info');
        
        const originalDateStr = Utils.formatDate(spend.expectedDate, 'short');
        const expensePayload = {
          userId: _user.uid,
          title: spend.title,
          amount: parseFloat(spend.amount),
          date: firebase.firestore.Timestamp.fromDate(new Date()), // Transaction occurred today
          category: spend.category,
          paymentMethod: 'Cash', // Default transaction method
          tags: ['Planned Spend'],
          notes: spend.notes ? `${spend.notes}\n\n(Originally planned for ${originalDateStr})` : `Converted from planned spend originally expected on ${originalDateStr}.`
        };

        // 1. Add to personalExpenses collection
        const addResult = await FirestoreService.addDocument('personalExpenses', expensePayload);
        if (!addResult.success) {
          throw new Error(addResult.error);
        }

        // 2. Remove from upcomingSpends collection
        const deleteResult = await FirestoreService.deleteDocument('upcomingSpends', spend.id);
        if (!deleteResult.success) {
          throw new Error(deleteResult.error);
        }

        UI.showToast('Planned spend successfully recorded as an actual expense!', 'success');
        
        // 3. Reload Spends (clearing selection since item is deleted)
        await fetchAndRenderSpends(false);

      } catch (error) {
        console.error('Conversion to expense failed:', error);
        UI.showToast(`Conversion failed: ${error.message}`, 'error');
      }
    }
  }

  return {
    init,
    openAddModal,
    saveSpend,
    toggleAllCheckboxes
  };
})();
