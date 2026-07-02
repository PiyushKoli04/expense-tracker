/* ============================================
   GROUP EXPENSES — group-expenses.js
   Group Bill CRUD, Dynamic Participant Inputs & Live Validations
   ============================================ */

const GroupExpensesModule = (() => {

  let _user = null;
  let _profile = null;
  let _groupId = null;
  let _groupDoc = null;
  let _tableEngine = null;
  let _rawData = [];

  // Active split type state ('Equal', 'Unequal', 'Percentage', 'Share-based')
  let _activeSplitType = 'Equal';

  /**
   * Main module initialization hook
   */
  async function init(user, profile) {
    _user = user;
    _profile = profile;

    // Fetch active group
    _groupId = sessionStorage.getItem('currentGroupId');
    if (!_groupId) {
      console.warn('No active groupId found in sessionStorage. Redirecting.');
      UI.showToast('Please select a group first.', 'info');
      setTimeout(() => {
        window.location.href = '/pages/group/groups.html';
      }, 1000);
      return;
    }

    console.log(`💸 Initializing Group Expenses Module for Group: ${_groupId}`);

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

      // 3. Attach interactive form events
      setupFormListeners();

      // 4. Fetch and render joint bills
      await fetchAndRenderExpenses();

    } catch (error) {
      console.error('Error initializing group expenses:', error);
      UI.showToast('Error loading page details.', 'error');
    }
  }

  /**
   * Populate Category & Paid By select boxes
   */
  function populateDropdowns() {
    // 1. Categories
    const categorySelect = document.getElementById('category');
    if (categorySelect) {
      categorySelect.innerHTML = '<option value="" disabled selected>Choose category</option>';
      Utils.expenseCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
      });
    }

    // 2. Paid By members
    const paidBySelect = document.getElementById('paidBy');
    if (paidBySelect) {
      paidBySelect.innerHTML = '<option value="" disabled selected>Choose buyer</option>';
      const memberDetails = _groupDoc.memberDetails || [];
      memberDetails.forEach(member => {
        const opt = document.createElement('option');
        opt.value = member.uid;
        opt.textContent = member.username + (member.uid === _user.uid ? ' (You)' : '');
        paidBySelect.appendChild(opt);
      });
    }
  }

  /**
   * Attach dynamic tab clicks and input preview triggers
   */
  function setupFormListeners() {
    // 1. Split type selection tabs
    const options = document.querySelectorAll('.split-type-option');
    options.forEach(opt => {
      opt.onclick = () => {
        options.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        _activeSplitType = opt.getAttribute('data-value');
        
        // Re-generate custom input controls based on new split type
        renderParticipantsSplitControls();
      };
    });

    // 2. Live previews on total amount changes
    const amountInput = document.getElementById('amount');
    if (amountInput) {
      amountInput.oninput = () => {
        liveUpdateSharePreviews();
      };
    }
  }

  /**
   * Generate participant rows inside checklist based on selected split logic
   */
  function renderParticipantsSplitControls(selectedParticipants = null, customSplitDetails = null) {
    const container = document.getElementById('splitParticipantsContainer');
    if (!container) return;

    container.innerHTML = '';
    const members = _groupDoc.members || [];
    const memberDetails = _groupDoc.memberDetails || [];

    memberDetails.forEach(member => {
      const uid = member.uid;
      const isChecked = selectedParticipants ? selectedParticipants.includes(uid) : true;
      const detailsVal = customSplitDetails && customSplitDetails[uid] ? customSplitDetails[uid] : '';

      const initials = Utils.getInitials(member.username);
      const color = Utils.getAvatarColor(member.username);

      const row = document.createElement('div');
      row.className = 'split-participant';

      let inputHtml = '';
      if (_activeSplitType === 'Unequal') {
        inputHtml = `<input type="number" step="0.01" min="0" class="form-input split-participant__input" id="splitVal_${uid}" value="${detailsVal}" placeholder="₹0.00" ${!isChecked ? 'disabled' : ''}>`;
      } else if (_activeSplitType === 'Percentage') {
        inputHtml = `<input type="number" step="1" min="0" max="100" class="form-input split-participant__input" id="splitVal_${uid}" value="${detailsVal}" placeholder="0%" ${!isChecked ? 'disabled' : ''}>`;
      } else if (_activeSplitType === 'Share-based') {
        inputHtml = `<input type="number" step="1" min="0" class="form-input split-participant__input" id="splitVal_${uid}" value="${detailsVal}" placeholder="shares" ${!isChecked ? 'disabled' : ''}>`;
      } else {
        // Equal Split: Read-only preview label
        inputHtml = `<span class="badge badge--muted split-participant__input" id="splitPreview_${uid}" style="font-family:var(--font-mono); border:none; text-align:right;">₹0.00</span>`;
      }

      row.innerHTML = `
        <input type="checkbox" id="chkParticipant_${uid}" class="form-input" style="width:18px; height:18px; margin:0;" ${isChecked ? 'checked' : ''} onchange="GroupExpensesModule.onParticipantToggle('${uid}')">
        <div class="sidebar__avatar" style="width: 28px; height: 28px; border-radius: 50%; font-size:10px; background:var(--accent-${color}-glow); color:var(--accent-${color}); font-weight:bold; display:flex; align-items:center; justify-content:center;">
          ${initials}
        </div>
        <span class="split-participant__name" style="font-size:12px;">${member.username}</span>
        ${inputHtml}
      `;

      container.appendChild(row);
    });

    // Run dynamic recalculations
    liveUpdateSharePreviews();

    // Attach real-time input preview updates to all generated input boxes
    if (_activeSplitType !== 'Equal') {
      members.forEach(uid => {
        const input = document.getElementById(`splitVal_${uid}`);
        if (input) {
          input.oninput = () => {
            liveUpdateSharePreviews();
          };
        }
      });
    }
  }

  /**
   * Action trigger when checked/unchecked
   */
  function onParticipantToggle(uid) {
    const chk = document.getElementById(`chkParticipant_${uid}`);
    const input = document.getElementById(`splitVal_${uid}`);

    if (chk && input) {
      input.disabled = !chk.checked;
      if (!chk.checked) {
        input.value = '';
      }
    }
    liveUpdateSharePreviews();
  }

  /**
   * Checkbox multi-select utility
   */
  function toggleAllParticipants(isChecked) {
    const memberDetails = _groupDoc.memberDetails || [];
    memberDetails.forEach(m => {
      const chk = document.getElementById(`chkParticipant_${m.uid}`);
      if (chk) {
        chk.checked = isChecked;
        onParticipantToggle(m.uid);
      }
    });
  }

  /**
   * Update real-time helper texts and live validation counts inside form
   */
  function liveUpdateSharePreviews() {
    const amountVal = parseFloat(document.getElementById('amount').value) || 0;
    const members = _groupDoc.members || [];
    const checkedUids = [];

    members.forEach(uid => {
      const chk = document.getElementById(`chkParticipant_${uid}`);
      if (chk && chk.checked) {
        checkedUids.push(uid);
      }
    });

    if (checkedUids.length === 0) return;

    if (_activeSplitType === 'Equal') {
      const equalShare = amountVal / checkedUids.length;
      members.forEach(uid => {
        const previewLabel = document.getElementById(`splitPreview_${uid}`);
        if (previewLabel) {
          const chk = document.getElementById(`chkParticipant_${uid}`);
          if (chk && chk.checked) {
            previewLabel.textContent = Utils.formatCurrency(equalShare);
            previewLabel.style.color = 'var(--primary-cyan)';
          } else {
            previewLabel.textContent = '₹0.00';
            previewLabel.style.color = 'var(--text-muted)';
          }
        }
      });
    } else {
      // Show sum totals in save button helper label
      let sum = 0;
      checkedUids.forEach(uid => {
        const input = document.getElementById(`splitVal_${uid}`);
        if (input) {
          sum += parseFloat(input.value) || 0;
        }
      });

      const btn = document.getElementById('saveExpenseBtn');
      if (btn) {
        if (_activeSplitType === 'Percentage') {
          btn.textContent = `Save Split (Sum: ${sum.toFixed(0)}% / 100%)`;
          btn.style.borderColor = Math.abs(sum - 100) < 0.01 ? 'var(--accent-green)' : 'rgba(255, 82, 82, 0.3)';
        } else if (_activeSplitType === 'Unequal') {
          btn.textContent = `Save Split (Sum: ₹${sum.toFixed(2)} / ₹${amountVal.toFixed(2)})`;
          btn.style.borderColor = Math.abs(sum - amountVal) < 0.05 ? 'var(--accent-green)' : 'rgba(255, 82, 82, 0.3)';
        } else {
          btn.textContent = `Save Split (${sum} shares allocated)`;
          btn.style.borderColor = sum > 0 ? 'var(--accent-green)' : '';
        }
      }
    }
  }

  /**
   * Fetch, calculate standings and mount standard TableEngine
   */
  async function fetchAndRenderExpenses() {
    try {
      UI.showLoading('#expensesTable');

      // Fetch group expenses ordered by date
      _rawData = await FirestoreService.getGroupDocuments('groupExpenses', _groupId, { orderBy: 'date', orderDir: 'desc' });
      
      // Fetch settlements to calculate exact Net Standing (P2P outstanding)
      const settlements = await FirestoreService.getGroupDocuments('groupSettlements', _groupId);

      UI.hideLoading('#expensesTable');

      // 1. Calculate Aggregations
      renderExpenseStats(_rawData, settlements);

      // 2. Load into reusable TableEngine
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
            {
              key: 'paidBy',
              label: 'Paid By',
              sortable: true,
              render: (val) => {
                const member = (_groupDoc.memberDetails || []).find(m => m.uid === val);
                return member ? member.username : 'User';
              }
            },
            {
              key: 'splitType',
              label: 'Split Type',
              render: (val) => `<span class="badge badge--purple">${val}</span>`
            },
            { 
              key: 'date', 
              label: 'Date', 
              sortable: true,
              render: (val) => Utils.formatDate(val, 'short')
            },
            {
              key: 'billLinks',
              label: 'Bill Attachment',
              render: (val) => {
                if (!val || val.length === 0 || !val[0]) return '—';
                return `<a href="${val[0]}" target="_blank" class="bill-link" style="margin:0;">📄 Open Link</a>`;
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
          emptyMessage: 'No shared expenses split in this group. Let\'s split one!'
        });
      } else {
        _tableEngine.setData(_rawData);
      }

    } catch (error) {
      console.error('Error fetching expenses:', error);
      UI.showToast('Error loading group expenses ledger.', 'error');
    }
  }

  /**
   * Process stats row KPIs
   */
  function renderExpenseStats(expenses, settlements) {
    const totalSpent = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    // Calculate user standings
    const userStanding = { balance: 0, share: 0 };
    expenses.forEach(exp => {
      const amount = parseFloat(exp.amount) || 0;
      const paidBy = exp.paidBy;
      const participants = exp.participants || [];
      const splitType = exp.splitType || 'Equal';
      const splitDetails = exp.splitDetails || {};

      // Credit paid by
      if (paidBy === _user.uid) {
        userStanding.balance += amount;
      }

      // Debit participant
      if (participants.includes(_user.uid)) {
        let share = 0;
        if (splitType === 'Equal') {
          share = amount / participants.length;
        } else if (splitType === 'Unequal') {
          share = parseFloat(splitDetails[_user.uid]) || 0;
        } else if (splitType === 'Percentage') {
          const pct = parseFloat(splitDetails[_user.uid]) || 0;
          share = (pct / 100) * amount;
        } else if (splitType === 'Share-based') {
          const shares = parseFloat(splitDetails[_user.uid]) || 0;
          const totalShares = participants.reduce((sum, pUid) => sum + (parseFloat(splitDetails[pUid]) || 0), 0);
          if (totalShares > 0) {
            share = (shares / totalShares) * amount;
          }
        }
        userStanding.balance -= share;
        userStanding.share += share;
      }
    });

    // Settled settlements adjustments
    settlements.forEach(settle => {
      if (settle.status !== 'Settled') return;
      const amount = parseFloat(settle.amount) || 0;
      if (settle.payer === _user.uid) {
        userStanding.balance += amount;
      }
      if (settle.receiver === _user.uid) {
        userStanding.balance -= amount;
      }
    });

    Animations.animateCounter('totalBillsVal', totalSpent);
    Animations.animateCounter('userShareSpentVal', userStanding.share);

    const netValEl = document.getElementById('userNetStandingVal');
    if (netValEl) {
      Animations.animateCounter('userNetStandingVal', userStanding.balance, { isCurrency: true });
      if (userStanding.balance > 0.01) {
        netValEl.style.color = 'var(--accent-green)';
      } else if (userStanding.balance < -0.01) {
        netValEl.style.color = 'var(--accent-red)';
      } else {
        netValEl.style.color = 'var(--text-muted)';
      }
    }
  }

  /**
   * Modal actions
   */
  function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Split Shared Bill';
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = '';

    // Set active split type Equal
    _activeSplitType = 'Equal';
    const options = document.querySelectorAll('.split-type-option');
    options.forEach(opt => {
      if (opt.getAttribute('data-value') === 'Equal') opt.classList.add('active');
      else opt.classList.remove('active');
    });

    // Populate members in participant list
    renderParticipantsSplitControls();

    // Default Paid By is active user
    document.getElementById('paidBy').value = _user.uid;
    // Default date is today
    document.getElementById('date').value = new Date().toISOString().split('T')[0];

    UI.openModal('expenseModal');
  }

  function openEditModal(expense) {
    document.getElementById('modalTitle').textContent = 'Modify Shared Bill';
    document.getElementById('expenseId').value = expense.id;
    document.getElementById('title').value = expense.title;
    document.getElementById('amount').value = expense.amount;
    document.getElementById('category').value = expense.category;
    document.getElementById('paidBy').value = expense.paidBy;
    document.getElementById('notes').value = expense.notes || '';
    document.getElementById('billLink').value = expense.billLinks && expense.billLinks[0] ? expense.billLinks[0] : '';
    
    const dateObj = Utils.toDate(expense.date);
    document.getElementById('date').value = dateObj.toISOString().split('T')[0];

    // Set split type
    _activeSplitType = expense.splitType || 'Equal';
    const options = document.querySelectorAll('.split-type-option');
    options.forEach(opt => {
      if (opt.getAttribute('data-value') === _activeSplitType) opt.classList.add('active');
      else opt.classList.remove('active');
    });

    // Populate split participant inputs with active selections
    renderParticipantsSplitControls(expense.participants, expense.splitDetails);

    UI.openModal('expenseModal');
  }

  /**
   * Save Split Expense payload (Add or Edit)
   */
  async function saveExpense() {
    const id = document.getElementById('expenseId').value;
    const title = document.getElementById('title').value.trim();
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const category = document.getElementById('category').value;
    const paidBy = document.getElementById('paidBy').value;
    const dateStr = document.getElementById('date').value;
    const billLink = document.getElementById('billLink').value.trim();
    const notes = document.getElementById('notes').value.trim();

    // Collect checked participants
    const participants = [];
    const splitDetails = {};
    const members = _groupDoc.members || [];

    members.forEach(uid => {
      const chk = document.getElementById(`chkParticipant_${uid}`);
      if (chk && chk.checked) {
        participants.push(uid);
        
        if (_activeSplitType !== 'Equal') {
          const valInput = document.getElementById(`splitVal_${uid}`);
          if (valInput) {
            splitDetails[uid] = parseFloat(valInput.value) || 0;
          }
        }
      }
    });

    // Validation checks
    if (!title || amount <= 0 || !category || !paidBy || !dateStr) {
      UI.showToast('Please fill in required fields.', 'warning');
      return;
    }
    if (participants.length === 0) {
      UI.showToast('Please select at least one participant.', 'warning');
      return;
    }

    // Process & validate shares using SplitEngine
    const engineResult = SplitEngine.calculateShares(amount, _activeSplitType, participants, splitDetails);
    if (!engineResult.success) {
      UI.showToast(engineResult.error, 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveExpenseBtn');
    UI.showButtonSpinner(saveBtn, 'Saving split...');

    const payload = {
      groupId: _groupId,
      title,
      amount,
      paidBy,
      participants,
      splitType: _activeSplitType,
      splitDetails: _activeSplitType === 'Equal' ? {} : splitDetails,
      category,
      billLinks: billLink ? [billLink] : [],
      notes,
      date: firebase.firestore.Timestamp.fromDate(new Date(dateStr))
    };

    let result;
    if (id) {
      result = await FirestoreService.updateDocument('groupExpenses', id, payload);
    } else {
      result = await FirestoreService.addDocument('groupExpenses', payload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(id ? 'Shared expense modified successfully!' : 'Shared expense split created!', 'success');
      UI.closeModal('expenseModal');
      await fetchAndRenderExpenses();
    } else {
      UI.showToast(`Error saving split: ${result.error}`, 'error');
    }
  }

  /**
   * Delete Shared Bill CRUD helper
   */
  async function deleteExpense(expense) {
    if (confirm(`Delete shared bill "${expense.title}"? This will recalculate all member standings.`)) {
      UI.showToast('Deleting bill...', 'info');
      const result = await FirestoreService.deleteDocument('groupExpenses', expense.id);
      if (result.success) {
        UI.showToast('Shared bill deleted successfully.', 'success');
        await fetchAndRenderExpenses();
      } else {
        UI.showToast(`Error deleting: ${result.error}`, 'error');
      }
    }
  }

  /**
   * Export to PDF statement
   */
  function exportPDF() {
    const headers = ['Title', 'Category', 'Paid By', 'Split Type', 'Date', 'Amount'];
    const rows = _rawData.map(exp => {
      const paidMember = (_groupDoc.memberDetails || []).find(m => m.uid === exp.paidBy) || {};
      return [
        exp.title,
        exp.category,
        paidMember.username || 'User',
        exp.splitType,
        Utils.formatDate(exp.date, 'short'),
        `₹${(parseFloat(exp.amount) || 0).toLocaleString('en-IN')}`
      ];
    });

    PDFExport.exportDataReport('Shared Expenses Ledger Statement', headers, rows, 'group-expenses-statement.pdf');
  }

  return {
    init,
    openAddModal,
    saveExpense,
    onParticipantToggle,
    toggleAllParticipants,
    exportPDF
  };
})();
