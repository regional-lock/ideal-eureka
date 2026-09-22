import { tmdb } from './tmdb.js';
import { initSearchDropdown } from './search-dropdown.js';

const trendingGrid = document.getElementById('trendingGrid');
const trendingSection = document.getElementById('trendingSection');
const trendingViewport = document.getElementById('trendingViewport');
const trendingPrevBtn = document.getElementById('trendingPrev');
const trendingNextBtn = document.getElementById('trendingNext');
const trendingThumb = document.getElementById('trendingThumb');
const popularGrid = document.getElementById('popularGrid');
const topRatedGrid = document.getElementById('topRatedGrid');
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

let revealObserver = null;
let cardObserver = null;

// id -> genre name, merged from the movie + tv lists so a card can label any title
let GENRE_NAMES = {};

// Search handler with debounce (for full-page search on Enter)
let debounceTimer;

// The nav is sticky on phones, so scroll targets have to clear its height.
function scrollToResults(section) {
    const nav = document.querySelector('nav');
    const offset = (nav ? nav.offsetHeight : 0) + 12;
    const top = section.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

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
            hideSectionsForResults();
            if (page === 1) scrollToResults(discoverySection);
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

// Initialization
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const typeParam = urlParams.get('type');
    const searchParam = urlParams.get('search');
    const genreParam = urlParams.get('genre');

    if (typeParam) typeFilter.value = typeParam;

    const [trending, popular, topRated, genres, altGenres, langs, countries] = await Promise.all([
        tmdb.getTrending(),
        tmdb.getPopular(),
        tmdb.getTopRatedTV(),
        tmdb.getGenres(typeParam || 'movie'),
        tmdb.getGenres(typeParam === 'tv' ? 'movie' : 'tv'),
        tmdb.getLanguages(),
        tmdb.getCountries()
    ]);

    // Cards label genres client-side; ids are shared across both lists.
    GENRE_NAMES = {};
    [...(genres?.genres || []), ...(altGenres?.genres || [])].forEach(g => { GENRE_NAMES[g.id] = g.name; });

    populateDropdown(genreFilter, genres.genres, 'id', 'name');
    populateDropdown(languageFilter, langs.sort((a, b) => a.english_name.localeCompare(b.english_name)), 'iso_639_1', 'english_name');
    populateDropdown(countryFilter, countries.sort((a, b) => a.english_name.localeCompare(b.english_name)), 'iso_3166_1', 'english_name');

    initReveal();
    markActiveNav(typeParam);
    if (trending) displayMovies((trending.results || []).slice(0, 10), trendingGrid, 'movie');
    if (popular) displayMovies(popular.results.slice(0, 18), popularGrid, 'movie');
    if (topRated) displayMovies(topRated.results.slice(0, 18), topRatedGrid, 'tv');

    // The trending grid is a carousel, so it needs wiring + a geometry sync once
    // the cards have actually been laid out.
    initTrendingSlider();
    updateTrendingSlider();

    // Handle deep links
    if (searchParam) {
        searchInput.value = searchParam;
        handleSearch(searchParam);
    } else if (typeParam || genreParam) {
        // Footer / nav links can preselect a genre, e.g. ?type=movie&genre=28
        if (genreParam && [...genreFilter.options].some(o => o.value === genreParam)) {
            genreFilter.value = genreParam;
            currentFilters.with_genres = genreParam;
        }
        updateDiscovery();
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Search / filter results take over the page: hide the trending band and the
// regular sections so only the discovery grid stays visible.
function hideSectionsForResults() {
    if (trendingSection) trendingSection.style.display = 'none';
    document.querySelectorAll('main > section:not(#discoverySection)').forEach(s => s.style.display = 'none');
}

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

        hideSectionsForResults();
        if (page > 1) scrollToResults(discoverySection);
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

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function markActiveNav(typeParam) {
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(a => {
        const href = a.getAttribute('href') || '';
        if (typeParam && href.includes(`type=${typeParam}`)) a.classList.add('active');
        else a.classList.remove('active');
    });
}

function initReveal() {
    const els = document.querySelectorAll('body.home .section-head, body.home .filter-card');
    els.forEach(el => el.classList.add('reveal'));
    if (!('IntersectionObserver' in window)) {
        document.querySelectorAll('body.home .reveal').forEach(el => el.classList.add('in'));
        return;
    }
    revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(en => {
            if (en.isIntersecting) { en.target.classList.add('in'); revealObserver.unobserve(en.target); }
        });
    }, { threshold: 0.12 });
    els.forEach(el => revealObserver.observe(el));
}

// Cards get their own observer so the stagger delay can be dropped afterwards —
// a leftover delay would make the hover lift feel sluggish.
function observeCards(container) {
    if (!container) return;
    const cards = container.querySelectorAll('.movie-card');
    // The trending band is a carousel: its off-screen cards never intersect the
    // viewport, so they are revealed straight away and only the visible page animates.
    if (container.id === 'trendingGrid') {
        cards.forEach(c => {
            c.classList.add('reveal', 'in');
            c.style.transitionDelay = '0ms';
        });
        return;
    }
    if (!cardObserver) {
        cardObserver = new IntersectionObserver((entries) => {
            entries.forEach(en => {
                if (!en.isIntersecting) return;
                const el = en.target;
                el.classList.add('in');
                cardObserver.unobserve(el);
                setTimeout(() => { el.style.transitionDelay = '0ms'; }, 800);
            });
        }, { threshold: 0.1 });
    }
    cards.forEach((c, i) => {
        c.classList.add('reveal');
        c.style.transitionDelay = `${Math.min(i % 12, 11) * 35}ms`;
        cardObserver.observe(c);
    });
}

// 1234567 -> "1.2M" — keeps the metric boxes narrow enough to stay on one line.
function formatCompact(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return String(Math.round(n));
}

function genrePills(ids, limit) {
    return (ids || []).slice(0, limit)
        .map(id => GENRE_NAMES[id])
        .filter(Boolean)
        .map(name => `<span class="pill">${escapeHtml(name)}</span>`)
        .join('');
}

const CARD_STATUS = {
    trendingGrid: 'Trending today',
    popularGrid: 'Crowd favourite',
    topRatedGrid: 'Top rated',
    discoveryGrid: 'Ready to watch'
};

function displayMovies(movies, container, type = 'movie') {
    if (!container) return;
    container.innerHTML = '';
    const isTrending = container.id === 'trendingGrid';
    const status = CARD_STATUS[container.id] || 'Ready to watch';
    let rank = 0;
    const frag = document.createDocumentFragment();

    movies.forEach(movie => {
        if (!movie.poster_path && !movie.profile_path) return;
        const mediaType = movie.media_type || type;
        if (mediaType === 'person') return;
        rank += 1;

        const title = movie.title || movie.name || 'Untitled';
        const year = (movie.release_date || movie.first_air_date || '').split('-')[0] || '—';
        const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '—';
        const votes = formatCompact(movie.vote_count);
        const popularity = formatCompact(movie.popularity);
        const lang = movie.original_language ? String(movie.original_language).toUpperCase() : '—';
        const typeLabel = mediaType === 'movie' ? 'Movie' : 'Series';

        const card = document.createElement('div');
        card.className = 'movie-card';
        card.innerHTML = `
            <div class="card-head">
                <div class="poster-wrapper">
                    <div class="badge ${mediaType}">${typeLabel}</div>
                    <img src="${tmdb.getImageUrl(movie.poster_path)}" alt="${escapeHtml(title)} poster" loading="lazy" decoding="async">
                    <span class="card-shine"></span>
                    ${isTrending && rank <= 10 ? `<span class="rank">${rank}</span>` : ''}
                </div>
                <div class="card-meta-head">
                    <h3 class="title">${escapeHtml(title)}</h3>
                    <div class="sub-info">
                        <span>${year}</span><span class="sep">/</span>
                        <span>${escapeHtml(lang)}</span><span class="sep">/</span>
                        <span>${typeLabel}</span>
                    </div>
                    <div class="tag-group">${genrePills(movie.genre_ids, 3)}</div>
                </div>
            </div>
            <div class="metrics-grid">
                <div class="metric-box rating"><span class="label">Score</span><span class="val">${rating}</span></div>
                <div class="metric-box votes"><span class="label">Votes</span><span class="val">${votes}</span></div>
                <div class="metric-box pop"><span class="label">Hype</span><span class="val">${popularity}</span></div>
            </div>
            <div class="card-footer">
                <span class="status-indicator"><span class="dot"></span>${status}</span>
                <span class="btn-details">Details</span>
            </div>
        `;
        card.onclick = () => openDetails(mediaType, movie.id);
        frag.appendChild(card);
    });

    container.appendChild(frag);
    observeCards(container);
}

function openDetails(type, id) {
    window.location.href = `detail.html?id=${id}&type=${type}`;
}

// ---------------------------------------------------------------------------
// Trending carousel
// ---------------------------------------------------------------------------
// Scrolling the viewport itself (rather than translating a track) keeps native
// touch swipe, keyboard and smooth behaviour working on every size; the arrows
// jump one full page at a time.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Card widths come from CSS (`100cqw` divided by `--slider-visible`), so JS only
// has to *measure* the result. Reading the live custom property instead of
// hardcoding a count keeps the maths correct at every breakpoint, because the
// responsive stylesheet is what decides how many cards make up a page.
function sliderMetrics() {
    const trackStyles = getComputedStyle(trendingGrid);
    const gap = parseFloat(trackStyles.columnGap) || parseFloat(trackStyles.gap) || 0;
    const visible = Math.max(1, parseInt(trackStyles.getPropertyValue('--slider-visible'), 10) || 5);
    const first = trendingGrid.querySelector('.movie-card');
    const cardW = first ? first.getBoundingClientRect().width : 0;
    return { gap, visible, cardW };
}

// One page is exactly `visible` cards plus their trailing gaps, which is also a
// real scroll-snap offset — stepping by anything else lets `mandatory` re-snap to
// a neighbouring card and the page drifts out of alignment.
function trendingStep() {
    if (!trendingViewport || !trendingGrid) return 0;
    const { gap, visible, cardW } = sliderMetrics();
    return visible * (cardW + gap);
}

function scrollTrending(direction) {
    const step = trendingStep();
    if (!step || !trendingViewport) return;

    // Land on the nearest page boundary rather than accumulating a relative
    // delta, so repeated clicks can never drift away from a snap position.
    const pageIndex = Math.round(trendingViewport.scrollLeft / step) + direction;
    const maxScroll = trendingViewport.scrollWidth - trendingViewport.clientWidth;
    const target = Math.min(
        Math.min(Math.max(pageIndex, 0), Math.round(maxScroll / step)) * step,
        maxScroll
    );

    trendingViewport.scrollTo({
        left: target,
        behavior: reduceMotion.matches ? 'auto' : 'smooth'
    });
    updateTrendingSlider();
}

function updateTrendingSlider() {
    if (!trendingViewport) return;

    const maxScroll = trendingViewport.scrollWidth - trendingViewport.clientWidth;
    const raw = maxScroll > 1 ? trendingViewport.scrollLeft / maxScroll : 0;
    // Snap/rounding can leave scrollLeft a fraction outside [0, maxScroll].
    const progress = Math.min(1, Math.max(0, raw));
    const atStart = trendingViewport.scrollLeft <= 2;
    const atEnd = maxScroll - trendingViewport.scrollLeft <= 2;

    // Thumb width represents the visible fraction (e.g. 5 of 10 cards → 50%)
    const totalCards = trendingGrid?.querySelectorAll('.movie-card').length || 1;
    const { visible } = sliderMetrics();
    const thumbW = Math.min(1, visible / totalCards);
    // Thumb left slides within the remaining space so it never overflows the rail
    const thumbLeft = progress * (1 - thumbW);

    if (trendingThumb) {
        trendingThumb.style.width = (thumbW * 100) + '%';
        trendingThumb.style.left = (thumbLeft * 100) + '%';
    }
    if (trendingPrevBtn) trendingPrevBtn.disabled = atStart;
    if (trendingNextBtn) trendingNextBtn.disabled = atEnd;
}

// CSS resizes the cards on its own; this only re-anchors the scroll offset, which
// new card widths can leave stranded between two snap positions.
function syncTrendingSliderLayout() {
    if (!trendingViewport || !trendingGrid) return;

    const step = trendingStep();
    if (step > 0) {
        const maxScroll = trendingViewport.scrollWidth - trendingViewport.clientWidth;
        const clamped = Math.min(Math.max(trendingViewport.scrollLeft, 0), maxScroll);
        const nearest = Math.round(clamped / step) * step;
        const aligned = Math.min(Math.max(nearest, 0), maxScroll);
        if (Math.abs(aligned - trendingViewport.scrollLeft) > 1) {
            trendingViewport.scrollLeft = aligned;
        }
    }
    updateTrendingSlider();
}

function initTrendingSlider() {
    if (!trendingViewport) return;
    trendingPrevBtn?.addEventListener('click', () => scrollTrending(-1));
    trendingNextBtn?.addEventListener('click', () => scrollTrending(1));
    trendingViewport.addEventListener('scroll', updateTrendingSlider, { passive: true });
    trendingViewport.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); scrollTrending(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); scrollTrending(-1); }
    });

    // A window resize listener reads clientWidth *before* the new layout has been
    // committed, which left the carousel one breakpoint stale. ResizeObserver
    // fires after layout, so the measured width is always the current one.
    if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(() => syncTrendingSliderLayout());
        observer.observe(trendingViewport);
    } else {
        window.addEventListener('resize', syncTrendingSliderLayout);
    }

    syncTrendingSliderLayout();
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
