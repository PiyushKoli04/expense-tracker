/* ============================================
   ANIMATIONS — animations.js
   Counter Animations, Skeleton Loaders, Micro-interactions
   ============================================ */

const Animations = (() => {

  /**
   * Animate a numeric count up from 0 to a target value
   * @param {string|HTMLElement} target - The element ID or element itself
   * @param {number} targetValue - The number to animate to
   * @param {object} options - { duration: 1200, prefix: '₹', isCurrency: true }
   */
  function animateCounter(target, targetValue, options = {}) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;

    const start = 0;
    const end = parseFloat(targetValue) || 0;
    const duration = options.duration || 1000;
    const prefix = options.prefix || '';
    const isCurrency = options.isCurrency !== false;

    if (end === 0) {
      el.textContent = isCurrency ? Utils.formatCurrency(0) : prefix + '0';
      return;
    }

    const startTime = performance.now();

    function updateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quad function for smooth deceleration
      const easeProgress = progress * (2 - progress);
      const currentValue = start + easeProgress * (end - start);

      if (isCurrency) {
        el.textContent = Utils.formatCurrency(currentValue);
      } else {
        el.textContent = prefix + Math.floor(currentValue).toLocaleString('en-IN');
      }

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        // Guarantee target value is exact at the end
        if (isCurrency) {
          el.textContent = Utils.formatCurrency(end);
        } else {
          el.textContent = prefix + end.toLocaleString('en-IN');
        }
      }
    }

    requestAnimationFrame(updateCounter);
  }

  /**
   * Generates multiple pulse skeleton cards within a container
   * @param {string} containerSelector 
   * @param {number} cardCount 
   */
  function renderSkeleton(containerSelector, cardCount = 3) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    let skeletonsHtml = '';
    for (let i = 0; i < cardCount; i++) {
      skeletonsHtml += `
        <div class="card skeleton-pulse" style="min-height: 120px; padding: 24px; display: flex; flex-direction: column; gap: 16px;">
          <div class="skeleton-line" style="height: 16px; width: 40%; border-radius: 4px; background: rgba(255,255,255,0.06); animation: pulse 1.5s infinite ease-in-out;"></div>
          <div class="skeleton-line" style="height: 28px; width: 80%; border-radius: 4px; background: rgba(255,255,255,0.06); animation: pulse 1.5s infinite ease-in-out;"></div>
          <div class="skeleton-line" style="height: 14px; width: 60%; border-radius: 4px; background: rgba(255,255,255,0.06); animation: pulse 1.5s infinite ease-in-out;"></div>
        </div>
      `;
    }

    container.innerHTML = skeletonsHtml;
  }

  return {
    animateCounter,
    renderSkeleton
  };
})();
