/* ============================================
   INVESTMENTS — investments.js
   Personal Investment Portfolio CRUD, Returns & Allocation Charts
   ============================================ */

const InvestmentsModule = (() => {

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

    console.log('📈 Initializing Personal Investments Module...');
    
    // 1. Populate Dropdowns
    populateDropdowns();

    // 2. Fetch and render table + chart
    await fetchAndRenderInvestments();
  }

  function populateDropdowns() {
    const filterType = document.getElementById('filterType');
    if (filterType) {
      filterType.innerHTML = '<option value="">All Asset Types</option>';
      Utils.investmentTypes.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        filterType.appendChild(opt);
      });
    }

    const typeSelect = document.getElementById('type');
    if (typeSelect) {
      typeSelect.innerHTML = '<option value="" disabled selected>Select Asset Type</option>';
      Utils.investmentTypes.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        typeSelect.appendChild(opt);
      });
    }
  }

  /**
   * Retrieve records, render grid metrics, TableEngine and doughnut allocation chart
   */
  async function fetchAndRenderInvestments() {
    try {
      UI.showLoading('#investmentsTable');
      
      _rawData = await FirestoreService.getUserDocuments('personalInvestments', _user.uid, { orderBy: 'purchaseDate', orderDir: 'desc' });
      
      UI.hideLoading('#investmentsTable');

      // Update Aggregations & Charts
      calculateAndRenderAggregations(_rawData);
      renderAllocationChart(_rawData);

      // Create TableEngine instance
      if (!_tableEngine) {
        _tableEngine = new TableEngine({
          tableId: 'investmentsTable',
          toolbarId: 'investmentsToolbar',
          paginationId: 'investmentsPagination',
          columns: [
            { key: 'name', label: 'Asset Name', sortable: true, searchable: true },
            { 
              key: 'type', 
              label: 'Asset Type', 
              sortable: true,
              render: (val) => `<span style="font-size:16px; margin-right:6px;">${Utils.getInvestmentIcon(val)}</span>${val}`
            },
            { 
              key: 'investedAmount', 
              label: 'Invested', 
              sortable: true,
              render: (val) => Utils.formatCurrency(val)
            },
            { 
              key: 'currentValue', 
              label: 'Current Value', 
              sortable: true,
              render: (val) => Utils.formatCurrency(val)
            },
            { 
              key: 'profitLoss',
              label: 'P&L (Returns)',
              sortable: true,
              render: (_, row) => {
                const inv = parseFloat(row.investedAmount) || 0;
                const cur = parseFloat(row.currentValue) || 0;
                const pl = cur - inv;
                const plPct = Utils.calcProfitLossPercent(inv, cur);

                const isPos = pl >= 0;
                const color = isPos ? 'var(--accent-green)' : 'var(--accent-red)';
                const sign = isPos ? '+' : '';

                return `
                  <span style="color:${color}; font-weight:600; font-family:var(--font-mono);">
                    ${sign}${Utils.formatCurrency(pl)}<br>
                    <span style="font-size:10px; opacity:0.8;">${sign}${plPct}%</span>
                  </span>
                `;
              }
            }
          ],
          data: _rawData,
          pageSize: 5,
          onEdit: (row) => openEditAssetModal(row),
          onDelete: (row) => deleteAsset(row),
          emptyMessage: 'No assets tracked in portfolio. Add one above!'
        });
      } else {
        _tableEngine.setData(_rawData);
      }

    } catch (error) {
      console.error('Error fetching investments:', error);
      UI.showToast('Error loading investments portfolio.', 'error');
    }
  }

  /**
   * Process calculations for overview stat cards
   */
  function calculateAndRenderAggregations(data) {
    const totalInvested = data.reduce((acc, curr) => acc + (parseFloat(curr.investedAmount) || 0), 0);
    const totalCurrentVal = data.reduce((acc, curr) => acc + (parseFloat(curr.currentValue) || 0), 0);
    
    const profitLoss = totalCurrentVal - totalInvested;
    const profitLossPct = Utils.calcProfitLossPercent(totalInvested, totalCurrentVal);

    // Group assets to find primary allocation type
    const typeTotals = {};
    data.forEach(asset => {
      typeTotals[asset.type] = (typeTotals[asset.type] || 0) + (parseFloat(asset.currentValue) || 0);
    });

    let topType = '—';
    let maxVal = 0;
    for (const [type, val] of Object.entries(typeTotals)) {
      if (val > maxVal) {
        maxVal = val;
        topType = `${Utils.getInvestmentIcon(type)} ${type}`;
      }
    }

    Animations.animateCounter('totalInvestedVal', totalInvested);
    Animations.animateCounter('currentValueVal', totalCurrentVal);
    Animations.animateCounter('totalProfitLossVal', profitLoss);
    
    const plPctEl = document.getElementById('totalProfitLossPctVal');
    const plIconEl = document.getElementById('plIcon');

    if (plPctEl) {
      if (profitLoss >= 0) {
        plPctEl.className = 'stat-card__change stat-card__change--up';
        plPctEl.textContent = `+${profitLossPct}% profit`;
        if (plIconEl) {
          plIconEl.className = 'stat-card__icon stat-card__icon--green';
          plIconEl.textContent = '📈';
        }
      } else {
        plPctEl.className = 'stat-card__change stat-card__change--down';
        plPctEl.textContent = `${profitLossPct}% loss`;
        if (plIconEl) {
          plIconEl.className = 'stat-card__icon stat-card__icon--red';
          plIconEl.textContent = '📉';
        }
      }
    }

    const topAllocEl = document.getElementById('topAllocationVal');
    if (topAllocEl) topAllocEl.innerHTML = topType;
  }

  /**
   * Generates weight allocation doughnut chart by asset type
   */
  function renderAllocationChart(data) {
    const typeMap = {};
    data.forEach(asset => {
      const type = asset.type || 'Other';
      typeMap[type] = (typeMap[type] || 0) + (parseFloat(asset.currentValue) || 0);
    });

    const labels = Object.keys(typeMap);
    const chartData = Object.values(typeMap);

    if (labels.length > 0) {
      Charts.createDoughnutChart('allocationChart', labels, chartData);
    } else {
      // Empty placeholder
      const canvas = document.getElementById('allocationChart');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '13px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No assets to display allocations', canvas.width / 2, canvas.height / 2);
      }
    }
  }

  /**
   * Modal actions
   */
  function openAddAssetModal() {
    document.getElementById('modalTitle').textContent = 'Add Portfolio Asset';
    document.getElementById('assetForm').reset();
    document.getElementById('assetId').value = '';
    
    document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];

    UI.openModal('assetModal');
  }

  function openEditAssetModal(asset) {
    document.getElementById('modalTitle').textContent = 'Edit Portfolio Asset';
    document.getElementById('assetId').value = asset.id;
    document.getElementById('name').value = asset.name;
    document.getElementById('type').value = asset.type;
    document.getElementById('investedAmount').value = asset.investedAmount;
    document.getElementById('currentValue').value = asset.currentValue;
    document.getElementById('notes').value = asset.notes || '';

    const purDate = Utils.toDate(asset.purchaseDate);
    document.getElementById('purchaseDate').value = purDate.toISOString().split('T')[0];

    UI.openModal('assetModal');
  }

  /**
   * Save Asset Document
   */
  async function saveAsset() {
    const id = document.getElementById('assetId').value;
    const name = document.getElementById('name').value.trim();
    const type = document.getElementById('type').value;
    const investedAmount = parseFloat(document.getElementById('investedAmount').value);
    const currentValue = parseFloat(document.getElementById('currentValue').value);
    const purchaseDateStr = document.getElementById('purchaseDate').value;
    const notes = document.getElementById('notes').value.trim();

    if (!name || !type || isNaN(investedAmount) || investedAmount < 0 || isNaN(currentValue) || currentValue < 0 || !purchaseDateStr) {
      UI.showToast('Please enter required details correctly.', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveAssetBtn');
    UI.showButtonSpinner(saveBtn, 'Saving Asset...');

    const payload = {
      userId: _user.uid,
      name,
      type,
      investedAmount,
      currentValue,
      purchaseDate: firebase.firestore.Timestamp.fromDate(new Date(purchaseDateStr)),
      profitLoss: currentValue - investedAmount,
      notes
    };

    let result;
    if (id) {
      result = await FirestoreService.updateDocument('personalInvestments', id, payload);
    } else {
      result = await FirestoreService.addDocument('personalInvestments', payload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(id ? 'Asset updated!' : 'Portfolio asset added!', 'success');
      UI.closeModal('assetModal');
      await fetchAndRenderInvestments();
    } else {
      UI.showToast(`Error saving asset: ${result.error}`, 'error');
    }
  }

  /**
   * Delete Asset Detail
   */
  async function deleteAsset(asset) {
    if (confirm(`Are you sure you want to delete portfolio asset "${asset.name}"?`)) {
      UI.showToast('Deleting portfolio asset...', 'info');
      const result = await FirestoreService.deleteDocument('personalInvestments', asset.id);
      
      if (result.success) {
        UI.showToast('Asset deleted from portfolio.', 'success');
        await fetchAndRenderInvestments();
      } else {
        UI.showToast(`Delete failed: ${result.error}`, 'error');
      }
    }
  }

  /**
   * Export to PDF statement
   */
  function exportPDF() {
    const headers = ['Asset Name', 'Asset Type', 'Invested Principal', 'Current Value', 'Returns (P&L)'];
    const rows = _rawData.map(asset => {
      const inv = parseFloat(asset.investedAmount) || 0;
      const cur = parseFloat(asset.currentValue) || 0;
      const pl = cur - inv;
      const plPct = Utils.calcProfitLossPercent(inv, cur);
      const sign = pl >= 0 ? '+' : '';

      return [
        asset.name,
        asset.type,
        `₹${inv.toLocaleString('en-IN')}`,
        `₹${cur.toLocaleString('en-IN')}`,
        `${sign}₹${pl.toLocaleString('en-IN')} (${sign}${plPct}%)`
      ];
    });

    PDFExport.exportDataReport('Personal Investments Portfolio', headers, rows, 'investments-report.pdf');
  }

  return {
    init,
    openAddAssetModal,
    openEditAssetModal,
    saveAsset,
    deleteAsset,
    exportPDF
  };
})();
