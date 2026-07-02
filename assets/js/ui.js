/* ============================================
   UI — ui.js
   DOM Helpers, Toast Notifications, Modal Controller, Sidebar and Loaders
   ============================================ */

const UI = (() => {

  /* ── Lucide Icon SVG Templates ── */
  const LUCIDE_SVGS = {
    'check-circle': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    'x-circle': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    'alert-triangle': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    'info': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    'pin': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24z"/></svg>'
  };

  /* ── Toast Notifications ── */
  function showToast(message, type = 'info', duration = 3500) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    let iconSvg = LUCIDE_SVGS['pin'];
    if (type === 'success') iconSvg = LUCIDE_SVGS['check-circle'];
    if (type === 'error') iconSvg = LUCIDE_SVGS['x-circle'];
    if (type === 'warning') iconSvg = LUCIDE_SVGS['alert-triangle'];
    if (type === 'info') iconSvg = LUCIDE_SVGS['info'];

    toast.innerHTML = `
      <div class="toast__icon" style="display:flex;align-items:center;">${iconSvg}</div>
      <div class="toast__content">
        <p class="toast__message" style="margin:0; font-size:14px; font-weight:500;">${message}</p>
      </div>
    `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    // Auto-remove toast
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);
  }

  /* ── Modal System ── */
  function openModal(modalId) {
    const modalOverlay = document.getElementById(modalId);
    if (modalOverlay) {
      modalOverlay.classList.add('active');
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
  }

  function closeModal(modalId) {
    const modalOverlay = document.getElementById(modalId);
    if (modalOverlay) {
      modalOverlay.classList.remove('active');
      document.body.style.overflow = ''; // Restore scrolling
    }
  }

  function setupModals() {
    // Attach close behavior to any close buttons and overlays
    document.addEventListener('click', (e) => {
      if (e.target.matches('.modal-overlay')) {
        closeModal(e.target.id);
      } else if (e.target.closest('.modal__close')) {
        const overlay = e.target.closest('.modal-overlay');
        if (overlay) closeModal(overlay.id);
      } else if (e.target.closest('[data-close-modal]')) {
        const overlay = e.target.closest('.modal-overlay');
        if (overlay) closeModal(overlay.id);
      }
    });
  }

  /* ── Sidebar System ── */
  function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (sidebar) {
      sidebar.classList.toggle('active');
    }
    if (overlay) {
      overlay.classList.toggle('active');
    }
  }

  function setupSidebar() {
    const toggleBtn = document.getElementById('sidebarToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleSidebar);
    }

    // Create and attach mobile overlay if not present
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay && document.querySelector('.sidebar')) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', toggleSidebar);
    }
  }

  /* ── Loading States ── */
  function showLoading(elementSelector) {
    const element = document.querySelector(elementSelector);
    if (!element) return;
    
    // Save original content
    element.dataset.originalHtml = element.innerHTML;
    element.innerHTML = `
      <div class="skeleton-loader" style="height:100%; width:100%; min-height:100px; border-radius:inherit;"></div>
    `;
    element.classList.add('loading');
  }

  function hideLoading(elementSelector) {
    const element = document.querySelector(elementSelector);
    if (!element || !element.dataset.originalHtml) return;
    
    element.innerHTML = element.dataset.originalHtml;
    element.classList.remove('loading');
    delete element.dataset.originalHtml;
  }

  function showButtonSpinner(buttonElement, text = 'Loading...') {
    if (!buttonElement) return;
    buttonElement.disabled = true;
    buttonElement.dataset.originalHtml = buttonElement.innerHTML;
    buttonElement.innerHTML = `
      <span class="spinner" style="display:inline-block; width:14px; height:14px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; animation:spin 0.6s linear infinite; margin-right:8px; vertical-align:middle;"></span>
      ${text}
    `;
  }

  function hideButtonSpinner(buttonElement) {
    if (!buttonElement || !buttonElement.dataset.originalHtml) return;
    buttonElement.disabled = false;
    buttonElement.innerHTML = buttonElement.dataset.originalHtml;
    delete buttonElement.dataset.originalHtml;
  }

  /* ── Theme Toggle ── */
  function setupTheme() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    showToast(`Switched to ${next} theme!`, 'success');
  }

  /* ── Dropdowns ── */
  function setupDropdowns() {
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-dropdown-toggle]');
      if (toggle) {
        const targetId = toggle.dataset.dropdownToggle;
        const dropdown = document.getElementById(targetId);
        if (dropdown) {
          dropdown.classList.toggle('active');
        }
        
        // Close other dropdowns
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
          if (menu.id !== targetId) menu.classList.remove('active');
        });
        
        e.stopPropagation();
      } else {
        // Clicked outside, close all dropdowns
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
          menu.classList.remove('active');
        });
      }
    });
  }

  /* ── Lucide Icons Initialization ── */
  function initIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  /**
   * Re-initialize Lucide icons after dynamic content injection
   */
  function reinitIcons() {
    initIcons();
  }

  /* ── Mobile Layout & Enhancements ── */
  function setupMobileNav() {
    const mobileNav = document.querySelector('.mobile-nav');
    if (!mobileNav) return;

    // Check if the "More" item is already there
    const hasMore = mobileNav.querySelector('[data-action="open-more-menu"]');
    if (!hasMore) {
      const moreTab = document.createElement('a');
      moreTab.href = '#';
      moreTab.className = 'mobile-nav__item';
      moreTab.dataset.action = 'open-more-menu';
      moreTab.innerHTML = `
        <span class="mobile-nav__icon" style="display: flex; align-items: center; justify-content: center;">
          <i data-lucide="more-horizontal" style="width: 18px; height: 18px;"></i>
        </span>
        <span class="mobile-nav__label">More</span>
      `;
      mobileNav.appendChild(moreTab);
      reinitIcons();
    }

    // Set active class based on current page URL
    const currentPath = window.location.pathname;
    const navItems = mobileNav.querySelectorAll('.mobile-nav__item');
    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (href && href !== '#') {
        if (currentPath === href || (href !== '/' && currentPath.endsWith(href))) {
          navItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
        }
      }
    });
  }

  function setupMobileMoreMenu() {
    // Only create menu if there is a mobile-nav on the page
    if (!document.querySelector('.mobile-nav')) return;

    let sheet = document.getElementById('mobileMoreMenuSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'mobileMoreMenuSheet';
      sheet.className = 'more-menu-sheet';
      sheet.innerHTML = `
        <div class="more-menu-sheet__header">
          <h3 class="more-menu-sheet__title">More Features</h3>
          <div class="more-menu-sheet__close" data-action="close-more-menu">&times;</div>
        </div>
        <div class="more-menu-grid">
          <a href="/pages/personal/budgets.html" class="more-menu-item">
            <i data-lucide="target" style="width: 24px; height: 24px;"></i>
            <span>Budgets</span>
          </a>
          <a href="/pages/personal/savings.html" class="more-menu-item">
            <i data-lucide="piggy-bank" style="width: 24px; height: 24px;"></i>
            <span>Savings</span>
          </a>
          <a href="/pages/personal/investments.html" class="more-menu-item">
            <i data-lucide="trending-up" style="width: 24px; height: 24px;"></i>
            <span>Investments</span>
          </a>
          <a href="/pages/group/groups.html" class="more-menu-item">
            <i data-lucide="users" style="width: 24px; height: 24px;"></i>
            <span>My Groups</span>
          </a>
          <a href="#" class="more-menu-item" data-action="mobile-toggle-theme">
            <i data-lucide="moon" style="width: 24px; height: 24px;"></i>
            <span>Theme</span>
          </a>
          <a href="#" class="more-menu-item" data-action="mobile-logout">
            <i data-lucide="log-out" style="width: 24px; height: 24px;"></i>
            <span>Log Out</span>
          </a>
        </div>
      `;
      document.body.appendChild(sheet);
      reinitIcons();
    }

    // Attach listeners
    sheet.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-action="close-more-menu"]');
      const themeBtn = e.target.closest('[data-action="mobile-toggle-theme"]');
      const logoutBtn = e.target.closest('[data-action="mobile-logout"]');
      
      if (closeBtn) {
        sheet.classList.remove('active');
      } else if (themeBtn) {
        e.preventDefault();
        toggleTheme();
        sheet.classList.remove('active');
      } else if (logoutBtn) {
        e.preventDefault();
        sheet.classList.remove('active');
        const desktopLogout = document.querySelector('[data-action="logout"]');
        if (desktopLogout) {
          desktopLogout.click();
        } else {
          if (typeof AuthService !== 'undefined' && AuthService.logout) {
            AuthService.logout();
          }
        }
      }
    });

    // Intercept clicks on bottom nav "More" link
    document.addEventListener('click', (e) => {
      const moreNav = e.target.closest('.mobile-nav__item[href="#"], .mobile-nav__item[data-action="open-more-menu"]');
      if (moreNav) {
        e.preventDefault();
        sheet.classList.toggle('active');
      } else if (!e.target.closest('.more-menu-sheet')) {
        sheet.classList.remove('active');
      }
    });
  }

  function setupMobileFAB() {
    // Only on mobile screens
    if (window.innerWidth > 768) {
      const existingFab = document.getElementById('mobileFAB');
      if (existingFab) existingFab.remove();
      return;
    }

    if (document.getElementById('mobileFAB')) return;

    // Find the primary button in the header
    const primaryHeaderBtn = document.querySelector('.header__right .btn-primary, .header .btn-primary');
    if (!primaryHeaderBtn) return;

    // Create FAB
    const fab = document.createElement('button');
    fab.id = 'mobileFAB';
    fab.className = 'mobile-fab';
    fab.title = primaryHeaderBtn.textContent.trim() || 'Add';
    
    // Add a plus icon
    fab.innerHTML = `<i data-lucide="plus" style="width: 24px; height: 24px; stroke-width: 2.5px;"></i>`;
    
    document.body.appendChild(fab);
    reinitIcons();

    // Link the click
    fab.addEventListener('click', (e) => {
      primaryHeaderBtn.click();
    });
  }

  // Initialize common UI listeners
  function init() {
    setupModals();
    setupSidebar();
    setupTheme();
    setupDropdowns();
    setupMobileNav();
    setupMobileMoreMenu();
    setupMobileFAB();
    // Initialize Lucide icons on page load
    initIcons();

    // Handle window resize for dynamic mobile elements like FAB
    window.addEventListener('resize', setupMobileFAB);
  }

  return {
    showToast,
    openModal,
    closeModal,
    showLoading,
    hideLoading,
    showButtonSpinner,
    hideButtonSpinner,
    toggleTheme,
    reinitIcons,
    LUCIDE_SVGS,
    init
  };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', UI.init);
