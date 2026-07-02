/* ============================================
   SAVINGS — savings.js
   Personal Savings Goals CRUD, Progress Tracking & Contributions
   ============================================ */

const SavingsModule = (() => {

  let _user = null;
  let _profile = null;
  let _rawData = [];

  /**
   * Module initialization hook
   */
  async function init(user, profile) {
    _user = user;
    _profile = profile;

    console.log('🐷 Initializing Personal Savings Module...');
    
    // Fetch and render data
    await fetchAndRenderSavings();
  }

  /**
   * Retrieve records and render grid of goals
   */
  async function fetchAndRenderSavings() {
    try {
      UI.showLoading('#savingsContainer');
      
      _rawData = await FirestoreService.getUserDocuments('savingsGoals', _user.uid, { orderBy: 'createdAt', orderDir: 'desc' });
      
      UI.hideLoading('#savingsContainer');

      // Update Aggregations Overview
      calculateAndRenderAggregations(_rawData);

      // Render Goals Grids
      renderSavingsGoalsList(_rawData);

    } catch (error) {
      console.error('Error fetching savings goals:', error);
      UI.showToast('Error loading savings goals.', 'error');
    }
  }

  /**
   * Overview counters
   */
  function calculateAndRenderAggregations(data) {
    const totalSaved = data.reduce((acc, curr) => acc + (parseFloat(curr.savedAmount) || 0), 0);
    const totalTarget = data.reduce((acc, curr) => acc + (parseFloat(curr.targetAmount) || 0), 0);
    
    const completedCount = data.filter(g => (parseFloat(g.savedAmount) || 0) >= (parseFloat(g.targetAmount) || 1)).length;
    const activeCount = data.length - completedCount;

    Animations.animateCounter('totalSavedVal', totalSaved);
    Animations.animateCounter('totalTargetVal', totalTarget);
    Animations.animateCounter('completedGoalsCount', completedCount, { isCurrency: false });
    Animations.animateCounter('activeGoalsCount', activeCount, { isCurrency: false });
  }

  /**
   * Render actual Savings Cards inside container
   */
  function renderSavingsGoalsList(data) {
    const container = document.getElementById('savingsContainer');
    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = `
        <div class="card col-span-full" style="text-align:center; padding:64px 0; color:var(--text-muted);">
          <div style="font-size:3rem; margin-bottom:12px; display:flex; justify-content:center; align-items:center; opacity:0.6;">
            <i data-lucide="piggy-bank" style="width:48px; height:48px;"></i>
          </div>
          <h3 style="font-size:var(--fs-lg); font-weight:600; margin-bottom:4px;">No Savings Goals Configured</h3>
          <p style="font-size:var(--fs-sm); max-width:320px; margin:0 auto 16px auto;">
            Define your targets and keep adding contributions to secure your purchases!
          </p>
          <button class="btn btn-primary btn-sm" onclick="SavingsModule.openAddGoalModal()">
            Create Savings Goal
          </button>
        </div>
      `;
      if (typeof UI !== 'undefined' && UI.reinitIcons) {
        UI.reinitIcons();
      }
      return;
    }

    container.innerHTML = '';
    data.forEach(goal => {
      const target = parseFloat(goal.targetAmount) || 1;
      const saved = parseFloat(goal.savedAmount) || 0;
      const percent = Utils.calcPercentage(saved, target);
      const isCompleted = saved >= target;

      // Calculate days remaining
      const deadlineDate = Utils.toDate(goal.deadline);
      const today = new Date();
      const diffTime = deadlineDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let daysText = '';
      if (isCompleted) {
        daysText = 'Goal Achieved! <i data-lucide="sparkles" class="icon-inline" style="color:var(--accent-green); width:14px; height:14px; vertical-align:middle; display:inline-block; margin-left:4px;"></i>';
      } else if (diffDays < 0) {
        daysText = `Overdue by ${Math.abs(diffDays)} days <i data-lucide="alert-triangle" class="icon-inline" style="color:var(--accent-red); width:14px; height:14px; vertical-align:middle; display:inline-block; margin-left:4px;"></i>`;
      } else {
        daysText = `${diffDays} days left`;
      }

      // Card structure with glowing colors
      const glowClass = isCompleted ? 'card--glow-green' : 'card--glow-cyan';
      const badgeStyle = isCompleted ? 'badge--green' : 'badge--cyan';

      const card = document.createElement('div');
      card.className = `card ${glowClass}`;
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';
      card.style.minHeight = '230px';

      card.innerHTML = `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <h3 style="font-size: var(--fs-md); font-weight:700; margin:0; line-height:1.2;">${goal.title}</h3>
              <span style="font-size:10px; color:var(--text-muted);">${daysText}</span>
            </div>
            <span class="badge ${badgeStyle}">
              ${isCompleted ? 'Achieved' : 'In Progress'}
            </span>
          </div>

          <p style="font-size:var(--fs-xs); color:var(--text-secondary); margin-bottom:16px;">
            ${goal.notes ? Utils.truncate(goal.notes, 80) : 'No details specified.'}
          </p>
        </div>

        <div>
          <div style="display:flex; justify-content:space-between; font-size:var(--fs-xs); font-weight:600; margin-bottom:4px;">
            <span>${percent}% saved</span>
            <span>${Utils.formatCurrency(saved)} / ${Utils.formatCurrency(target)}</span>
          </div>

          <div class="progress" style="height:8px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden; margin-bottom:16px;">
            <div class="progress-bar" style="width: ${Math.min(100, percent)}%; height: 100%; border-radius:4px; background:var(--primary-gradient);"></div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-sm" style="padding:4px 6px; display:inline-flex; align-items:center; justify-content:center;" title="Edit" onclick="SavingsModule.openEditGoalModal('${goal.id}')">
                <i data-lucide="pencil" style="width:14px; height:14px;"></i>
              </button>
              <button class="btn btn-ghost btn-sm" style="padding:4px 6px; display:inline-flex; align-items:center; justify-content:center;" title="Delete" onclick="SavingsModule.deleteGoal('${goal.id}', '${goal.title}')">
                <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
              </button>
            </div>
            
            <button class="btn btn-secondary btn-sm" style="padding:6px 12px; font-size:11px; display:inline-flex; align-items:center; gap:4px;" ${isCompleted ? 'disabled' : ''} onclick="SavingsModule.openContribModal('${goal.id}', '${goal.title}')">
              <i data-lucide="piggy-bank" style="width:14px; height:14px;"></i> Contribute
            </button>
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    // Re-initialize Lucide icons for savings goal cards
    if (typeof UI !== 'undefined' && UI.reinitIcons) {
      UI.reinitIcons();
    }
  }

  /**
   * Modal triggers
   */
  function openAddGoalModal() {
    document.getElementById('modalTitle').textContent = 'Create Savings Goal';
    document.getElementById('goalForm').reset();
    document.getElementById('goalId').value = '';
    
    // Set default deadline in 6 months
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    document.getElementById('deadline').value = d.toISOString().split('T')[0];

    UI.openModal('goalModal');
  }

  function openEditGoalModal(goalId) {
    const goal = _rawData.find(g => g.id === goalId);
    if (!goal) return;

    document.getElementById('modalTitle').textContent = 'Edit Savings Goal';
    document.getElementById('goalId').value = goal.id;
    document.getElementById('title').value = goal.title;
    document.getElementById('targetAmount').value = goal.targetAmount;
    document.getElementById('savedAmount').value = goal.savedAmount || 0;
    
    const dlDate = Utils.toDate(goal.deadline);
    document.getElementById('deadline').value = dlDate.toISOString().split('T')[0];
    document.getElementById('notes').value = goal.notes || '';

    UI.openModal('goalModal');
  }

  /**
   * Save Goal Document
   */
  async function saveGoal() {
    const id = document.getElementById('goalId').value;
    const title = document.getElementById('title').value.trim();
    const targetAmount = parseFloat(document.getElementById('targetAmount').value);
    const savedAmount = parseFloat(document.getElementById('savedAmount').value) || 0;
    const deadlineStr = document.getElementById('deadline').value;
    const notes = document.getElementById('notes').value.trim();

    if (!title || isNaN(targetAmount) || targetAmount <= 0 || !deadlineStr) {
      UI.showToast('Please enter required details correctly.', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveGoalBtn');
    UI.showButtonSpinner(saveBtn, 'Saving Goal...');

    const payload = {
      userId: _user.uid,
      title,
      targetAmount,
      savedAmount,
      deadline: firebase.firestore.Timestamp.fromDate(new Date(deadlineStr)),
      notes
    };

    let result;
    if (id) {
      result = await FirestoreService.updateDocument('savingsGoals', id, payload);
    } else {
      result = await FirestoreService.addDocument('savingsGoals', payload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(id ? 'Goal updated!' : 'Savings Goal created!', 'success');
      UI.closeModal('goalModal');
      await fetchAndRenderSavings();
    } else {
      UI.showToast(`Error saving goal: ${result.error}`, 'error');
    }
  }

  /**
   * Delete goal
   */
  async function deleteGoal(goalId, title) {
    if (confirm(`Are you sure you want to delete goal "${title}"?`)) {
      UI.showToast('Deleting savings goal...', 'info');
      const result = await FirestoreService.deleteDocument('savingsGoals', goalId);
      
      if (result.success) {
        UI.showToast('Goal deleted.', 'success');
        await fetchAndRenderSavings();
      } else {
        UI.showToast(`Delete failed: ${result.error}`, 'error');
      }
    }
  }

  /**
   * Contribution submodal triggers
   */
  function openContribModal(goalId, title) {
    document.getElementById('contribGoalId').value = goalId;
    document.getElementById('contribGoalName').innerHTML = `Goal: <strong>${title}</strong>`;
    document.getElementById('contribAmount').value = '';
    
    UI.openModal('addSavingsModal');
  }

  async function saveContribution() {
    const goalId = document.getElementById('contribGoalId').value;
    const amount = parseFloat(document.getElementById('contribAmount').value);

    if (isNaN(amount) || amount <= 0) {
      UI.showToast('Please enter a valid contribution amount.', 'warning');
      return;
    }

    const goal = _rawData.find(g => g.id === goalId);
    if (!goal) return;

    const saveBtn = document.getElementById('saveContribBtn');
    UI.showButtonSpinner(saveBtn, 'Saving Contribution...');

    const newSaved = (parseFloat(goal.savedAmount) || 0) + amount;

    const result = await FirestoreService.updateDocument('savingsGoals', goalId, {
      savedAmount: newSaved
    });

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast(`Contributed ${Utils.formatCurrency(amount)} successfully!`, 'success');
      UI.closeModal('addSavingsModal');
      await fetchAndRenderSavings();
    } else {
      UI.showToast(`Failed to contribute: ${result.error}`, 'error');
    }
  }

  return {
    init,
    openAddGoalModal,
    openEditGoalModal,
    deleteGoal,
    saveGoal,
    openContribModal,
    saveContribution
  };
})();
