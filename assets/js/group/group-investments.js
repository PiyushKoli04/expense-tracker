/* ============================================
   GROUP INVESTMENTS — group-investments.js
   Group Shared Asset co-ownership P&L and equity allocations
   ============================================ */

const GroupInvestmentsModule = (() => {

  let _user = null;
  let _profile = null;
  let _groupId = null;
  let _groupDoc = null;
  let _tableEngine = null;
  let _rawData = [];

  // Chart instance reference
  let _allocationChartInstance = null;

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

    console.log(`📈 Initializing Shared Investments Module for Group: ${_groupId}`);

    try {
      // 1. Fetch group details
      _groupDoc = await FirestoreService.getDocument('groups', _groupId);
      if (!_groupDoc) {
        UI.showToast('Active group not found.', 'error');
        window.location.href = '/pages/group/groups.html';
        return;
      }

      // 2. Setup type select options
      populateDropdowns();

      // 3. Setup interactive form listeners
      setupFormListeners();

      // 4. Fetch and render investment portfolio
      await fetchAndRenderAssets();

    } catch (error) {
      console.error('Error initializing shared investments:', error);
      UI.showToast('Error loading page database.', 'error');
    }
  }

  /**
   * Populate Asset types dropdown select box
   */
  function populateDropdowns() {
    const select = document.getElementById('type');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Choose asset type</option>';
    Utils.investmentTypes.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      select.appendChild(opt);
    });
  }

  /**
   * Attach dynamic live updates on change of capital
   */
  function setupFormListeners() {
    const capitalInput = document.getElementById('investedAmount');
    if (capitalInput) {
      capitalInput.oninput = () => {
        liveUpdateContributionPreviews();
      };
    }
  }

  /**
   * Render checkboxes and inputs inside modal equity share subform
   */
  function renderOwnershipControls(selectedOwners = null, percentages = null) {
    const container = document.getElementById('ownershipContainer');
    if (!container) return;

    container.innerHTML = '';
    const members = _groupDoc.members || [];
    const memberDetails = _groupDoc.memberDetails || [];

    memberDetails.forEach(member => {
      const uid = member.uid;
      const isChecked = selectedOwners ? selectedOwners.includes(uid) : true;
      const pctValue = percentages && percentages[uid] !== undefined ? percentages[uid] : '';

      const initials = Utils.getInitials(member.username);
      const color = Utils.getAvatarColor(member.username);

      const row = document.createElement('div');
      row.className = 'split-participant';

      row.innerHTML = `
        <input type="checkbox" id="chkOwner_${uid}" class="form-input" style="width:18px; height:18px; margin:0;" ${isChecked ? 'checked' : ''} onchange="GroupInvestmentsModule.onOwnerToggle('${uid}')">
        <div class="sidebar__avatar" style="width: 28px; height: 28px; border-radius: 50%; font-size:10px; background:var(--accent-${color}-glow); color:var(--accent-${color}); font-weight:bold; display:flex; align-items:center; justify-content:center;">
          ${initials}
        </div>
        <span class="split-participant__name" style="font-size:12px;">${member.username}</span>
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="number" step="0.1" min="0" max="100" class="form-input split-participant__input" id="ownerPct_${uid}" value="${pctValue}" placeholder="0%" style="width:80px;" ${!isChecked ? 'disabled' : ''}>
          <span class="badge badge--muted" id="ownerPreview_${uid}" style="font-family:var(--font-mono); font-size:10px; min-width:80px; text-align:right;">₹0.00</span>
        </div>
      `;

      container.appendChild(row);
    });

    // Run dynamic recalculations
    liveUpdateContributionPreviews();

    // Attach real-time input preview updates to all generated input boxes
    members.forEach(uid => {
      const input = document.getElementById(`ownerPct_${uid}`);
      if (input) {
        input.oninput = () => {
          liveUpdateContributionPreviews();
        };
      }
    });
  }

  /**
   * Action trigger when checked/unchecked
   */
  function onOwnerToggle(uid) {
    const chk = document.getElementById(`chkOwner_${uid}`);
    const input = document.getElementById(`ownerPct_${uid}`);
    const preview = document.getElementById(`ownerPreview_${uid}`);

    if (chk && input) {
      input.disabled = !chk.checked;
      if (!chk.checked) {
        input.value = '';
        if (preview) preview.textContent = '₹0.00';
      }
    }
    liveUpdateContributionPreviews();
  }

  /**
   * Checkbox multi-select utility
   */
  function toggleAllOwners(isChecked) {
    const memberDetails = _groupDoc.memberDetails || [];
    memberDetails.forEach(m => {
      const chk = document.getElementById(`chkOwner_${m.uid}`);
      if (chk) {
        chk.checked = isChecked;
        onOwnerToggle(m.uid);
      }
    });
  }

  /**
   * Update real-time capital previews as user inputs numbers
   */
  function liveUpdateContributionPreviews() {
    const capitalVal = parseFloat(document.getElementById('investedAmount').value) || 0;
    const members = _groupDoc.members || [];
    const checkedUids = [];

    let sumPct = 0;

    members.forEach(uid => {
      const chk = document.getElementById(`chkOwner_${uid}`);
      const input = document.getElementById(`ownerPct_${uid}`);
      const preview = document.getElementById(`ownerPreview_${uid}`);

      if (chk && chk.checked) {
        checkedUids.push(uid);
        const pct = parseFloat(input.value) || 0;
        sumPct += pct;

        if (preview) {
          const cashContribution = (pct / 100) * capitalVal;
          preview.textContent = Utils.formatCurrency(cashContribution);
          preview.style.color = pct > 0 ? 'var(--primary-cyan)' : 'var(--text-muted)';
        }
      } else {
        if (preview) {
          preview.textContent = '₹0.00';
          preview.style.color = 'var(--text-muted)';
        }
      }
    });

    const btn = document.getElementById('saveAssetBtn');
    if (btn) {
      btn.textContent = `Save Joint Asset (Sum: ${sumPct.toFixed(1)}% / 100%)`;
      btn.style.borderColor = Math.abs(sumPct - 100) < 0.01 ? 'var(--accent-green)' : 'rgba(255, 82, 82, 0.3)';
    }
  }

  /**
   * Fetch portfolio, compute stats, and mount TableEngine
   */
  async function fetchAndRenderAssets() {
    try {
      UI.showLoading('#investmentsTable');

      // Fetch assets
      _rawData = await FirestoreService.getGroupDocuments('groupInvestments', _groupId);

      UI.hideLoading('#investmentsTable');

      // 1. Calculate Aggregations
      renderPortfolioKPIs(_rawData);

      // 2. Render Allocations Doughnut Chart
      renderAllocationChart(_rawData);

      // 3. Mount TableEngine
      if (!_tableEngine) {
        _tableEngine = new TableEngine({
          tableId: 'investmentsTable',
          toolbarId: 'investmentsToolbar',
          paginationId: 'investmentsPagination',
          columns: [
            {
              key: 'title',
              label: 'Asset Title',
              sortable: true,
              searchable: true,
              render: (val, row) => `
                <div style="font-weight:600;">
                  <span style="font-size:16px; margin-right:6px;">${Utils.getInvestmentIcon(row.type)}</span>${val}
                </div>
              `
            },
            { key: 'type', label: 'Type', sortable: true, render: (val) => `<span class="badge badge--purple">${val}</span>` },
            { key: 'investedAmount', label: 'Capital', sortable: true, render: (val) => Utils.formatCurrency(val) },
            { key: 'currentValue', label: 'Value', sortable: true, render: (val) => Utils.formatCurrency(val) },
            {
              key: 'returns',
              label: 'P&L Returns',
              sortable: true,
              render: (val, row) => {
                const profit = parseFloat(val) || 0;
                const pct = Utils.calcProfitLossPercent(row.investedAmount, row.currentValue);
                const isPositive = profit >= 0;
                const sign = isPositive ? '+' : '';
                const color = isPositive ? 'var(--accent-green)' : 'var(--accent-red)';
                return `
                  <div style="color: ${color}; font-weight:600; font-family:var(--font-mono);">
                    ${sign}${Utils.formatCurrency(profit)} (${sign}${pct}%)
                  </div>
                `;
              }
            },
            {
              key: 'ownership',
              label: 'Shareholders Equity',
              render: (val) => {
                if (!val || val.length === 0) return '—';
                return val.map(owner => {
                  const mDetails = (_groupDoc.memberDetails || []).find(m => m.uid === owner.memberId) || {};
                  return `<span class="badge badge--cyan" style="font-size:10px; margin-bottom:2px;">${mDetails.username || 'User'}: ${owner.percentage}%</span>`;
                }).join(' ');
              }
            }
          ],
          data: _rawData,
          pageSize: 10,
          onEdit: (row) => openEditModal(row),
          onDelete: (row) => deleteAsset(row),
          emptyMessage: 'No joint investments co-owned yet. Log one above!'
        });
      } else {
        _tableEngine.setData(_rawData);
      }

    } catch (error) {
      console.error('Error fetching investments:', error);
      UI.showToast('Error loading shared investments ledger.', 'error');
    }
  }

  /**
   * Process KPI aggregation math
   */
  function renderPortfolioKPIs(assets) {
    const portfolioVal = assets.reduce((acc, curr) => acc + (parseFloat(curr.currentValue) || 0), 0);
    const investedVal = assets.reduce((acc, curr) => acc + (parseFloat(curr.investedAmount) || 0), 0);

    // User equity shares
    let userShareVal = 0;
    let userShareReturns = 0;

    assets.forEach(asset => {
      const ownershipList = asset.ownership || [];
      const userShare = ownershipList.find(o => o.memberId === _user.uid);
      if (userShare) {
        const pct = parseFloat(userShare.percentage) || 0;
        const assetCurrent = parseFloat(asset.currentValue) || 0;
        const assetInvested = parseFloat(asset.investedAmount) || 0;

        userShareVal += (pct / 100) * assetCurrent;
        userShareReturns += (pct / 100) * (assetCurrent - assetInvested);
      }
    });

    Animations.animateCounter('groupPortfolioValueVal', portfolioVal);
    Animations.animateCounter('groupInvestedCapitalVal', investedVal);
    Animations.animateCounter('userShareValueVal', userShareVal);

    const returnsEl = document.getElementById('userShareReturnsVal');
    if (returnsEl) {
      Animations.animateCounter('userShareReturnsVal', userShareReturns, { isCurrency: true });
      if (userShareReturns > 0.01) {
        returnsEl.style.color = 'var(--accent-green)';
      } else if (userShareReturns < -0.01) {
        returnsEl.style.color = 'var(--accent-red)';
      } else {
        returnsEl.style.color = 'var(--text-muted)';
      }
    }
  }

  /**
   * Render Allocations doughnut chart
   */
  function renderAllocationChart(assets) {
    const canvas = document.getElementById('investmentsAllocationChart');
    if (!canvas) return;

    const typeMap = {};
    assets.forEach(asset => {
      const type = asset.type || 'Stocks';
      typeMap[type] = (typeMap[type] || 0) + (parseFloat(asset.currentValue) || 0);
    });

    const labels = Object.keys(typeMap);
    const data = Object.values(typeMap);

    if (_allocationChartInstance) _allocationChartInstance.destroy();

    if (labels.length > 0) {
      _allocationChartInstance = Charts.createDoughnutChart('investmentsAllocationChart', labels, data);
    } else {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '14px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No shared portfolio assets logged', canvas.width / 2, canvas.height / 2);
    }
  }

  /**
   * Modal actions
   */
  function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add Co-owned Asset';
    document.getElementById('assetForm').reset();
    document.getElementById('assetId').value = '';

    // Populates ownership checklist
    renderOwnershipControls();

    // Default purchase date is today
    document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];

    UI.openModal('assetModal');
  }

  function openEditModal(asset) {
    document.getElementById('modalTitle').textContent = 'Modify Co-owned Asset';
    document.getElementById('assetId').value = asset.id;
    document.getElementById('title').value = asset.title;
    document.getElementById('type').value = asset.type;
    document.getElementById('investedAmount').value = asset.investedAmount;
    document.getElementById('currentValue').value = asset.currentValue;
    document.getElementById('notes').value = asset.notes || '';

    const dateObj = Utils.toDate(asset.purchaseDate);
    document.getElementById('purchaseDate').value = dateObj.toISOString().split('T')[0];

    // Read selected ownerships
    const ownershipList = asset.ownership || [];
    const selectedOwners = ownershipList.map(o => o.memberId);
    const percentages = {};
    ownershipList.forEach(o => {
      percentages[o.memberId] = o.percentage;
    });

    // Populate checklist with active values
    renderOwnershipControls(selectedOwners, percentages);

    UI.openModal('assetModal');
  }

  /**
   * Save shared investment record
   */
  async function saveAsset() {
    const id = document.getElementById('assetId').value;
    const title = document.getElementById('title').value.trim();
    const type = document.getElementById('type').value;
    const investedAmount = parseFloat(document.getElementById('investedAmount').value) || 0;
    const currentValue = parseFloat(document.getElementById('currentValue').value) || 0;
    const purchaseDate = document.getElementById('purchaseDate').value;
    const notes = document.getElementById('notes').value.trim();

    // Collect ownership percentages
    const ownership = [];
    let sumPct = 0;
    const members = _groupDoc.members || [];

    members.forEach(uid => {
      const chk = document.getElementById(`chkOwner_${uid}`);
      if (chk && chk.checked) {
        const pctInput = document.getElementById(`ownerPct_${uid}`);
        const pct = parseFloat(pctInput.value) || 0;
        sumPct += pct;

        ownership.push({
          memberId: uid,
          percentage: pct,
          contributed: parseFloat(((pct / 100) * investedAmount).toFixed(2))
        });
      }
    });

    if (!title || !type || investedAmount <= 0 || currentValue <= 0 || !purchaseDate) {
      UI.showToast('Please fill all required fields.', 'warning');
      return;
    }

    if (ownership.length === 0) {
      UI.showToast('Please select at least one co-owner.', 'warning');
      return;
    }

    if (Math.abs(sumPct - 100) > 0.01) {
      UI.showToast(`Equity percentage must equal exactly 100%. Currently: ${sumPct.toFixed(1)}%`, 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveAssetBtn');
    UI.showButtonSpinner(saveBtn, 'Saving asset...');

    const payload = {
      groupId: _groupId,
      title,
      type,
      investedAmount,
      currentValue,
      returns: parseFloat((currentValue - investedAmount).toFixed(2)),
      ownership,
      notes,
      purchaseDate: firebase.firestore.Timestamp.fromDate(new Date(purchaseDate))
    };

    let result;
    if (id) {
      result = await FirestoreService.updateDocument('groupInvestments', id, payload);
    } else {
      result = await FirestoreService.addDocument('groupInvestments', payload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(id ? 'Asset modified successfully.' : 'Joint co-owned asset registered!', 'success');
      UI.closeModal('assetModal');
      await fetchAndRenderAssets();
    } else {
      UI.showToast(`Error saving asset: ${result.error}`, 'error');
    }
  }

  /**
   * Delete asset CRUD helper
   */
  async function deleteAsset(row) {
    if (confirm(`Remove co-owned asset "${row.title}"?`)) {
      UI.showToast('Deleting asset...', 'info');
      const result = await FirestoreService.deleteDocument('groupInvestments', row.id);
      if (result.success) {
        UI.showToast('Asset removed from portfolio.', 'success');
        await fetchAndRenderAssets();
      } else {
        UI.showToast(`Error deleting: ${result.error}`, 'error');
      }
    }
  }

  /**
   * Export to PDF statement
   */
  function exportPDF() {
    const headers = ['Asset Title', 'Type', 'Capital', 'Value', 'P&L Returns'];
    const rows = _rawData.map(asset => {
      const returnsVal = parseFloat(asset.returns) || 0;
      const returnsSign = returnsVal >= 0 ? '+' : '';
      return [
        asset.title,
        asset.type,
        `₹${(parseFloat(asset.investedAmount) || 0).toLocaleString('en-IN')}`,
        `₹${(parseFloat(asset.currentValue) || 0).toLocaleString('en-IN')}`,
        `${returnsSign}₹${returnsVal.toLocaleString('en-IN')}`
      ];
    });

    PDFExport.exportDataReport('Joint Shared Investments Statement', headers, rows, 'group-investments-report.pdf');
  }

  return {
    init,
    openAddModal,
    saveAsset,
    onOwnerToggle,
    toggleAllOwners,
    exportPDF
  };
})();
