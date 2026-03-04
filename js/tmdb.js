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

    searchMulti(query) {
        return this.fetchMovies('/search/multi', { query });
    },

    getDetails(type, id) {
        return this.fetchMovies(`/${type}/${id}`, { append_to_response: 'videos,credits,watch/providers,external_ids' });
    },

    getSimilar(type, id) {
        return this.fetchMovies(`/${type}/${id}/similar`);
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

    discover(type, params) {
        return this.fetchMovies(`/discover/${type}`, params);
    },

    getImageUrl(path) {
        return path ? `${IMG_URL}${path}` : 'https://via.placeholder.com/500x750?text=No+Image';
    }
};
