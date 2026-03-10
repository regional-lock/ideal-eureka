import { tmdb } from './tmdb.js';
import { initSearchDropdown } from './search-dropdown.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const trendingGrid     = document.getElementById('trendingGrid');
const popularGrid      = document.getElementById('popularGrid');
const topRatedGrid     = document.getElementById('topRatedGrid');
const nowPlayingGrid   = document.getElementById('nowPlayingGrid');
const upcomingGrid     = document.getElementById('upcomingGrid');
const hero             = document.getElementById('hero');
const heroContent      = document.getElementById('heroContent');
const searchInput      = document.getElementById('searchInput');
const typeFilter       = document.getElementById('typeFilter');
const genreFilter      = document.getElementById('genreFilter');
const languageFilter   = document.getElementById('languageFilter');
const countryFilter    = document.getElementById('countryFilter');
const ratingFilter     = document.getElementById('ratingFilter');
const providerFilter   = document.getElementById('providerFilter');
const discoverySection = document.getElementById('discoverySection');
const discoveryGrid    = document.getElementById('discoveryGrid');
const discoveryTitle   = document.getElementById('discoveryTitle');
const watchlistBtn     = document.getElementById('watchlistBtn');
const watchlistSection = document.getElementById('watchlistSection');
const watchlistGrid    = document.getElementById('watchlistGrid');
const watchlistCount   = document.getElementById('watchlistCount');

// ── State ─────────────────────────────────────────────────────────────────────
let currentFilters = {
    with_genres: '',
    with_original_language: '',
    region: '',
    'vote_average.gte': '',
    with_watch_providers: ''
};
let currentPage      = 1;
let totalPages       = 1;
let currentMode      = null;  // 'search' | 'discover' | 'watchlist'
let currentQuery     = '';
let isLoadingMore    = false;
let infiniteObserver = null;

// Slider
let sliderOffset = 0;
const SLIDE_INTERVAL = 3500;
let autoPlayTimer;

// ── Watchlist ─────────────────────────────────────────────────────────────────
function getWatchlist() {
    try { return JSON.parse(localStorage.getItem('watchlist') || '[]'); } catch { return []; }
}
function saveWatchlist(list) {
    localStorage.setItem('watchlist', JSON.stringify(list));
    updateWatchlistBadge();
}
function isInWatchlist(id) {
    return getWatchlist().some(m => m.id === id);
}
function toggleWatchlist(movie) {
    const list = getWatchlist();
    const idx  = list.findIndex(m => m.id === movie.id);
    if (idx >= 0) { list.splice(idx, 1); } else { list.unshift(movie); }
    saveWatchlist(list);
    return idx < 0; // true = added
}
function updateWatchlistBadge() {
    const count = getWatchlist().length;
    if (watchlistCount) {
        watchlistCount.textContent = count;
        watchlistCount.style.display = count > 0 ? 'flex' : 'none';
    }
}

// ── Skeleton loading ──────────────────────────────────────────────────────────
function renderSkeletons(container, count = 18) {
    container.innerHTML = Array(count).fill(0).map(() => `
        <div class="movie-card skeleton-card">
            <div class="skeleton skeleton-poster"></div>
            <div class="movie-info">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-meta"></div>
            </div>
        </div>
    `).join('');
}

// ── Search ────────────────────────────────────────────────────────────────────
async function handleSearch(query, page = 1) {
    if (query.trim().length < 2) {
        if (query.trim().length === 0) resetToHome();
        return;
    }
    const path    = window.location.pathname;
    const onIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/');
    if (!onIndex) {
        window.location.href = `index.html?search=${encodeURIComponent(query)}`;
        return;
    }

    if (page === 1) {
        showDiscovery();
        discoveryTitle.innerText = `Results for "${query}"`;
        renderSkeletons(discoveryGrid, 20);
    }

    const [data, data2] = await Promise.all([
        tmdb.searchMulti(query, page * 2 - 1),
        tmdb.searchMulti(query, page * 2)
    ]);
    if (!data) return;

    currentMode  = 'search';
    currentQuery = query;
    currentPage  = page;
    totalPages   = Math.min(Math.floor(data.total_pages / 2), 250);

    const combined = [...(data.results || []), ...(data2?.results || [])].filter(r => r.media_type !== 'person');

    if (page === 1) {
        displayMovies(combined, discoveryGrid);
        hero.style.height = '30vh';
        window.scrollTo({ top: 300, behavior: 'smooth' });
        setupInfiniteScroll();
    } else {
        appendMovies(combined, discoveryGrid);
    }
}

initSearchDropdown({
    onSelect: (type, id) => openDetails(type, id),
    onSearch: (query)    => handleSearch(query, 1)
});

// ── Hero Search Bar ───────────────────────────────────────────────────────────
(function initHeroSearch() {
    const heroInput    = document.getElementById('heroSearchInput');
    const heroBtn      = document.getElementById('heroSearchBtn');
    const heroDropdown = document.getElementById('heroSearchDropdown');
    if (heroDropdown) heroDropdown.remove();
    if (!heroInput || !heroBtn) return;
    let heroDebounce = null;
    heroInput.addEventListener('input', e => {
        const q = e.target.value.trim();
        clearTimeout(heroDebounce);
        if (q.length < 2) { if (q.length === 0) resetToHome(); return; }
        heroDebounce = setTimeout(() => handleSearch(q, 1), 350);
    });
    heroInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { clearTimeout(heroDebounce); handleSearch(heroInput.value.trim(), 1); }
        else if (e.key === 'Escape') { heroInput.value = ''; resetToHome(); }
    });
    heroBtn.addEventListener('click', () => { clearTimeout(heroDebounce); handleSearch(heroInput.value.trim(), 1); });
})();

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    const urlParams   = new URLSearchParams(window.location.search);
    const typeParam   = urlParams.get('type');
    const searchParam = urlParams.get('search');

    if (typeParam) typeFilter.value = typeParam;
    updateWatchlistBadge();

    // Immediate skeletons
    renderSkeletons(trendingGrid, 10);
    renderSkeletons(popularGrid, 18);
    renderSkeletons(topRatedGrid, 18);
    if (nowPlayingGrid) renderSkeletons(nowPlayingGrid, 18);
    if (upcomingGrid)   renderSkeletons(upcomingGrid, 18);

    const [trending, popular, topRated, nowPlaying, upcoming, genres, langs, countries] = await Promise.all([
        tmdb.getTrending(),
        tmdb.getPopular(),
        tmdb.getTopRatedTV(),
        tmdb.getNowPlaying(),
        tmdb.getUpcoming(),
        tmdb.getGenres(typeParam || 'movie'),
        tmdb.getLanguages(),
        tmdb.getCountries()
    ]);

    populateDropdown(genreFilter, genres.genres, 'id', 'name');
    populateDropdown(languageFilter, langs.sort((a, b) => a.english_name.localeCompare(b.english_name)), 'iso_639_1', 'english_name');
    populateDropdown(countryFilter,  countries.sort((a, b) => a.english_name.localeCompare(b.english_name)), 'iso_3166_1', 'english_name');

    if (trending)   { setHero(trending.results[0]); displayMovies(trending.results, trendingGrid, 'movie'); initSlider(); }
    if (popular)    displayMovies(popular.results.slice(0, 18), popularGrid, 'movie');
    if (topRated)   displayMovies(topRated.results.slice(0, 18), topRatedGrid, 'tv');
    if (nowPlaying && nowPlayingGrid) displayMovies(nowPlaying.results.slice(0, 18), nowPlayingGrid, 'movie');
    if (upcoming && upcomingGrid)     displayMovies(upcoming.results.slice(0, 18), upcomingGrid, 'movie');

    if (searchParam) { searchInput.value = searchParam; handleSearch(searchParam); }
    else if (typeParam) { updateDiscovery(); }
}

// ── Infinite Scroll ───────────────────────────────────────────────────────────
function setupInfiniteScroll() {
    if (infiniteObserver) infiniteObserver.disconnect();

    let sentinel = document.getElementById('infiniteSentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'infiniteSentinel';
        sentinel.style.cssText = 'height:1px;width:100%;pointer-events:none;';
    }
    // Remove from previous parent and re-attach
    discoverySection.appendChild(sentinel);

    infiniteObserver = new IntersectionObserver(async entries => {
        if (!entries[0].isIntersecting) return;
        if (isLoadingMore || currentPage >= totalPages) return;
        isLoadingMore = true;
        showInfiniteLoader();
        if (currentMode === 'search') {
            await handleSearch(currentQuery, currentPage + 1);
        } else if (currentMode === 'discover') {
            await loadMoreDiscovery(currentPage + 1);
        }
        hideInfiniteLoader();
        isLoadingMore = false;
    }, { rootMargin: '400px' });

    infiniteObserver.observe(sentinel);
}

function showInfiniteLoader() {
    let loader = document.getElementById('infiniteLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'infiniteLoader';
        loader.className = 'infinite-loader';
        loader.innerHTML = '<span></span><span></span><span></span>';
    }
    const sentinel = document.getElementById('infiniteSentinel');
    if (sentinel) discoverySection.insertBefore(loader, sentinel);
    else discoverySection.appendChild(loader);
}
function hideInfiniteLoader() { document.getElementById('infiniteLoader')?.remove(); }

// ── Discovery ─────────────────────────────────────────────────────────────────
function activeFilters() {
    // Strip keys with empty-string values so they don't pollute the TMDB query
    return Object.fromEntries(Object.entries(currentFilters).filter(([, v]) => v !== ''));
}

async function updateDiscovery(page = 1) {
    const type = typeFilter.value;
    if (page === 1) {
        showDiscovery();
        discoveryTitle.innerText = type === 'movie' ? 'Movies' : 'TV Shows';
        renderSkeletons(discoveryGrid, 20);
    }
    const filters = activeFilters();
    const [data, data2] = await Promise.all([
        tmdb.discover(type, filters, page * 2 - 1),
        tmdb.discover(type, filters, page * 2)
    ]);
    if (!data) return;
    currentMode = 'discover';
    currentPage = page;
    totalPages  = Math.min(Math.floor(data.total_pages / 2), 250);
    const combined = [...(data.results || []), ...(data2?.results || [])].slice(0, 26);
    if (page === 1) {
        displayMovies(combined, discoveryGrid, type);
        hero.style.height = '40vh';
        setupInfiniteScroll();
    } else {
        appendMovies(combined, discoveryGrid, type);
    }
}

async function loadMoreDiscovery(page) {
    const type = typeFilter.value;
    const filters = activeFilters();
    const [data, data2] = await Promise.all([
        tmdb.discover(type, filters, page * 2 - 1),
        tmdb.discover(type, filters, page * 2)
    ]);
    if (!data) return;
    currentPage = page;
    totalPages  = Math.min(Math.floor(data.total_pages / 2), 250);
    appendMovies([...(data.results || []), ...(data2?.results || [])].slice(0, 26), discoveryGrid, type);
}

function showDiscovery() {
    discoverySection.style.display = 'block';
    if (watchlistSection) watchlistSection.style.display = 'none';
    document.querySelectorAll('main > section:not(#discoverySection):not(#watchlistSection)').forEach(s => s.style.display = 'none');
}

function resetToHome() {
    discoverySection.style.display = 'none';
    if (watchlistSection) watchlistSection.style.display = 'none';
    document.querySelectorAll('main > section:not(#discoverySection):not(#watchlistSection)').forEach(s => s.style.display = '');
    hero.style.height = '';
    currentMode = null;
    if (infiniteObserver) infiniteObserver.disconnect();
}

// ── Watchlist View ────────────────────────────────────────────────────────────
function showWatchlistView() {
    currentMode = 'watchlist';
    discoverySection.style.display = 'none';
    if (watchlistSection) watchlistSection.style.display = 'block';
    document.querySelectorAll('main > section:not(#discoverySection):not(#watchlistSection)').forEach(s => s.style.display = 'none');
    hero.style.height = '30vh';
    if (infiniteObserver) infiniteObserver.disconnect();

    const list = getWatchlist();
    if (!list.length) {
        watchlistGrid.innerHTML = `
            <div class="watchlist-empty">
                <span>🎬</span>
                <p>Your watchlist is empty.<br>Click <strong>☆</strong> on any movie to save it.</p>
            </div>`;
        return;
    }
    displayMovies(list, watchlistGrid);
}

if (watchlistBtn) {
    watchlistBtn.addEventListener('click', () => {
        if (currentMode === 'watchlist') resetToHome();
        else showWatchlistView();
    });
}

// ── Filter listeners ──────────────────────────────────────────────────────────
typeFilter.onchange = async (e) => {
    const type = e.target.value;
    const genres = await tmdb.getGenres(type);
    genreFilter.innerHTML = '<option value="">All Genres</option>';
    populateDropdown(genreFilter, genres.genres, 'id', 'name');
    currentPage = 1; updateDiscovery(1);
};
genreFilter.onchange    = (e) => { currentFilters.with_genres = e.target.value; currentPage = 1; updateDiscovery(1); };
languageFilter.onchange = (e) => { currentFilters.with_original_language = e.target.value; currentPage = 1; updateDiscovery(1); };
countryFilter.onchange  = (e) => { currentFilters.region = e.target.value; currentPage = 1; updateDiscovery(1); };

if (ratingFilter) ratingFilter.onchange = (e) => {
    currentFilters['vote_average.gte'] = e.target.value;
    currentPage = 1; updateDiscovery(1);
};

if (providerFilter) providerFilter.onchange = (e) => {
    currentFilters['with_watch_providers'] = e.target.value;
    currentFilters['watch_region'] = e.target.value ? 'US' : '';
    currentFilters['with_ott_region'] = e.target.value ? 'US' : '';
    currentPage = 1; updateDiscovery(1);
};

function populateYearDropdowns() {}

// ── Slider ────────────────────────────────────────────────────────────────────
function initSlider() {
    const track = document.getElementById('trendingGrid');
    if (!track) return;
    sliderOffset = 0;
    track.style.transform = 'translateX(0)';
    updateArrows(); startAutoPlay();
    track.onmouseenter = stopAutoPlay;
    track.onmouseleave = startAutoPlay;
    window.addEventListener('resize', () => { sliderOffset = 0; track.style.transform = 'translateX(0)'; updateArrows(); });
}
function updateArrows() {
    const track    = document.getElementById('trendingGrid');
    const viewport = track?.closest('.slider-viewport');
    const prevBtn  = document.getElementById('prevBtn');
    const nextBtn  = document.getElementById('nextBtn');
    if (!track || !viewport) return;
    const maxScroll = Math.max(0, track.scrollWidth - viewport.offsetWidth);
    if (prevBtn) prevBtn.style.opacity = sliderOffset <= 0 ? '0.3' : '1';
    if (nextBtn) nextBtn.style.opacity = sliderOffset >= maxScroll ? '0.3' : '1';
}
window.moveSlider = function(direction) {
    const track    = document.getElementById('trendingGrid');
    const viewport = track?.closest('.slider-viewport');
    if (!track || !viewport) return;
    const card = track.querySelector('.movie-card:not(.skeleton-card)');
    if (!card) return;
    const gap       = parseFloat(getComputedStyle(track).gap) || 0;
    const cardW     = card.offsetWidth + gap;
    const visible   = Math.max(1, Math.round(viewport.offsetWidth / cardW));
    const step      = cardW * visible;
    const maxScroll = Math.max(0, track.scrollWidth - viewport.offsetWidth);
    sliderOffset = direction === 'next'
        ? (sliderOffset + step > maxScroll ? 0 : sliderOffset + step)
        : (sliderOffset - step < 0 ? maxScroll : sliderOffset - step);
    track.style.transform = `translateX(-${sliderOffset}px)`;
    updateArrows();
};
function startAutoPlay() { stopAutoPlay(); autoPlayTimer = setInterval(() => window.moveSlider('next'), SLIDE_INTERVAL); }
function stopAutoPlay()  { clearInterval(autoPlayTimer); }
export function resetSlider() { sliderOffset = 0; const t = document.getElementById('trendingGrid'); if (t) t.style.transform = 'translateX(0)'; updateArrows(); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function populateDropdown(select, items, valueKey, textKey) {
    items.forEach(item => {
        const o = document.createElement('option');
        o.value = item[valueKey]; o.textContent = item[textKey];
        select.appendChild(o);
    });
}

function setHero(movie) {
    const mediaType = movie.media_type || 'movie';
    const title     = movie.title || movie.name;
    const year      = (movie.release_date || movie.first_air_date || '').split('-')[0];
    const genres    = movie.genre_ids || [];

    hero.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${movie.backdrop_path})`;
    heroContent.innerHTML = `
        <div class="hero-info">
            <div class="hero-badges">
                <span class="hero-badge-type ${mediaType}">${mediaType === 'movie' ? 'Movie' : 'Series'}</span>
                ${year ? `<span class="hero-badge-year">${year}</span>` : ''}
                ${movie.vote_average ? `<span class="hero-badge-rating">★ ${movie.vote_average.toFixed(1)}</span>` : ''}
            </div>
            <h1>${title}</h1>
            <p>${movie.overview ? movie.overview.substring(0, 180) + '…' : ''}</p>
            <div class="hero-actions">
                <button class="btn btn-primary" id="heroBtn">▶ View Details</button>
            </div>
        </div>
        <div class="hero-poster">
            <img src="https://image.tmdb.org/t/p/w342${movie.poster_path}" alt="${title}">
        </div>
    `;
    document.getElementById('heroBtn').onclick = () => openDetails(mediaType, movie.id);
}

function createMovieCard(movie, type = 'movie') {
    if (!movie.poster_path && !movie.profile_path) return null;
    const mediaType = movie.media_type || type;
    if (mediaType === 'person') return null;

    const title  = movie.title || movie.name;
    const inList = isInWatchlist(movie.id);
    const card   = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `
        <div class="badge ${mediaType}">${mediaType === 'movie' ? 'Movie' : 'Series'}</div>
        <button class="watchlist-toggle${inList ? ' active' : ''}" title="${inList ? 'Remove from watchlist' : 'Add to watchlist'}">
            ${inList ? '★' : '☆'}
        </button>
        <img src="${tmdb.getImageUrl(movie.poster_path)}" alt="${title}" loading="lazy">
        <div class="movie-info">
            <h3>${title}</h3>
            <div class="movie-meta">
                <span>${(movie.release_date || movie.first_air_date || '').split('-')[0]}</span>
                <span class="rating">★ ${movie.vote_average.toFixed(1)}</span>
            </div>
        </div>
    `;

    const wBtn = card.querySelector('.watchlist-toggle');
    wBtn.addEventListener('click', e => {
        e.stopPropagation();
        const movieData = { id: movie.id, title, poster_path: movie.poster_path, media_type: mediaType, release_date: movie.release_date, first_air_date: movie.first_air_date, vote_average: movie.vote_average };
        const added = toggleWatchlist(movieData);
        wBtn.textContent = added ? '★' : '☆';
        wBtn.classList.toggle('active', added);
        wBtn.title = added ? 'Remove from watchlist' : 'Add to watchlist';
        if (currentMode === 'watchlist' && !added) {
            card.style.animation = 'fadeOutCard 0.3s ease forwards';
            setTimeout(() => {
                card.remove();
                if (!watchlistGrid.querySelector('.movie-card')) showWatchlistView();
            }, 300);
        }
        showToast(added ? '★ Added to Watchlist' : 'Removed from Watchlist');
    });

    card.addEventListener('click', () => openDetails(mediaType, movie.id));
    return card;
}

function displayMovies(movies, container, type = 'movie') {
    container.innerHTML = '';
    movies.forEach(movie => { const c = createMovieCard(movie, type); if (c) container.appendChild(c); });
}

function appendMovies(movies, container, type = 'movie') {
    movies.forEach(movie => { const c = createMovieCard(movie, type); if (c) container.appendChild(c); });
}

function openDetails(type, id) {
    window.location.href = `detail.html?id=${id}&type=${type}`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message) {
    let toast = document.getElementById('appToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appToast';
        toast.className = 'app-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

init();
