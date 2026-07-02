/* ============================================
   PERSONAL DASHBOARD — personal-dashboard.js
   Fetch Personal Finance Summaries, Render Charts & Statistics
   ============================================ */

const PersonalDashboard = (() => {

  let _user = null;
  let _profile = null;

  /**
   * Main module initialization hook from app.js
   */
  async function init(user, profile) {
    _user = user;
    _profile = profile;

    console.log('📊 Initializing Personal Dashboard...');

    try {
      // Show skeleton state loaders
      UI.showLoading('#statsGrid');
      
      // Fetch all required data concurrently from Firestore
      const [expenses, income, savings, investments, budgets] = await Promise.all([
        FirestoreService.getUserDocuments('personalExpenses', user.uid),
        FirestoreService.getUserDocuments('personalIncome', user.uid),
        FirestoreService.getUserDocuments('savingsGoals', user.uid),
        FirestoreService.getUserDocuments('personalInvestments', user.uid),
        FirestoreService.getUserDocuments('budgets', user.uid)
      ]);

      // Hide skeleton state loaders
      UI.hideLoading('#statsGrid');

      // 1. Calculate & Render Stats
      calculateAndRenderStats(expenses, income, investments, budgets);

      // 2. Render Charts
      renderDashboardCharts(expenses, income);

      // 3. Render Savings Goals Progress
      renderSavingsGoals(savings);

      // 4. Render Recent Operations Table
      renderRecentOperations(expenses, income);

      // 5. Render active budget warnings
      checkAndRenderBudgetAlerts(expenses, budgets);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      UI.showToast('Error loading financial data. Please try again.', 'error');
    }
  }

  /**
   * Process all summaries and animate counters
   */
  function calculateAndRenderStats(expenses, income, investments, budgets) {
    const currentMonth = Utils.getCurrentMonth(); // 'YYYY-MM'

    // Balance calculations
    const totalIncome = income.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const totalExpenses = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const totalInvested = investments.reduce((acc, curr) => acc + (parseFloat(curr.investedAmount) || 0), 0);
    const netBalance = totalIncome - totalExpenses - totalInvested;

    // Current month calculations
    const thisMonthExpenses = expenses
      .filter(exp => {
        const expDate = Utils.toDate(exp.date);
        const expMonth = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}`;
        return expMonth === currentMonth;
      })
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    const thisMonthIncome = income
      .filter(inc => {
        const incDate = Utils.toDate(inc.date);
        const incMonth = `${incDate.getFullYear()}-${String(incDate.getMonth() + 1).padStart(2, '0')}`;
        return incMonth === currentMonth;
      })
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    // Investment calculations
    const totalCurrentValue = investments.reduce((acc, curr) => acc + (parseFloat(curr.currentValue) || 0), 0);
    const profitLoss = totalCurrentValue - totalInvested;
    const profitPercent = Utils.calcProfitLossPercent(totalInvested, totalCurrentValue);

    // Budget consumption percent
    const currentMonthBudget = budgets.find(b => b.month === currentMonth);
    let budgetLimitHtml = 'No active budget set';
    if (currentMonthBudget && currentMonthBudget.totalBudget) {
      const budgetLimit = parseFloat(currentMonthBudget.totalBudget) || 0;
      const consumedPercent = Utils.calcPercentage(thisMonthExpenses, budgetLimit);
      budgetLimitHtml = `${consumedPercent}% of ₹${budgetLimit.toLocaleString('en-IN')}`;
      
      const percentEl = document.getElementById('expenseLimitPercent');
      if (percentEl) {
        percentEl.textContent = budgetLimitHtml;
        if (consumedPercent > 90) {
          percentEl.className = 'stat-card__change stat-card__change--down';
        } else {
          percentEl.className = 'stat-card__change stat-card__change--up';
        }
      }
    }

    // Animate UI elements
    Animations.animateCounter('netBalanceVal', netBalance);
    Animations.animateCounter('monthlyExpensesVal', thisMonthExpenses);
    Animations.animateCounter('monthlyIncomeVal', thisMonthIncome);
    Animations.animateCounter('investmentsVal', totalCurrentValue);

    const profitLossEl = document.getElementById('investmentsProfitLoss');
    if (profitLossEl) {
      if (profitLoss >= 0) {
        profitLossEl.className = 'stat-card__change stat-card__change--up';
        profitLossEl.textContent = `+${profitPercent}% profit`;
      } else {
        profitLossEl.className = 'stat-card__change stat-card__change--down';
        profitLossEl.textContent = `${profitPercent}% loss`;
      }
    }
  }

  /**
   * Create doughnut, line and bar cashflow charts
   */
  function renderDashboardCharts(expenses, income) {
    const currentMonth = Utils.getCurrentMonth();

    // ── 1. EXPENSE CATEGORY DOUGHNUT CHART ──
    // Group monthly expenses by category
    const categoryMap = {};
    expenses
      .filter(exp => {
        const expDate = Utils.toDate(exp.date);
        const expMonth = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}`;
        return expMonth === currentMonth;
      })
      .forEach(exp => {
        const cat = exp.category || 'Other';
        categoryMap[cat] = (categoryMap[cat] || 0) + (parseFloat(exp.amount) || 0);
      });

    const categoryLabels = Object.keys(categoryMap);
    const categoryData = Object.values(categoryMap);

    if (categoryLabels.length > 0) {
      Charts.createDoughnutChart('categoryChart', categoryLabels, categoryData);
    } else {
      // Empty placeholder
      const canvas = document.getElementById('categoryChart');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No expenses this month', canvas.width / 2, canvas.height / 2);
      }
    }

    // ── 2. INCOME VS EXPENSES CASHFLOW BAR CHART ──
    // Group last 6 months cashflow
    const cashflowMonths = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      cashflowMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const incomeMonthlyData = Array(6).fill(0);
    const expensesMonthlyData = Array(6).fill(0);

    income.forEach(inc => {
      const incDate = Utils.toDate(inc.date);
      const incMonth = `${incDate.getFullYear()}-${String(incDate.getMonth() + 1).padStart(2, '0')}`;
      const idx = cashflowMonths.indexOf(incMonth);
      if (idx !== -1) {
        incomeMonthlyData[idx] += parseFloat(inc.amount) || 0;
      }
    });

    expenses.forEach(exp => {
      const expDate = Utils.toDate(exp.date);
      const expMonth = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}`;
      const idx = cashflowMonths.indexOf(expMonth);
      if (idx !== -1) {
        expensesMonthlyData[idx] += parseFloat(exp.amount) || 0;
      }
    });

    const monthLabels = cashflowMonths.map(m => Utils.getMonthName(m).split(' ')[0]); // Show only month name (e.g. May)

    Charts.createBarChart('cashflowChart', monthLabels, [
      { label: 'Monthly Income', data: incomeMonthlyData },
      { label: 'Monthly Expenses', data: expensesMonthlyData }
    ]);

    // ── 3. DAILY SPENDING TREND LINE CHART ──
    // Group expenses of current month by date
    const dailyExpenses = {};
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    // Initialize current month days
    for (let i = 1; i <= daysInMonth; i++) {
      dailyExpenses[i] = 0;
    }

    expenses
      .filter(exp => {
        const expDate = Utils.toDate(exp.date);
        const expMonth = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}`;
        return expMonth === currentMonth;
      })
      .forEach(exp => {
        const day = Utils.toDate(exp.date).getDate();
        dailyExpenses[day] += parseFloat(exp.amount) || 0;
      });

    const dailyLabels = Object.keys(dailyExpenses).map(day => `Day ${day}`);
    const dailyData = Object.values(dailyExpenses);

    Charts.createLineChart('trendChart', dailyLabels, [
      { label: 'Daily Expense Inflow', data: dailyData }
    ]);
  }

  /**
   * Render Savings Progress List
   */
  function renderSavingsGoals(savings) {
    const briefContainer = document.getElementById('savingsGoalsBrief');
    if (!briefContainer) return;

    if (savings.length === 0) {
      briefContainer.innerHTML = `
        <div style="text-align:center; color:var(--text-muted); padding:32px 0;">
          No active savings goals found.
        </div>
      `;
      return;
    }

    briefContainer.innerHTML = '';
    // Show top 3 goals
    savings.slice(0, 3).forEach(goal => {
      const target = parseFloat(goal.targetAmount) || 1;
      const saved = parseFloat(goal.savedAmount) || 0;
      const percent = Utils.calcPercentage(saved, target);

      const item = document.createElement('div');
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
          <span style="font-weight: 500; font-size:var(--fs-sm);">${goal.title}</span>
          <span style="font-size:var(--fs-xs); color:var(--text-muted);">${Utils.formatCurrency(saved)} / ${Utils.formatCurrency(target)}</span>
        </div>
        <div class="progress" style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden;">
          <div class="progress-bar" style="width: ${percent}%; height: 100%; border-radius:3px; background:var(--primary-gradient);"></div>
        </div>
        <div style="text-align:right; font-size:10px; color:var(--text-muted); margin-top:2px;">
          ${percent}% achieved
        </div>
      `;
      briefContainer.appendChild(item);
    });
  }

  /**
   * Merge expenses and incomes into a single timeline sorted by date
   */
  function renderRecentOperations(expenses, income) {
    const tbody = document.getElementById('recentOperationsTbody');
    if (!tbody) return;

    // Map and label operations
    const normalizedExpenses = expenses.map(e => ({
      ...e,
      type: 'expense',
      displayName: e.title,
      displayAmt: -Math.abs(parseFloat(e.amount)),
      displayMethod: e.paymentMethod || 'Other'
    }));

    const normalizedIncome = income.map(i => ({
      ...i,
      type: 'income',
      displayName: i.source,
      displayAmt: Math.abs(parseFloat(i.amount)),
      displayMethod: 'Direct Deposit',
      category: 'Income Source'
    }));

    // Merge and sort
    const operations = [...normalizedExpenses, ...normalizedIncome];
    operations.sort((a, b) => Utils.toDate(b.date).getTime() - Utils.toDate(a.date).getTime());

    const topOps = operations.slice(0, 5);

    if (topOps.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:32px 0; color:var(--text-muted);">
            No recent transactions logged yet.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = '';
    topOps.forEach(op => {
      const tr = document.createElement('tr');
      
      const isNegative = op.displayAmt < 0;
      const amtClass = isNegative ? 'cell-amount cell-amount--negative' : 'cell-amount cell-amount--positive';
      const amtText = Utils.formatCurrency(op.displayAmt, true);

      tr.innerHTML = `
        <td style="font-weight: 500;">${op.displayName}</td>
        <td>
          <span class="badge badge--${op.type === 'expense' ? 'muted' : 'green'}">
            ${op.category}
          </span>
        </td>
        <td>${op.displayMethod}</td>
        <td>${Utils.formatDate(op.date, 'short')}</td>
        <td class="${amtClass}" style="text-align:right;">${amtText}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * Evaluate active category and total budgets for potential warning banners
   */
  function checkAndRenderBudgetAlerts(expenses, budgets) {
    const alertBox = document.getElementById('budgetAlerts');
    if (!alertBox) return;

    const currentMonth = Utils.getCurrentMonth();
    const currentMonthBudget = budgets.find(b => b.month === currentMonth);

    if (!currentMonthBudget) {
      alertBox.style.display = 'none';
      return;
    }

    const categoryBudgets = currentMonthBudget.categories || [];
    if (categoryBudgets.length === 0) {
      alertBox.style.display = 'none';
      return;
    }

    const warningItems = [];

    // Group expenses by category
    const categoryTotals = {};
    expenses
      .filter(exp => {
        const expDate = Utils.toDate(exp.date);
        const expMonth = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}`;
        return expMonth === currentMonth;
      })
      .forEach(exp => {
        categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + (parseFloat(exp.amount) || 0);
      });

    categoryBudgets.forEach(b => {
      const spent = categoryTotals[b.name] || 0;
      const limit = parseFloat(b.limit) || 0;
      if (limit > 0) {
        const percent = Utils.calcPercentage(spent, limit);
        if (percent >= 100) {
          warningItems.push(`<i data-lucide="alert-triangle" class="icon-inline" style="color:var(--accent-red); width:16px; height:16px; vertical-align:middle; margin-right:6px; display:inline-block;"></i>Budget exceeded! You have spent <strong>${percent}%</strong> of your <strong>₹${limit.toLocaleString('en-IN')}</strong> limit for <strong>${b.name}</strong>.`);
        } else if (percent >= 85) {
          warningItems.push(`<i data-lucide="alert-circle" class="icon-inline" style="color:var(--accent-orange); width:16px; height:16px; vertical-align:middle; margin-right:6px; display:inline-block;"></i>Budget warning! You have spent <strong>${percent}%</strong> of your <strong>₹${limit.toLocaleString('en-IN')}</strong> limit for <strong>${b.name}</strong>.`);
        }
      }
    });

    if (warningItems.length > 0) {
      alertBox.style.display = 'block';
      alertBox.innerHTML = `
        <div class="card card--glow-red" style="background: rgba(255, 82, 82, 0.04); border-color: rgba(255, 82, 82, 0.2); padding: 16px; margin-bottom: 24px; border-radius:var(--radius-xl);">
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${warningItems.map(item => `<div style="font-size: var(--fs-sm); display:flex; align-items:center;">${item}</div>`).join('')}
          </div>
        </div>
      `;
      // Re-initialize Lucide icons for budget warnings
      if (typeof UI !== 'undefined' && UI.reinitIcons) {
        UI.reinitIcons();
      }
    } else {
      alertBox.style.display = 'none';
    }
  }

  return {
    init
  };
})();
