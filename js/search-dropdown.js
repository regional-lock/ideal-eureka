import { tmdb } from './tmdb.js';

/**
 * Attaches a live-search dropdown to the nav search input.
 * @param {object} options
 *   onSelect(mediaType, id) — called when user clicks a result
 *   onSearch(query)         — called when user presses Enter (full search)
 */
export function initSearchDropdown({ onSelect, onSearch } = {}) {
    const input = document.getElementById('searchInput');
    if (!input) return;

    // Create dropdown element and insert after input
    const dropdown = document.createElement('div');
    dropdown.className = 'search-dropdown';
    dropdown.style.display = 'none';
    input.parentElement.appendChild(dropdown);

    let debounceTimer = null;
    let activeIndex   = -1;
    let currentResults = [];

    // ── Helpers ──────────────────────────────────────────────────────────────

    function showDropdown() { dropdown.style.display = 'block'; }
    function hideDropdown() { dropdown.style.display = 'none'; activeIndex = -1; }

    function setLoading() {
        dropdown.innerHTML = `<div class="search-dropdown-loading">Searching…</div>`;
        showDropdown();
    }

    function renderResults(results) {
        currentResults = results.filter(r => r.media_type !== 'person');

        if (currentResults.length === 0) {
            dropdown.innerHTML = `<div class="search-dropdown-empty">No results found</div>`;
            showDropdown();
            return;
        }

        dropdown.innerHTML = currentResults.map((item, i) => {
            const title      = item.title || item.name || '';
            const mediaType  = item.media_type || 'movie';
            const year       = (item.release_date || item.first_air_date || '').split('-')[0];
            const rating     = item.vote_average ? item.vote_average.toFixed(1) : null;
            const poster     = item.poster_path
                ? `https://image.tmdb.org/t/p/w92${item.poster_path}`
                : 'https://via.placeholder.com/38x56?text=N/A';

            return `
                <div class="search-dropdown-item" data-index="${i}" data-id="${item.id}" data-type="${mediaType}">
                    <img src="${poster}" alt="${title}" loading="lazy">
                    <div class="search-dropdown-info">
                        <div class="search-dropdown-title">${title}</div>
                        <div class="search-dropdown-meta">
                            <span class="search-dropdown-badge ${mediaType}">${mediaType === 'tv' ? 'Series' : 'Movie'}</span>
                            ${year ? `<span>${year}</span>` : ''}
                            ${rating ? `<span class="search-dropdown-rating">★ ${rating}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        showDropdown();

        // Click handler on each item
        dropdown.querySelectorAll('.search-dropdown-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault(); // prevent input blur before click fires
                const id   = el.dataset.id;
                const type = el.dataset.type;
                hideDropdown();
                input.value = '';
                if (onSelect) onSelect(type, id);
                else window.location.href = `detail.html?id=${id}&type=${type}`;
            });
        });
    }

    // ── Keyboard navigation ───────────────────────────────────────────────────

    function highlightItem(index) {
        const items = dropdown.querySelectorAll('.search-dropdown-item');
        items.forEach(el => el.style.background = '');
        if (index >= 0 && index < items.length) {
            items[index].style.background = 'rgba(255,255,255,0.08)';
            items[index].scrollIntoView({ block: 'nearest' });
        }
    }

    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.search-dropdown-item');
        if (dropdown.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            highlightItem(activeIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            highlightItem(activeIndex);
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && items[activeIndex]) {
                items[activeIndex].dispatchEvent(new MouseEvent('mousedown'));
            } else {
                hideDropdown();
                if (onSearch) onSearch(input.value.trim());
                else if (input.value.trim().length > 2) {
                    window.location.href = `index.html?search=${encodeURIComponent(input.value.trim())}`;
                }
            }
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });

    // ── Input handler ─────────────────────────────────────────────────────────

    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        activeIndex = -1;
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            hideDropdown();
            return;
        }

        setLoading();

        debounceTimer = setTimeout(async () => {
            const data = await tmdb.searchMulti(query, 1);
            if (!data) { hideDropdown(); return; }
            renderResults(data.results.slice(0, 8));
        }, 300);
    });

    // ── Close on outside click ────────────────────────────────────────────────

    document.addEventListener('click', (e) => {
        if (!input.parentElement.contains(e.target)) hideDropdown();
    });

    input.addEventListener('focus', () => {
        if (input.value.trim().length >= 2 && currentResults.length > 0) showDropdown();
    });
}
