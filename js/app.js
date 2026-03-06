import { tmdb } from './tmdb.js';

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

// Slider State — single source of truth
let sliderOffset = 0;
const SLIDE_INTERVAL = 3000;
let autoPlayTimer;

// Search handler with debounce
let debounceTimer;

async function handleSearch(query) {
    if (query.trim().length > 2) {
        // If not on the index page, redirect there with the search param
        const path = window.location.pathname;
        const onIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/');
        if (!onIndex) {
            window.location.href = `index.html?search=${encodeURIComponent(query)}`;
            return;
        }
        const data = await tmdb.searchMulti(query);
        if (data) {
            discoverySection.style.display = 'block';
            discoveryTitle.innerText = `Results for "${query}"`;
            displayMovies(data.results, discoveryGrid);

            // Hide other sections
            document.querySelectorAll('main > section:not(#discoverySection)').forEach(s => s.style.display = 'none');
            hero.style.height = '30vh';
            window.scrollTo({ top: 400, behavior: 'smooth' });
        }
    } else if (query.trim().length === 0) {
        // Reload index cleanly to restore all sections
        const path = window.location.pathname;
        const onIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/');
        if (onIndex) {
            window.location.href = 'index.html';
        }
    }
}

searchInput.oninput = (e) => {
    const query = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => handleSearch(query), 500);
};

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

async function updateDiscovery() {
    const type = typeFilter.value;
    const data = await tmdb.discover(type, currentFilters);

    if (data) {
        discoverySection.style.display = 'block';
        discoveryTitle.innerText = `Filtered ${type === 'movie' ? 'Movies' : 'TV Shows'}`;
        displayMovies(data.results, discoveryGrid, type);

        document.querySelectorAll('main > section:not(#discoverySection)').forEach(s => s.style.display = 'none');
        hero.style.height = '40vh';
    }
}

// Event Listeners
typeFilter.onchange = async (e) => {
    const type = e.target.value;
    const genres = await tmdb.getGenres(type);
    genreFilter.innerHTML = '<option value="">All Genres</option>';
    populateDropdown(genreFilter, genres.genres, 'id', 'name');
    updateDiscovery();
};

genreFilter.onchange = (e) => {
    currentFilters.with_genres = e.target.value;
    updateDiscovery();
};

languageFilter.onchange = (e) => {
    currentFilters.with_original_language = e.target.value;
    updateDiscovery();
};

countryFilter.onchange = (e) => {
    currentFilters.region = e.target.value;
    updateDiscovery();
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

init();
