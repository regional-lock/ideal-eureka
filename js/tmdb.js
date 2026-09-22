const API_KEY = 'a820f2b45d233c0cc0c97d078536074f';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/w500';

export const tmdb = {
    async fetchMovies(endpoint, params = {}) {
        const url = new URL(`${BASE_URL}${endpoint}`);
        url.search = new URLSearchParams({
            api_key: API_KEY,
            ...params
        });

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.ok ? response.json() : null;
        } catch (error) {
            console.error('TMDB API Error:', error);
            return null;
        }
    },

    getTrending() {
        return this.fetchMovies('/trending/movie/day');
    },

    getPopular() {
        return this.fetchMovies('/movie/popular');
    },

    getTopRated() {
        return this.fetchMovies('/movie/top_rated');
    },

    getTopRatedTV() {
        return this.fetchMovies('/tv/top_rated');
    },

    searchMovies(query) {
        return this.fetchMovies('/search/movie', { query });
    },

    searchMulti(query, page = 1) {
        return this.fetchMovies('/search/multi', { query, page });
    },

    getDetails(type, id) {
        return this.fetchMovies(`/${type}/${id}`, { append_to_response: 'videos,credits,watch/providers,external_ids' });
    },

    getSimilar(type, id) {
        return this.fetchMovies(`/${type}/${id}/similar`);
    },

    getSeason(tvId, seasonNumber) {
        return this.fetchMovies(`/tv/${tvId}/season/${seasonNumber}`);
    },

    getGenres(type = 'movie') {
        return this.fetchMovies(`/genre/${type}/list`);
    },

    getLanguages() {
        return this.fetchMovies('/configuration/languages');
    },

    getCountries() {
        return this.fetchMovies('/configuration/countries');
    },

    discover(type, params, page = 1) {
        return this.fetchMovies(`/discover/${type}`, { ...params, page });
    },

    // Remote placeholder services are unreliable; build the fallback inline instead.
    getPlaceholderUrl(width = 500, height = 750, label = 'No Image') {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
            `<rect width="100%" height="100%" fill="#111827"/>` +
            `<text x="50%" y="50%" fill="#64748b" font-family="system-ui,sans-serif" font-size="${Math.max(11, Math.round(width / 8))}" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
            `</svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },

    getImageUrl(path) {
        return path ? `${IMG_URL}${path}` : this.getPlaceholderUrl();
    },

    // Backdrops are huge; pick a width that fits the device instead of 'original'.
    getBackdropUrl(path, wide = 'w1280', narrow = 'w780') {
        if (!path) return '';
        const isNarrow = window.matchMedia('(max-width: 768px)').matches;
        return `https://image.tmdb.org/t/p/${isNarrow ? narrow : wide}${path}`;
    }
};
