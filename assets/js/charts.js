/* ============================================
   CHARTS — charts.js
   Chart.js Wrapper & Configured Dark-Theme Options
   ============================================ */

const Charts = (() => {

  // Global Chart.js configuration defaults for the dark premium UI
  const CHART_DEFAULTS = {
    textColor: '#9CA3AF', // text-muted
    fontFamily: '"Inter", sans-serif',
    gridColor: 'rgba(255, 255, 255, 0.05)',
    tooltipBg: 'rgba(10, 14, 26, 0.95)',
    tooltipBorder: 'rgba(255, 255, 255, 0.08)'
  };

  /**
   * Set global Chart.js configuration options
   */
  function configureChartJS() {
    if (typeof Chart === 'undefined') return;

    // Apply global font and layout styling
    Chart.defaults.color = CHART_DEFAULTS.textColor;
    Chart.defaults.font.family = CHART_DEFAULTS.fontFamily;
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.color = CHART_DEFAULTS.textColor;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    
    // Tooltip defaults
    Chart.defaults.plugins.tooltip.backgroundColor = CHART_DEFAULTS.tooltipBg;
    Chart.defaults.plugins.tooltip.borderColor = CHART_DEFAULTS.tooltipBorder;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
    Chart.defaults.plugins.tooltip.bodyColor = '#9CA3AF';
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.boxPadding = 6;
  }

  /**
   * Create a Doughnut (Category Allocation) Chart
   * @param {string} canvasId 
   * @param {Array} labels 
   * @param {Array} data 
   * @param {Array} colors 
   * @returns {Chart|null}
   */
  function createDoughnutChart(canvasId, labels, data, colors = []) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    configureChartJS();

    // Default premium gradient colors if none provided
    const defaultColors = [
      '#00D4FF', // Cyan
      '#7B2FFF', // Purple
      '#00E676', // Green
      '#FF5252', // Red
      '#FF9100', // Orange
      '#1DE9B6', // Teal
      '#FF4081', // Pink
      '#FFD540', // Yellow
      '#2979FF', // Blue
      '#607D8B'  // Muted Slate
    ];

    const backgroundColors = colors.length > 0 ? colors : defaultColors.slice(0, labels.length);

    // Destroy existing instance to prevent visual overlay bugs
    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    return new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: backgroundColors,
          borderWidth: 2,
          borderColor: '#111827', // Dark border to separate slices nicely
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%', // Sleek ring layout
        plugins: {
          legend: {
            position: 'right',
            labels: {
              padding: 16,
              font: {
                weight: '500'
              }
            }
          }
        }
      }
    });
  }

  /**
   * Create a Bar (Monthly Income vs Expenses) Chart
   * @param {string} canvasId 
   * @param {Array} labels 
   * @param {Array} datasets - e.g. [{ label: 'Income', data: [...] }, { label: 'Expenses', data: [...] }]
   * @returns {Chart|null}
   */
  function createBarChart(canvasId, labels, datasets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    configureChartJS();

    const ctx = canvas.getContext('2d');
    
    // Create subtle linear gradients for income and expenses
    const cyanGrad = ctx.createLinearGradient(0, 0, 0, 300);
    cyanGrad.addColorStop(0, 'rgba(0, 212, 255, 0.85)');
    cyanGrad.addColorStop(1, 'rgba(0, 212, 255, 0.1)');

    const purpleGrad = ctx.createLinearGradient(0, 0, 0, 300);
    purpleGrad.addColorStop(0, 'rgba(123, 47, 255, 0.85)');
    purpleGrad.addColorStop(1, 'rgba(123, 47, 255, 0.1)');

    const greenGrad = ctx.createLinearGradient(0, 0, 0, 300);
    greenGrad.addColorStop(0, 'rgba(0, 230, 118, 0.85)');
    greenGrad.addColorStop(1, 'rgba(0, 230, 118, 0.1)');

    const redGrad = ctx.createLinearGradient(0, 0, 0, 300);
    redGrad.addColorStop(0, 'rgba(255, 82, 82, 0.85)');
    redGrad.addColorStop(1, 'rgba(255, 82, 82, 0.1)');

    const processedDatasets = datasets.map((ds, index) => {
      let bg = cyanGrad;
      let border = '#00D4FF';
      
      if (ds.label.toLowerCase().includes('expense')) {
        bg = redGrad;
        border = '#FF5252';
      } else if (ds.label.toLowerCase().includes('income')) {
        bg = greenGrad;
        border = '#00E676';
      } else if (index === 1) {
        bg = purpleGrad;
        border = '#7B2FFF';
      }

      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: bg,
        borderColor: border,
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.6
      };
    });

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: processedDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: { weight: '500' }
            }
          },
          y: {
            grid: {
              color: CHART_DEFAULTS.gridColor
            },
            border: { dash: [4, 4] }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end'
          }
        }
      }
    });
  }

  /**
   * Create a Line (Spending Trends) Chart
   * @param {string} canvasId 
   * @param {Array} labels 
   * @param {Array} datasets - e.g. [{ label: 'Spending', data: [...] }]
   * @returns {Chart|null}
   */
  function createLineChart(canvasId, labels, datasets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    configureChartJS();

    const ctx = canvas.getContext('2d');

    const processedDatasets = datasets.map((ds, index) => {
      // Create fill gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 250);
      
      let lineColor = '#00D4FF';
      if (index === 0) {
        grad.addColorStop(0, 'rgba(0, 212, 255, 0.25)');
        grad.addColorStop(1, 'rgba(0, 212, 255, 0)');
        lineColor = '#00D4FF';
      } else {
        grad.addColorStop(0, 'rgba(123, 47, 255, 0.25)');
        grad.addColorStop(1, 'rgba(123, 47, 255, 0)');
        lineColor = '#7B2FFF';
      }

      return {
        label: ds.label,
        data: ds.data,
        borderColor: lineColor,
        borderWidth: 3,
        fill: true,
        backgroundColor: grad,
        tension: 0.4, // Smooth curved lines
        pointBackgroundColor: lineColor,
        pointBorderColor: '#111827',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      };
    });

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: processedDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: { weight: '500' }
            }
          },
          y: {
            grid: {
              color: CHART_DEFAULTS.gridColor
            },
            border: { dash: [4, 4] }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end'
          }
        }
      }
    });
  }

  return {
    createDoughnutChart,
    createBarChart,
    createLineChart
  };
})();
