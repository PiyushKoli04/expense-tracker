/* ============================================
   APP — app.js
   Entry Point, Authentication Watcher, Page Router & Common Initializations
   ============================================ */

const App = (() => {

  // Current session data
  let _currentUser = null;
  let _userProfile = null;

  /**
   * Initialize page logic based on current route path
   */
  async function init() {
    console.log('🏁 Application Bootstrapping...');
    
    // 1. Hook up global auth watcher
    Auth.onAuthStateChanged(async (user) => {
      _currentUser = user;
      
      const path = window.location.pathname;
      const isAuthPage = path.includes('login.html') || path.includes('signup.html');
      
      if (user) {
        // Logged in!
        console.log(`👤 Active session detected: ${user.email}`);
        
        // Fetch full profile info from firestore
        _userProfile = await Auth.getUserProfile(user.uid);
        if (_userProfile) {
          // Sync currency setting with the application
          Utils.setCurrency(_userProfile.currency || '₹');
        }

        // Render standard layout components (user info in header, etc.)
        renderHeaderProfile();

        // If on login/signup, redirect to dashboard
        if (isAuthPage) {
          window.location.href = '/dashboard.html';
        } else {
          // Initialize page-specific scripts
          triggerPageSpecificInitialization();
        }
      } else {
        // Not logged in
        console.log('👥 No active session. Guest state.');
        if (!isAuthPage && !path.endsWith('/') && !path.endsWith('index.html')) {
          // Redirect to login if on private page
          window.location.href = '/login.html';
        }
      }
    });

    // 2. Setup global click handlers (e.g. Logout)
    setupGlobalClickHandlers();
  }

  /**
   * Render User info in the sidebar/header
   */
  function renderHeaderProfile() {
    // Defensive fallback: use auth details if userProfile is not loaded yet
    const profile = _userProfile || {
      username: _currentUser ? (_currentUser.displayName || _currentUser.email.split('@')[0]) : 'User',
      email: _currentUser ? _currentUser.email : '',
      currency: '₹'
    };

    // Header Profile name / details
    const userNameEl = document.getElementById('headerUserName');
    const userRoleEl = document.getElementById('headerUserEmail');
    const userAvatarEl = document.getElementById('headerUserAvatar');

    if (userNameEl) userNameEl.textContent = profile.username || 'User';
    if (userRoleEl) userRoleEl.textContent = profile.email;
    
    if (userAvatarEl) {
      if (profile.photoURL) {
        userAvatarEl.innerHTML = `<img src="${profile.photoURL}" alt="avatar" style="width:100%; height:100%; border-radius:inherit; object-fit:cover;">`;
      } else {
        const initials = Utils.getInitials(profile.username);
        const color = Utils.getAvatarColor(profile.username);
        userAvatarEl.textContent = initials;
        userAvatarEl.style.background = `var(--accent-${color}-glow, rgba(0, 212, 255, 0.15))`;
        userAvatarEl.style.color = `var(--accent-${color}, var(--primary-cyan))`;
        userAvatarEl.style.display = 'flex';
        userAvatarEl.style.alignItems = 'center';
        userAvatarEl.style.justifyContent = 'center';
        userAvatarEl.style.fontWeight = 'bold';
      }
    }

    // Sidebar active item styling
    highlightSidebarActiveItem();

    // Re-initialize Lucide icons after rendering profile
    if (typeof UI !== 'undefined' && UI.reinitIcons) {
      UI.reinitIcons();
    }
  }

  /**
   * Style active sidebar item matching the current path
   */
  function highlightSidebarActiveItem() {
    const path = window.location.pathname;
    const links = document.querySelectorAll('.sidebar__link');
    
    links.forEach(link => {
      const href = link.getAttribute('href');
      // Normalize both paths to check matching
      if (href && (path.includes(href) || (href === '/dashboard.html' && path.endsWith('/')))) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  /**
   * Route-specific script dispatcher
   */
  function triggerPageSpecificInitialization() {
    const path = window.location.pathname;

    if (path.includes('dashboard.html')) {
      if (typeof PersonalDashboard !== 'undefined') PersonalDashboard.init(_currentUser, _userProfile);
    } else if (path.includes('expenses.html')) {
      if (typeof ExpensesModule !== 'undefined') ExpensesModule.init(_currentUser, _userProfile);
    } else if (path.includes('income.html')) {
      if (typeof IncomeModule !== 'undefined') IncomeModule.init(_currentUser, _userProfile);
    } else if (path.includes('budgets.html')) {
      if (typeof BudgetsModule !== 'undefined') BudgetsModule.init(_currentUser, _userProfile);
    } else if (path.includes('savings.html')) {
      if (typeof SavingsModule !== 'undefined') SavingsModule.init(_currentUser, _userProfile);
    } else if (path.includes('investments.html') && !path.includes('group-investments.html')) {
      if (typeof InvestmentsModule !== 'undefined') InvestmentsModule.init(_currentUser, _userProfile);
    } else if (path.includes('upcoming-spends.html')) {
      if (typeof UpcomingSpendsModule !== 'undefined') UpcomingSpendsModule.init(_currentUser, _userProfile);
    } else if (path.includes('group-dashboard.html')) {
      if (typeof GroupDashboard !== 'undefined') GroupDashboard.init(_currentUser, _userProfile);
    } else if (path.includes('groups.html')) {
      if (typeof GroupsModule !== 'undefined') GroupsModule.init(_currentUser, _userProfile);
    } else if (path.includes('group-expenses.html')) {
      if (typeof GroupExpensesModule !== 'undefined') GroupExpensesModule.init(_currentUser, _userProfile);
    } else if (path.includes('settlements.html')) {
      if (typeof SettlementsModule !== 'undefined') SettlementsModule.init(_currentUser, _userProfile);
    } else if (path.includes('contributions.html')) {
      if (typeof ContributionsModule !== 'undefined') ContributionsModule.init(_currentUser, _userProfile);
    } else if (path.includes('group-investments.html')) {
      if (typeof GroupInvestmentsModule !== 'undefined') GroupInvestmentsModule.init(_currentUser, _userProfile);
    }
  }

  /**
   * Set up global event listeners on body for dynamic elements
   */
  function setupGlobalClickHandlers() {
    // Logout Action
    document.addEventListener('click', async (e) => {
      const logoutBtn = e.target.closest('[data-action="logout"]');
      if (logoutBtn) {
        e.preventDefault();
        UI.showToast('Logging out...', 'info');
        await Auth.logout();
      }
    });

    // Theme Switch Action
    document.addEventListener('click', (e) => {
      const themeToggle = e.target.closest('[data-action="toggle-theme"]');
      if (themeToggle) {
        e.preventDefault();
        UI.toggleTheme();
      }
    });
  }

  return {
    init,
    getCurrentUser: () => _currentUser,
    getUserProfile: () => _userProfile
  };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', App.init);
