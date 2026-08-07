const filterBar = document.querySelector('.filter-bar');
const buttons = [...document.querySelectorAll('[data-filter]')];
const cards = [...document.querySelectorAll('[data-review-grid] .review-card')];
const grid = document.querySelector('[data-review-grid]');
const empty = document.querySelector('[data-filter-empty]');
const pagination = document.querySelector('[data-pagination]');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let currentFilter = '모두보기';
let currentPage = 1;
let lastPageSize = 0;

function pageSize() {
  const mobileLike = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  return mobileLike ? 10 : 48;
}

function pageWindow(current, total) {
  const count = Math.min(5, total);
  if (total <= count) return Array.from({ length: total }, (_, index) => index + 1);

  let start = Math.max(1, current - 2);
  let end = start + count - 1;

  if (end > total) {
    end = total;
    start = total - count + 1;
  }

  return Array.from({ length: count }, (_, index) => start + index);
}

function paginationButton(label, page, options = {}) {
  const { active = false, disabled = false, ariaLabel = '' } = options;
  return `<button type="button" class="page-button${active ? ' is-active' : ''}" data-page="${page}"${disabled ? ' disabled' : ''}${active ? ' aria-current="page"' : ''}${ariaLabel ? ` aria-label="${ariaLabel}" title="${ariaLabel}"` : ''}>${label}</button>`;
}

function renderPagination(totalPages) {
  if (!pagination) return;
  pagination.hidden = totalPages <= 1;

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const numbers = pageWindow(currentPage, totalPages);
  pagination.innerHTML = [
    paginationButton('«', 1, { disabled: currentPage === 1, ariaLabel: '첫 페이지' }),
    ...numbers.map((page) => paginationButton(String(page), page, { active: page === currentPage })),
    paginationButton('»', totalPages, { disabled: currentPage === totalPages, ariaLabel: '마지막 페이지' }),
  ].join('');
}

function applyView({ scroll = false } = {}) {
  const size = pageSize();
  lastPageSize = size;
  const matching = cards.filter((card) => currentFilter === '모두보기' || card.dataset.mediaCategory === currentFilter);
  const totalPages = Math.max(1, Math.ceil(matching.length / size));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const start = (currentPage - 1) * size;
  const visible = new Set(matching.slice(start, start + size));

  for (const card of cards) {
    const show = visible.has(card);
    card.hidden = !show;
    card.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  for (const button of buttons) {
    const active = button.dataset.filter === currentFilter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  if (empty) empty.hidden = matching.length !== 0;
  renderPagination(matching.length ? totalPages : 0);

  if (scroll && grid) {
    grid.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

filterBar?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  currentFilter = button.dataset.filter;
  currentPage = 1;
  applyView();
});

pagination?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  currentPage = Number(button.dataset.page) || 1;
  applyView({ scroll: true });
});

let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const nextSize = pageSize();
    if (nextSize === lastPageSize) return;
    currentPage = 1;
    applyView();
  }, 120);
}, { passive: true });

applyView();
