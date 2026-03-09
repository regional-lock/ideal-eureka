import { tmdb } from './tmdb.js';
import { initSearchDropdown } from './search-dropdown.js';

const trendingGrid = document.getElementById('trendingGrid');
const popularGrid = document.getElementById('popularGrid');
const topRatedGrid = document.getElementById('topRatedGrid');
const hero = document.getElementById('hero');
const heroContent = document.getElementById('heroContent');
const searchInput = document.getElementById('searchInput');

const typeFilter = document.getElementById('typeFilter');
const genreFilter = document.getElementById('genreFilter');
const languageFilter = document.getElementById('languageFilter');
const countryFilter = document.getElementById('countryFilter');
const discoverySection = document.getElementById('discoverySection');
const discoveryGrid = document.getElementById('discoveryGrid');
const discoveryTitle = document.getElementById('discoveryTitle');
const mainContent = document.getElementById('mainContent');

// State
let currentFilters = {
    with_genres: '',
    with_original_language: '',
    region: ''
};

// Pagination state
let currentPage = 1;
let totalPages = 1;
let currentMode = null;   // 'search' | 'discover'
let currentQuery = '';    // last search query

// Slider State — single source of truth
let sliderOffset = 0;
const SLIDE_INTERVAL = 3000;
let autoPlayTimer;

// Search handler with debounce (for full-page search on Enter)
let debounceTimer;

async function handleSearch(query, page = 1) {
    if (query.trim().length > 2) {
        // If not on the index page, redirect there with the search param
        const path = window.location.pathname;
        const onIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/');
        if (!onIndex) {
            window.location.href = `index.html?search=${encodeURIComponent(query)}`;
            return;
        }
        const [data, data2] = await Promise.all([
            tmdb.searchMulti(query, page * 2 - 1),
            tmdb.searchMulti(query, page * 2)
        ]);
        if (data) {
            currentMode = 'search';
            currentQuery = query;
            currentPage = page;
            totalPages = Math.min(Math.floor(data.total_pages / 2), 250);

            const combined = [...(data.results || []), ...(data2?.results || [])].slice(0, 26);

            discoverySection.style.display = 'block';
            discoveryTitle.innerText = `Results for "${query}"`;
            displayMovies(combined, discoveryGrid);
            renderPagination();

            // Hide other sections
            document.querySelectorAll('main > section:not(#discoverySection)').forEach(s => s.style.display = 'none');
            hero.style.height = '30vh';
            if (page === 1) window.scrollTo({ top: 400, behavior: 'smooth' });
        }
    } else if (query.trim().length === 0) {
        const path = window.location.pathname;
        const onIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/');
        if (onIndex) {
            window.location.href = 'index.html';
        }
    }
}

// Wire up live search dropdown — Enter triggers full filtered results
initSearchDropdown({
    onSelect: (type, id) => openDetails(type, id),
    onSearch: (query)    => handleSearch(query, 1)
});

// ── Hero Search Bar ──────────────────────────────────────────────────────────
(function initHeroSearch() {
    const heroInput    = document.getElementById('heroSearchInput');
    const heroBtn      = document.getElementById('heroSearchBtn');
    const heroDropdown = document.getElementById('heroSearchDropdown');
    if (!heroInput || !heroBtn || !heroDropdown) return;

    let heroDebounce = null;
    let heroResults  = [];
    let heroActive   = -1;

    function showHeroDrop() { heroDropdown.style.display = 'block'; }
    function hideHeroDrop() { heroDropdown.style.display = 'none'; heroActive = -1; }

    function renderHeroDrop(results) {
        heroResults = results.filter(r => r.media_type !== 'person');
        if (!heroResults.length) {
            heroDropdown.innerHTML = `<div class="search-dropdown-empty">No results found</div>`;
            showHeroDrop(); return;
        }
        heroDropdown.innerHTML = heroResults.map((item, i) => {
            const title     = item.title || item.name || '';
            const mediaType = item.media_type || 'movie';
            const year      = (item.release_date || item.first_air_date || '').split('-')[0];
            const rating    = item.vote_average ? item.vote_average.toFixed(1) : null;
            const poster    = item.poster_path
                ? `https://image.tmdb.org/t/p/w92${item.poster_path}`
                : 'https://via.placeholder.com/40x58?text=N/A';
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
                </div>`;
        }).join('');
        showHeroDrop();
        heroDropdown.querySelectorAll('.search-dropdown-item').forEach(el => {
            el.addEventListener('mousedown', e => {
                e.preventDefault();
                hideHeroDrop();
                heroInput.value = '';
                openDetails(el.dataset.type, el.dataset.id);
            });
        });
    }

    heroInput.addEventListener('input', e => {
        const q = e.target.value.trim();
        heroActive = -1;
        clearTimeout(heroDebounce);
        if (q.length < 2) { hideHeroDrop(); return; }
        heroDropdown.innerHTML = `<div class="search-dropdown-loading">Searching…</div>`;
        showHeroDrop();
        heroDebounce = setTimeout(async () => {
            const data = await tmdb.searchMulti(q, 1);
            if (!data) { hideHeroDrop(); return; }
            renderHeroDrop(data.results.slice(0, 8));
        }, 300);
    });

    heroInput.addEventListener('keydown', e => {
        const items = heroDropdown.querySelectorAll('.search-dropdown-item');
        if (heroDropdown.style.display === 'none') {
            if (e.key === 'Enter') { handleSearch(heroInput.value.trim(), 1); }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            heroActive = Math.min(heroActive + 1, items.length - 1);
            items.forEach((el, i) => el.style.background = i === heroActive ? 'rgba(255,255,255,0.08)' : '');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            heroActive = Math.max(heroActive - 1, 0);
            items.forEach((el, i) => el.style.background = i === heroActive ? 'rgba(255,255,255,0.08)' : '');
        } else if (e.key === 'Enter') {
            if (heroActive >= 0 && items[heroActive]) {
                items[heroActive].dispatchEvent(new MouseEvent('mousedown'));
            } else {
                hideHeroDrop();
                handleSearch(heroInput.value.trim(), 1);
            }
        } else if (e.key === 'Escape') {
            hideHeroDrop();
        }
    });

    heroBtn.addEventListener('click', () => {
        hideHeroDrop();
        handleSearch(heroInput.value.trim(), 1);
    });

    document.addEventListener('click', e => {
        if (!heroInput.closest('.hero-search-bar').contains(e.target)) hideHeroDrop();
    });
})();

// Initialization
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const typeParam = urlParams.get('type');
    const searchParam = urlParams.get('search');

    if (typeParam) typeFilter.value = typeParam;

    const [trending, popular, topRated, genres, langs, countries] = await Promise.all([
        tmdb.getTrending(),
        tmdb.getPopular(),
        tmdb.getTopRatedTV(),
        tmdb.getGenres(typeParam || 'movie'),
        tmdb.getLanguages(),
        tmdb.getCountries()
    ]);

    populateDropdown(genreFilter, genres.genres, 'id', 'name');
    populateDropdown(languageFilter, langs.sort((a, b) => a.english_name.localeCompare(b.english_name)), 'iso_639_1', 'english_name');
    populateDropdown(countryFilter, countries.sort((a, b) => a.english_name.localeCompare(b.english_name)), 'iso_3166_1', 'english_name');

    if (trending) {
        setHero(trending.results[0]);
        displayMovies(trending.results, trendingGrid, 'movie');
        initSlider();
    }
    if (popular) displayMovies(popular.results.slice(0, 18), popularGrid, 'movie');
    if (topRated) displayMovies(topRated.results.slice(0, 18), topRatedGrid, 'tv');

    // Handle deep links
    if (searchParam) {
        searchInput.value = searchParam;
        handleSearch(searchParam);
    } else if (typeParam) {
        updateDiscovery();
    }
}

// ---------------------------------------------------------------------------
// Slider — single unified implementation
// ---------------------------------------------------------------------------
function initSlider() {
    const track = document.getElementById('trendingGrid');
    if (!track) return;

    // Reset position
    sliderOffset = 0;
    track.style.transform = 'translateX(0)';
    updateArrows();

    startAutoPlay();

    track.onmouseenter = stopAutoPlay;
    track.onmouseleave = startAutoPlay;

    window.addEventListener('resize', () => {
        sliderOffset = 0;
        track.style.transform = 'translateX(0)';
        updateArrows();
    });
}

function updateArrows() {
    const track = document.getElementById('trendingGrid');
    const viewport = track?.closest('.slider-viewport');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (!track || !viewport) return;

    const maxScroll = Math.max(0, track.scrollWidth - viewport.offsetWidth);
    if (prevBtn) prevBtn.style.opacity = sliderOffset <= 0 ? '0.3' : '1';
    if (nextBtn) nextBtn.style.opacity = sliderOffset >= maxScroll ? '0.3' : '1';
}

window.moveSlider = function (direction) {
    const track    = document.getElementById('trendingGrid');
    const viewport = track?.closest('.slider-viewport');
    if (!track || !viewport) return;

    const card = track.querySelector('.movie-card');
    if (!card) return;

    const gap       = parseFloat(getComputedStyle(track).gap) || 0;
    const cardW     = card.offsetWidth + gap;
    const visible   = Math.max(1, Math.round(viewport.offsetWidth / cardW));
    const step      = cardW * visible;
    const maxScroll = Math.max(0, track.scrollWidth - viewport.offsetWidth);

    if (direction === 'next') {
        // Wrap around to start when reaching the end
        sliderOffset = (sliderOffset + step > maxScroll) ? 0 : sliderOffset + step;
    } else {
        // Wrap around to end when at the start
        sliderOffset = (sliderOffset - step < 0) ? maxScroll : sliderOffset - step;
    }

    track.style.transform = `translateX(-${sliderOffset}px)`;
    updateArrows();
};

function startAutoPlay() {
    stopAutoPlay();
    autoPlayTimer = setInterval(() => window.moveSlider('next'), SLIDE_INTERVAL);
}

function stopAutoPlay() {
    clearInterval(autoPlayTimer);
}

export function resetSlider() {
    sliderOffset = 0;
    const track = document.getElementById('trendingGrid');
    if (track) track.style.transform = 'translateX(0)';
    updateArrows();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function populateDropdown(select, items, valueKey, textKey) {
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item[valueKey];
        option.textContent = item[textKey];
        select.appendChild(option);
    });
}

async function updateDiscovery(page = 1) {
    const type = typeFilter.value;

    // Fetch current page + next page to get enough results for 26 items per page
    const [data, data2] = await Promise.all([
        tmdb.discover(type, currentFilters, page * 2 - 1),
        tmdb.discover(type, currentFilters, page * 2)
    ]);

    if (data) {
        currentMode = 'discover';
        currentPage = page;
        totalPages = Math.min(Math.floor(data.total_pages / 2), 250);

        const combined = [...(data.results || []), ...(data2?.results || [])].slice(0, 26);

        discoverySection.style.display = 'block';
        discoveryTitle.innerText = `Filtered ${type === 'movie' ? 'Movies' : 'TV Shows'}`;
        displayMovies(combined, discoveryGrid, type);
        renderPagination();

        document.querySelectorAll('main > section:not(#discoverySection)').forEach(s => s.style.display = 'none');
        hero.style.height = '40vh';
        if (page > 1) window.scrollTo({ top: document.getElementById('discoverySection').offsetTop - 80, behavior: 'smooth' });
    }
}

// Event Listeners
typeFilter.onchange = async (e) => {
    const type = e.target.value;
    const genres = await tmdb.getGenres(type);
    genreFilter.innerHTML = '<option value="">All Genres</option>';
    populateDropdown(genreFilter, genres.genres, 'id', 'name');
    currentPage = 1;
    updateDiscovery(1);
};

genreFilter.onchange = (e) => {
    currentFilters.with_genres = e.target.value;
    currentPage = 1;
    updateDiscovery(1);
};

languageFilter.onchange = (e) => {
    currentFilters.with_original_language = e.target.value;
    currentPage = 1;
    updateDiscovery(1);
};

countryFilter.onchange = (e) => {
    currentFilters.region = e.target.value;
    currentPage = 1;
    updateDiscovery(1);
};

function setHero(movie) {
    hero.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${movie.backdrop_path})`;
    heroContent.innerHTML = `
        <h1>${movie.title}</h1>
        <p>${movie.overview.substring(0, 150)}...</p>
        <button class="btn btn-primary" id="heroBtn">View Details</button>
    `;
    document.getElementById('heroBtn').onclick = () => openDetails('movie', movie.id);
}

function displayMovies(movies, container, type = 'movie') {
    container.innerHTML = '';
    movies.forEach(movie => {
        if (!movie.poster_path && !movie.profile_path) return;
        const mediaType = movie.media_type || type;
        if (mediaType === 'person') return;

        const title = movie.title || movie.name;
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.innerHTML = `
            <div class="badge ${mediaType}">${mediaType === 'movie' ? 'Movie' : 'Series'}</div>
            <img src="${tmdb.getImageUrl(movie.poster_path)}" alt="${title}">
            <div class="movie-info">
                <h3>${title}</h3>
                <div class="movie-meta">
                    <span>${(movie.release_date || movie.first_air_date || '').split('-')[0]}</span>
                    <span class="rating">★ ${movie.vote_average.toFixed(1)}</span>
                </div>
            </div>
        `;
        card.onclick = () => openDetails(mediaType, movie.id);
        container.appendChild(card);
    });
}

function openDetails(type, id) {
    window.location.href = `detail.html?id=${id}&type=${type}`;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
function renderPagination() {
    // Remove any existing pagination
    const existing = document.getElementById('discoveryPagination');
    if (existing) existing.remove();

    if (totalPages <= 1) return;

    const nav = document.createElement('div');
    nav.id = 'discoveryPagination';
    nav.className = 'pagination';

    const pages = getPageNumbers(currentPage, totalPages);

    nav.innerHTML = `
        <button class="page-btn" onclick="window.goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
        ${pages.map(p =>
            p === '...'
                ? `<span class="page-ellipsis">…</span>`
                : `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="window.goToPage(${p})">${p}</button>`
        ).join('')}
        <button class="page-btn" onclick="window.goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
    `;

    discoverySection.appendChild(nav);
}

// Returns an array like [1, 2, 3, '...', 48, 49, 50] centered around current page
function getPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [];
    const delta = 2; // pages on each side of current

    const left  = Math.max(2, current - delta);
    const right = Math.min(total - 1, current + delta);

    pages.push(1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < total - 1) pages.push('...');
    pages.push(total);

    return pages;
}

window.goToPage = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    if (currentMode === 'search') {
        handleSearch(currentQuery, page);
    } else if (currentMode === 'discover') {
        updateDiscovery(page);
    }
};

init();
