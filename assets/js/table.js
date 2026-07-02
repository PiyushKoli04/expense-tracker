/* ============================================
   TABLE — table.js
   Reusable Table Engine (Sort, Search, Filter, Paginate, Mobile Views)
   ============================================ */

class TableEngine {
  /**
   * Initialize a data table
   * @param {object} config
   * {
   *   tableId: 'expenseTable', // ID of the <table> element
   *   toolbarId: 'expenseToolbar', // Optional toolbar container ID
   *   paginationId: 'expensePagination', // Optional pagination container ID
   *   columns: [
   *     { key: 'title', label: 'Title', sortable: true, render: (val, row) => ... },
   *     { key: 'amount', label: 'Amount', sortable: true, render: ... }
   *   ],
   *   data: [], // Array of row items
   *   pageSize: 10,
   *   onEdit: (row) => {},
   *   onDelete: (row) => {},
   *   emptyMessage: 'No records found'
   * }
   */
  constructor(config) {
    this.table = document.getElementById(config.tableId);
    if (!this.table) {
      console.warn(`Table element with ID "${config.tableId}" not found.`);
      return;
    }
    
    this.columns = config.columns || [];
    this.rawData = config.data || [];
    this.filteredData = [...this.rawData];
    this.pageSize = config.pageSize || 10;
    this.currentPage = 1;
    this.sortBy = config.sortBy || '';
    this.sortDir = config.sortDir || 'desc'; // 'asc' or 'desc'
    this.onEdit = config.onEdit || null;
    this.onDelete = config.onDelete || null;
    this.emptyMessage = config.emptyMessage || 'No records found';

    this.toolbar = document.getElementById(config.toolbarId);
    this.pagination = document.getElementById(config.paginationId);

    // Filter state
    this.searchQuery = '';
    this.filters = {}; // e.g. { category: 'Food & Dining', paymentMethod: 'UPI' }

    this.init();
  }

  setData(newData) {
    this.rawData = newData || [];
    this.applyFiltersAndSort();
  }

  init() {
    this.setupHeaders();
    this.setupToolbarListeners();
    this.applyFiltersAndSort();
  }

  setupHeaders() {
    let thead = this.table.querySelector('thead');
    if (!thead) {
      thead = document.createElement('thead');
      this.table.appendChild(thead);
    }
    thead.innerHTML = '';

    const tr = document.createElement('tr');
    this.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.sortable) {
        th.classList.add('sortable');
        if (this.sortBy === col.key) {
          th.classList.add('sorted');
          th.innerHTML = `${col.label} <span class="sort-icon"><i data-lucide="${this.sortDir === 'asc' ? 'chevron-up' : 'chevron-down'}" style="width:14px; height:14px; vertical-align:middle; display:inline-block;"></i></span>`;
        } else {
          th.innerHTML = `${col.label} <span class="sort-icon"><i data-lucide="chevrons-up-down" style="width:14px; height:14px; vertical-align:middle; display:inline-block; opacity:0.5;"></i></span>`;
        }
        th.addEventListener('click', () => this.handleSort(col.key));
      }
      tr.appendChild(th);
    });

    // Add actions column if edit/delete is supported
    if (this.onEdit || this.onDelete) {
      const th = document.createElement('th');
      th.textContent = 'Actions';
      th.style.textAlign = 'right';
      tr.appendChild(th);
    }

    thead.appendChild(tr);
  }

  setupToolbarListeners() {
    if (!this.toolbar) return;

    // Search input
    const searchInput = this.toolbar.querySelector('[data-table-search]');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.currentPage = 1;
        this.applyFiltersAndSort();
      }, 250));
    }

    // Filter selects
    const filterSelects = this.toolbar.querySelectorAll('[data-table-filter]');
    filterSelects.forEach(select => {
      select.addEventListener('change', (e) => {
        const filterKey = e.target.dataset.tableFilter;
        const filterValue = e.target.value;
        if (filterValue === '' || filterValue === 'All') {
          delete this.filters[filterKey];
        } else {
          this.filters[filterKey] = filterValue;
        }
        this.currentPage = 1;
        this.applyFiltersAndSort();
      });
    });
  }

  handleSort(key) {
    if (this.sortBy === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = key;
      this.sortDir = 'desc';
    }
    this.setupHeaders();
    this.applyFiltersAndSort();
  }

  applyFiltersAndSort() {
    // 1. Filter
    this.filteredData = this.rawData.filter(row => {
      // Search text match
      if (this.searchQuery) {
        const matchSearch = this.columns.some(col => {
          if (!col.searchable) return false;
          const val = row[col.key];
          return val && String(val).toLowerCase().includes(this.searchQuery);
        });
        if (!matchSearch) return false;
      }

      // Filter select match
      for (const [key, val] of Object.entries(this.filters)) {
        if (row[key] !== val) return false;
      }

      return true;
    });

    // 2. Sort
    if (this.sortBy) {
      this.filteredData.sort((a, b) => {
        let valA = a[this.sortBy];
        let valB = b[this.sortBy];

        // Format dates for comparison if necessary
        if (this.sortBy === 'date' || this.sortBy === 'createdAt') {
          valA = Utils.toDate(valA).getTime();
          valB = Utils.toDate(valB).getTime();
        } else if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        } else {
          valA = parseFloat(valA) || 0;
          valB = parseFloat(valB) || 0;
        }

        if (valA < valB) return this.sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return this.sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    this.render();
  }

  render() {
    let tbody = this.table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      this.table.appendChild(tbody);
    }
    tbody.innerHTML = '';

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdx = startIdx + this.pageSize;
    const pageData = this.filteredData.slice(startIdx, endIdx);

    if (pageData.length === 0) {
      const colCount = this.columns.length + (this.onEdit || this.onDelete ? 1 : 0);
      tbody.innerHTML = `
        <tr>
          <td colspan="${colCount}" class="text-center" style="padding:48px 0; color:var(--text-muted); text-align:center;">
            <div style="font-size: 2rem; margin-bottom: 8px; display:flex; justify-content:center; align-items:center; color:var(--text-muted); opacity:0.6;">
              <i data-lucide="inbox" style="width:40px; height:40px;"></i>
            </div>
            <div>${this.emptyMessage}</div>
          </td>
        </tr>
      `;
      this.renderPagination(0);
      
      // Re-initialize Lucide icons for empty state
      if (typeof UI !== 'undefined' && UI.reinitIcons) {
        UI.reinitIcons();
      }
      return;
    }

    pageData.forEach(row => {
      const tr = document.createElement('tr');
      tr.dataset.id = row.id;

      this.columns.forEach(col => {
        const td = document.createElement('td');
        const value = row[col.key];
        
        if (col.render) {
          td.innerHTML = col.render(value, row);
        } else {
          td.textContent = value !== undefined ? value : '—';
        }
        
        if (col.class) {
          td.className = col.class;
        }
        
        tr.appendChild(td);
      });

      // Actions Column
      if (this.onEdit || this.onDelete) {
        const td = document.createElement('td');
        td.className = 'cell-actions';
        td.style.textAlign = 'right';

        let actionButtons = '';
        if (this.onEdit) {
          actionButtons += `
            <button class="btn btn-icon btn-icon--sm btn-secondary btn-edit" title="Edit" style="display:inline-flex; align-items:center; justify-content:center;">
              <i data-lucide="pencil" style="width:14px; height:14px;"></i>
            </button>
          `;
        }
        if (this.onDelete) {
          actionButtons += `
            <button class="btn btn-icon btn-icon--sm btn-danger btn-delete" title="Delete" style="margin-left: 4px; display:inline-flex; align-items:center; justify-content:center;">
              <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
            </button>
          `;
        }

        td.innerHTML = actionButtons;

        // Wire up buttons
        if (this.onEdit) {
          td.querySelector('.btn-edit').addEventListener('click', (e) => {
            e.stopPropagation();
            this.onEdit(row);
          });
        }
        if (this.onDelete) {
          td.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            this.onDelete(row);
          });
        }

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    });

    this.renderPagination(this.filteredData.length);

    // Re-initialize Lucide icons after rendering table contents and headers
    if (typeof UI !== 'undefined' && UI.reinitIcons) {
      UI.reinitIcons();
    }
  }

  renderPagination(totalItems) {
    if (!this.pagination) return;

    if (totalItems === 0) {
      this.pagination.style.display = 'none';
      return;
    }
    this.pagination.style.display = 'flex';

    const totalPages = Math.ceil(totalItems / this.pageSize);
    const startItem = (this.currentPage - 1) * this.pageSize + 1;
    const endItem = Math.min(this.currentPage * this.pageSize, totalItems);

    // Left info side
    let info = this.pagination.querySelector('.table-pagination__info');
    if (!info) {
      info = document.createElement('div');
      info.className = 'table-pagination__info';
      this.pagination.appendChild(info);
    }
    info.innerHTML = `Showing <strong>${startItem}-${endItem}</strong> of <strong>${totalItems}</strong> entries`;

    // Right controls side
    let controls = this.pagination.querySelector('.table-pagination__controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'table-pagination__controls';
      this.pagination.appendChild(controls);
    }
    controls.innerHTML = '';

    // Prev Button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'table-pagination__btn';
    prevBtn.style.display = 'inline-flex';
    prevBtn.style.alignItems = 'center';
    prevBtn.style.justifyContent = 'center';
    prevBtn.innerHTML = '<i data-lucide="chevron-left" style="width:16px; height:16px;"></i>';
    prevBtn.disabled = this.currentPage === 1;
    prevBtn.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.applyFiltersAndSort();
      }
    });
    controls.appendChild(prevBtn);

    // Page numbers
    const maxPageButtons = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPageButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
    
    if (endPage - startPage + 1 < maxPageButtons) {
      startPage = Math.max(1, endPage - maxPageButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      const pageBtn = document.createElement('button');
      pageBtn.className = `table-pagination__btn ${p === this.currentPage ? 'active' : ''}`;
      pageBtn.textContent = p;
      pageBtn.addEventListener('click', () => {
        this.currentPage = p;
        this.applyFiltersAndSort();
      });
      controls.appendChild(pageBtn);
    }

    // Next Button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'table-pagination__btn';
    nextBtn.style.display = 'inline-flex';
    nextBtn.style.alignItems = 'center';
    nextBtn.style.justifyContent = 'center';
    nextBtn.innerHTML = '<i data-lucide="chevron-right" style="width:16px; height:16px;"></i>';
    nextBtn.disabled = this.currentPage === totalPages;
    nextBtn.addEventListener('click', () => {
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.applyFiltersAndSort();
      }
    });
    controls.appendChild(nextBtn);
  }
}
