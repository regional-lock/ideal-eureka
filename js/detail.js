import { tmdb } from './tmdb.js';
import { justwatch } from './justwatch.js';

const detailContent = document.getElementById('detailContent');

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const type = urlParams.get('type') || 'movie';

    if (!id) {
        window.location.href = 'index.html';
        return;
    }

    // Show loading state
    detailContent.innerHTML = `
        <div class="loading-detail">
            <div class="logo">MovieVerse</div>
            <div class="loader-bar"></div>
            <p>Gathering details...</p>
        </div>
    `;

    try {
        const [data, similar] = await Promise.all([
            tmdb.getDetails(type, id),
            tmdb.getSimilar(type, id)
        ]);

        if (!data) {
            detailContent.innerHTML = '<div style="padding: 10rem; text-align: center;"><h1>Content not found</h1></div>';
            return;
        }

        renderDetails(data, type, similar ? similar.results : []);

        const title = data.title || data.name;
        const year = (data.release_date || data.first_air_date || '').split('-')[0];

        // Asynchronously enrich with JustWatch prices to avoid blocking UI
        try {
            console.log(`Searching JustWatch for: ${title} (${year})...`);
            const jwNode = await justwatch.findTitle(title, year, type);
            if (jwNode) {
                console.log(`JustWatch Node Found: ${jwNode.id}. Fetching regional prices...`);
                const jwStreaming = await justwatch.getStreaming(jwNode);
                console.log("JustWatch Regional Data:", jwStreaming);
                window.enrichWithPrices(jwStreaming);
            } else {
                console.warn("JustWatch node not found for this title.");
            }
        } catch (jwErr) {
            console.warn("JustWatch enrichment skipped:", jwErr);
        }

    } catch (error) {
        console.error('Error initializing details:', error);
        detailContent.innerHTML = '<div style="padding: 10rem; text-align: center;"><h1>Something went wrong</h1><a href="index.html" class="btn btn-primary" style="margin-top: 2rem;">Back to Home</a></div>';
    }
}

function renderDetails(data, type, similarResults) {
    const title = data.title || data.name;
    const releaseDate = data.release_date || data.first_air_date;
    const year = releaseDate ? releaseDate.split('-')[0] : 'N/A';

    // Fix runtime for TV shows and movies
    const runtime = data.runtime || (data.episode_run_time && data.episode_run_time.length > 0 ? data.episode_run_time[0] : 'N/A');

    const backdrop = data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '';
    const trailer = data.videos.results.find(v => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube');

    // Robust Regional Streaming (Using TMDB's JustWatch-powered data to avoid CORS)
    const allProviders = data['watch/providers']?.results || {};
    const COUNTRIES = ["US", "ID", "SG", "JP", "KR", "GB", "DE", "FR", "IT", "ES", "CA", "AU", "BR", "MX", "IN", "MY", "PH", "TH", "TW"];

    const renderOfferList = (offers) => {
        if (!offers || !offers.length) return '';
        return `
            <div class="offer-list">
                ${offers.map(o => `
                    <div class="offer-item" title="${o.provider_name}">
                        <img src="https://image.tmdb.org/t/p/original${o.logo_path}" alt="${o.provider_name}" class="offer-logo">
                        <span class="offer-name">${o.provider_name}</span>
                        <span class="offer-type">${o.type}</span>
                    </div>
                `).join('')}
            </div>
        `;
    };

    // Data structures for streaming availability (shared via closure)
    const providerGroups = {};
    const countryNamesMap = {
        "AD": "Andorra", "AE": "United Arab Emirates", "AF": "Afghanistan", "AG": "Antigua and Barbuda", "AI": "Anguilla", "AL": "Albania", "AM": "Armenia", "AO": "Angola", "AQ": "Antarctica", "AR": "Argentina", "AS": "American Samoa", "AT": "Austria", "AU": "Australia", "AW": "Aruba", "AX": "Åland Islands", "AZ": "Azerbaijan",
        "BA": "Bosnia and Herzegovina", "BB": "Barbados", "BD": "Bangladesh", "BE": "Belgium", "BF": "Burkina Faso", "BG": "Bulgaria", "BH": "Bahrain", "BI": "Burundi", "BJ": "Benin", "BL": "Saint Barthélemy", "BM": "Bermuda", "BN": "Brunei", "BO": "Bolivia", "BQ": "Bonaire", "BR": "Brazil", "BS": "Bahamas", "BT": "Bhutan", "BV": "Bouvet Island", "BW": "Botswana", "BY": "Belarus", "BZ": "Belize",
        "CA": "Canada", "CC": "Cocos Islands", "CD": "Congo (Kinshasa)", "CF": "Central African Republic", "CG": "Congo (Brazzaville)", "CH": "Switzerland", "CI": "Côte d'Ivoire", "CK": "Cook Islands", "CL": "Chile", "CM": "Cameroon", "CN": "China", "CO": "Colombia", "CR": "Costa Rica", "CU": "Cuba", "CV": "Cabo Verde", "CW": "Curaçao", "CX": "Christmas Island", "CY": "Cyprus", "CZ": "Czechia",
        "DE": "Germany", "DJ": "Djibouti", "DK": "Denmark", "DM": "Dominica", "DO": "Dominican Republic", "DZ": "Algeria", "EC": "Ecuador", "EE": "Estonia", "EG": "Egypt", "EH": "Western Sahara", "ER": "Eritrea", "ES": "Spain", "ET": "Ethiopia", "FI": "Finland", "FJ": "Fiji", "FK": "Falkland Islands", "FM": "Micronesia", "FO": "Faroe Islands", "FR": "France", "GA": "Gabon", "GB": "United Kingdom", "GD": "Grenada", "GE": "Georgia", "GF": "French Guiana", "GG": "Guernsey", "GH": "Ghana", "GI": "Gibraltar", "GL": "Greenland", "GM": "Gambia", "GN": "Guinea", "GP": "Guadeloupe", "GQ": "Equatorial Guinea", "GR": "Greece", "GS": "South Georgia", "GT": "Guatemala", "GU": "Guam", "GW": "Guinea-Bissau", "GY": "Guyana",
        "HK": "Hong Kong", "HM": "Heard Island", "HN": "Honduras", "HR": "Croatia", "HT": "Haiti", "HU": "Hungary", "ID": "Indonesia", "IE": "Ireland", "IL": "Israel", "IM": "Isle of Man", "IN": "India", "IO": "British Indian Ocean Territory", "IQ": "Iraq", "IR": "Iran", "IS": "Iceland", "IT": "Italy", "JE": "Jersey", "JM": "Jamaica", "JO": "Jordan", "JP": "Japan", "KE": "Kenya", "KG": "Kyrgyzstan", "KH": "Cambodia", "KI": "Kiribati", "KM": "Comoros", "KN": "Saint Kitts and Nevis", "KP": "North Korea", "KR": "South Korea", "KW": "Kuwait", "KY": "Cayman Islands", "KZ": "Kazakhstan", "LA": "Laos", "LB": "Lebanon", "LC": "Saint Lucia", "LI": "Liechtenstein", "LK": "Sri Lanka", "LR": "Liberia", "LS": "Lesotho", "LT": "Lithuania", "LU": "Luxembourg", "LV": "Latvia", "LY": "Libya",
        "MA": "Morocco", "MC": "Monaco", "MD": "Moldova", "ME": "Montenegro", "MF": "Saint Martin", "MG": "Madagascar", "MH": "Marshall Islands", "MK": "North Macedonia", "ML": "Mali", "MM": "Myanmar", "MN": "Mongolia", "MO": "Macao", "MP": "Northern Mariana Islands", "MQ": "Martinique", "MR": "Mauritania", "MS": "Montserrat", "MT": "Malta", "MU": "Mauritius", "MV": "Maldives", "MW": "Malawi", "MX": "Mexico", "MY": "Malaysia", "MZ": "Mozambique", "NA": "Namibia", "NC": "New Caledonia", "NE": "Niger", "NF": "Norfolk Island", "NG": "Nigeria", "NI": "Nicaragua", "NL": "Netherlands", "NO": "Norway", "NP": "Nepal", "NR": "Nauru", "NU": "Niue", "NZ": "New Zealand", "OM": "Oman", "PA": "Panama", "PE": "Peru", "PF": "French Polynesia", "PG": "Papua New Guinea", "PH": "Philippines", "PK": "Pakistan", "PL": "Poland", "PM": "Saint Pierre and Miquelon", "PN": "Pitcairn", "PR": "Puerto Rico", "PS": "Palestine", "PT": "Portugal", "PW": "Palau", "PY": "Paraguay", "QA": "Qatar", "RE": "Réunion", "RO": "Romania", "RS": "Serbia", "RU": "Russia", "RW": "Rwanda",
        "SA": "Saudi Arabia", "SB": "Solomon Islands", "SC": "Seychelles", "SD": "Sudan", "SE": "Sweden", "SG": "Singapore", "SH": "Saint Helena", "SI": "Slovenia", "SJ": "Svalbard and Jan Mayen", "SK": "Slovakia", "SL": "Sierra Leone", "SM": "San Marino", "SN": "Senegal", "SO": "Somalia", "SR": "Suriname", "SS": "South Sudan", "ST": "São Tomé and Príncipe", "SV": "El Salvador", "SX": "Sint Maarten", "SY": "Syria", "SZ": "Eswatini", "TC": "Turks and Caicos", "TD": "Chad", "TF": "French Southern Territories", "TG": "Togo", "TH": "Thailand", "TJ": "Tajikistan", "TK": "Tokelau", "TL": "Timor-Leste", "TM": "Turkmenistan", "TN": "Tunisia", "TO": "Tonga", "TR": "Türkiye", "TT": "Trinidad and Tobago", "TV": "Tuvalu", "TW": "Taiwan", "TZ": "Tanzania", "UA": "Ukraine", "UG": "Ulanda", "UM": "United States Minor Outlying Islands", "US": "United States", "UY": "Uruguay", "UZ": "Uzbekistan", "VA": "Vatican City", "VC": "Saint Vincent and the Grenadines", "VE": "Venezuela", "VG": "British Virgin Islands", "VI": "U.S. Virgin Islands", "VN": "Vietnam", "VU": "Vanuatu", "WF": "Wallis and Futuna", "WS": "Samoa", "XK": "Kosovo", "YE": "Yemen", "YT": "Mayotte", "ZA": "South Africa", "ZM": "Zambia", "ZW": "Zimbabwe"
    };

    const ALL_AVAILABLE_COUNTRIES = Object.keys(allProviders);
    ALL_AVAILABLE_COUNTRIES.forEach(c => {
        const p = allProviders[c];
        if (p) {
            const processOffers = (offers, type) => {
                if (!offers) return;
                offers.forEach(o => {
                    const pName = o.provider_name;
                    if (!providerGroups[pName]) {
                        providerGroups[pName] = {
                            logo: o.logo_path,
                            countries: {}
                        };
                    }
                    if (!providerGroups[pName].countries[c]) {
                        providerGroups[pName].countries[c] = [];
                    }
                    // Check if already exists
                    if (!providerGroups[pName].countries[c].find(off => off.type === type)) {
                        providerGroups[pName].countries[c].push({ type, price: null, videoTechnology: [], audioTechnology: [], audioLanguages: [] });
                    }
                });
            };
            processOffers(p.flatrate, 'STREAM');
            processOffers(p.rent, 'RENT');
            processOffers(p.buy, 'BUY');
            processOffers(p.ads, 'ADS');
            processOffers(p.free, 'FREE');
        }
    });

    // Helper to inject JustWatch prices into providerGroups
    window.enrichWithPrices = (jwData) => {
        console.log("Starting enrichment with:", jwData);
        Object.keys(jwData).forEach(countryCode => {
            const offers = jwData[countryCode];
            offers.forEach(off => {
                const jwName = off.provider.toLowerCase();
                for (const pName in providerGroups) {
                    const tmdbName = pName.toLowerCase();

                    // Improved Fuzzy Matching: Check for overlap and common brand names
                    const isMatch = tmdbName.includes(jwName) ||
                        jwName.includes(tmdbName) ||
                        (tmdbName.startsWith('amazon') && jwName.startsWith('amazon')) ||
                        (tmdbName.startsWith('apple') && jwName.startsWith('apple')) ||
                        (tmdbName.startsWith('hbo') && jwName.startsWith('hbo'));

                    if (isMatch) {
                        // Store tech metadata at provider level as soon as we find any
                        // matching JustWatch offer — US data preferred, otherwise first-seen.
                        const hasMeta = !!providerGroups[pName].metaDetails;
                        if (countryCode === 'US' || !hasMeta) {
                            providerGroups[pName].promoLink = off.link;
                            providerGroups[pName].metaDetails = {
                                presentationType: off.quality || null,
                                videoTechnology: off.videoTechnology || [],
                                audioTechnology: off.audioTechnology || [],
                                audioLanguages: off.audioLanguages || []
                            };
                        }

                        const countryOffers = providerGroups[pName].countries[countryCode];
                        if (countryOffers) {
                            // Map JustWatch monetization types to our UI labels
                            let jwType = off.type.toUpperCase();
                            if (jwType === 'FLATRATE') jwType = 'STREAM';

                            const target = countryOffers.find(o => o.type === jwType);
                            if (target) {
                                // Format price nicely
                                let priceLabel = off.price;
                                if (off.price && off.price.includes(' ')) {
                                    const [val, cur] = off.price.split(' ');
                                    const curSymbol = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'IDR': 'Rp', 'JPY': '¥', 'THB': '฿', 'SGD': 'S$' }[cur] || cur;
                                    priceLabel = `${curSymbol}${val}`;
                                }
                                target.price = priceLabel;
                                target.link = off.link;
                                target.videoTechnology = off.videoTechnology || [];
                                target.audioTechnology = off.audioTechnology || [];
                                target.audioLanguages = off.audioLanguages || [];
                                target.presentationType = off.quality || null;
                            }
                        }
                    }
                }
            });
        });
        console.log("Pricing enrichment complete");

        // If a panel is currently open, Re-trigger the switch to update prices in the UI
        const activeCard = document.querySelector('.service-card.active');
        if (activeCard) {
            const currentProvider = activeCard.getAttribute('data-provider');
            if (currentProvider) {
                activeCard.classList.remove('active');
                window.switchService(currentProvider);
            }
        }
    };

    // Link Helpers
    window.copyProviderLink = (name, event) => {
        const provider = providerGroups[name];
        const link = provider?.promoLink || `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;
        navigator.clipboard.writeText(link).then(() => {
            const btn = event.currentTarget || event.target.closest('button');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => btn.innerHTML = originalText, 2000);
        });
    };

    window.loadProviderDetails = (name) => {
        const provider = providerGroups[name];
        if (!provider) return;

        const meta = provider.metaDetails || {};
        const link = provider.promoLink || `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;

        const formatList = (arr, fallback = '—') => {
            if (!arr || !arr.length) return `<span class="meta-empty">${fallback}</span>`;
            return arr.map(v => `<span class="meta-tag">${v.replace(/_/g, ' ')}</span>`).join('');
        };

        const formatPresentation = (val) => {
            if (!val) return '<span class="meta-empty">—</span>';
            const labels = { '_4K': '4K UHD', 'SD': 'SD', 'HD': 'HD', 'DOLBY_VISION': 'Dolby Vision' };
            const display = labels[val] || val.replace(/_/g, ' ');
            const cls = val === '_4K' ? 'tag-4k' : val === 'HD' ? 'tag-hd' : 'tag-sd';
            return `<span class="meta-badge ${cls}">${display}</span>`;
        };

        const existingModal = document.getElementById('detailsPopupModal');
        if (existingModal) existingModal.remove();

        const modalEl = document.createElement('div');
        modalEl.id = 'detailsPopupModal';
        modalEl.className = 'details-popup-overlay';
        modalEl.innerHTML = `
            <div class="details-popup">
                <div class="details-popup-header">
                    <div class="details-popup-brand">
                        <img src="https://image.tmdb.org/t/p/original${provider.logo}" alt="${name}">
                        <span>${name}</span>
                    </div>
                    <button class="details-popup-close" id="detailsPopupClose">&#x2715;</button>
                </div>
                <div class="details-popup-body">
                    <div class="details-popup-row">
                        <div class="details-popup-label">Presentation</div>
                        <div class="details-popup-value">${formatPresentation(meta.presentationType)}</div>
                    </div>
                    <div class="details-popup-row">
                        <div class="details-popup-label">Video Technology</div>
                        <div class="details-popup-value">${formatList(meta.videoTechnology)}</div>
                    </div>
                    <div class="details-popup-row">
                        <div class="details-popup-label">Audio Technology</div>
                        <div class="details-popup-value">${formatList(meta.audioTechnology)}</div>
                    </div>
                    <div class="details-popup-row">
                        <div class="details-popup-label">Audio Languages</div>
                        <div class="details-popup-value audio-langs">${formatList(meta.audioLanguages)}</div>
                    </div>
                </div>
                <div class="details-popup-footer">
                    <a href="${link}" target="_blank" class="details-popup-link">
                        <i class="fas fa-external-link-alt"></i> Open on JustWatch
                    </a>
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);

        const close = () => modalEl.remove();
        document.getElementById('detailsPopupClose').onclick = close;
        modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });
    };

    const renderRegionalStreaming = () => {
        const providerNames = Object.keys(providerGroups).sort((a, b) => {
            const major = ['Netflix', 'Disney Plus', 'Amazon Prime Video', 'Apple TV Plus', 'HBO Max'];
            const aIdx = major.indexOf(a);
            const bIdx = major.indexOf(b);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.localeCompare(b);
        });

        if (providerNames.length === 0) return '';

        return `
            <section class="streaming-section">
                <div class="streaming-meta">
                    <h2 class="section-title">SERVICES AVAILABILITY</h2>
                    <p class="hint-text">Click on the providers name</p>
                </div>
                
                <div class="services-grid">
                    ${providerNames.map(name => {
            const provider = providerGroups[name];
            const safeId = name.replace(/\s/g, '-').replace(/[^a-zA-Z-]/g, '');
            const countries = Object.keys(provider.countries);
            return `
                            <div id="card-${safeId}" class="service-card" onclick="window.switchService('${name.replace(/'/g, "\\'")}')" data-provider="${name}">
                                <div class="card-inner">
                                    <img src="https://image.tmdb.org/t/p/original${provider.logo}" alt="${name}">
                                    <div class="card-info">
                                        <span class="provider-name">${name}</span>
                                        <span class="country-count">${countries.length} countries</span>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>

                <div id="service-details-panel" class="service-details-panel">
                    <!-- Dynamic Content -->
                </div>
            </section>
        `;
    };

    const renderProviders = () => {
        const providers = allProviders.US;
        if (!providers) return '';

        const sections = [
            { title: 'Stream', data: providers.flatrate },
            { title: 'Rent', data: providers.rent },
            { title: 'Buy', data: providers.buy }
        ];

        let html = '<div class="providers-container">';
        sections.forEach(s => {
            if (s.data && s.data.length > 0) {
                html += `
                <div class="provider-group">
                    <h4 style="color: var(--text-dim); text-transform: uppercase; font-size: 0.7rem; letter-spacing: 1px;">${s.title}</h4>
                    <div class="provider-icons">
                        ${s.data.map(p => `
                            <div class="provider-icon" title="${p.provider_name}" onclick="window.switchService('${p.provider_name.replace(/'/g, "\\'")}')" style="cursor: pointer;">
                                <img src="https://image.tmdb.org/t/p/original${p.logo_path}" alt="${p.provider_name}">
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }
        });
        html += '</div>';
        return html.length > 40 ? html : '';
    };

    detailContent.innerHTML = `
        <header class="detail-header" style="background-image: url(${backdrop})">
            <a href="index.html" class="back-btn">← Back to Browse</a>
            <div class="detail-poster">
                <img src="${tmdb.getImageUrl(data.poster_path)}" alt="${title}">
                <div class="db-links">
                    <a href="https://www.themoviedb.org/${type}/${data.id}" target="_blank" class="db-btn tmdb-btn" title="View on TMDB">
                        <span class="db-label">TMDB</span>
                    </a>
                    ${(data.imdb_id || data.external_ids?.imdb_id) ? `<a href="https://www.imdb.com/title/${data.imdb_id || data.external_ids.imdb_id}/" target="_blank" class="db-btn imdb-btn" title="View on IMDb">
                        <span class="db-label">IMDb</span>
                    </a>` : ''}
                    ${data.external_ids?.tvdb_id ? `<a href="https://www.thetvdb.com/?tab=series&id=${data.external_ids.tvdb_id}" target="_blank" class="db-btn tvdb-btn" title="View on TVDB">
                        <span class="db-label">TVDB</span>
                    </a>` : ''}
                </div>
            </div>
            <div class="detail-main-info">
                <h1>${title}</h1>
                ${data.tagline ? `<p class="tagline">"${data.tagline}"</p>` : ''}
                
                <div class="stats">
                    <span class="rating-large">★ ${data.vote_average.toFixed(1)}</span>
                    <span>${year}</span>
                    <span>${runtime} min</span>
                    <span class="lang-tag">${data.original_language.toUpperCase()}</span>
                </div>

                <div class="genres">
                    ${data.genres.map(g => `<span>${g.name}</span>`).join('')}
                </div>

                <p class="overview-full">${data.overview}</p>
                
                ${renderProviders()}

                <div style="margin-top: 2.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">
                    ${trailer ? `<button class="btn btn-primary" id="openTrailerBtn">Watch Trailer</button>` : ''}
                    ${data.homepage ? `<a href="${data.homepage}" target="_blank" class="btn" style="background: var(--glass); border: 1px solid var(--glass-border); color: white;">Official Website</a>` : ''}
                </div>
            </div>
        </header>

    <section class="cast-section">
        <h2 class="section-title">Details & Cast</h2>

        <div class="info-grid">
            <div class="info-item">
                <h4>Status</h4>
                <p>${data.status}</p>
            </div>
            ${data.budget ? `<div class="info-item"><h4>Budget</h4><p>$${data.budget.toLocaleString()}</p></div>` : ''}
            ${data.revenue ? `<div class="info-item"><h4>Revenue</h4><p>$${data.revenue.toLocaleString()}</p></div>` : ''}
            <div class="info-item">
                <h4>Studio</h4>
                <p>${data.production_companies.slice(0, 2).map(c => c.name).join(', ')}</p>
            </div>
        </div>

        <h3 style="margin: 2.5rem 0 1.2rem; padding: 0 var(--main-padding); font-size: 1.2rem; font-weight: 700;">Top Cast</h3>
        <div class="cast-grid">
            ${data.credits.cast.slice(0, 12).map(c => `
                    <div class="cast-card">
                        <img src="${c.profile_path ? tmdb.getImageUrl(c.profile_path) : 'https://via.placeholder.com/300x300?text=No+Photo'}" alt="${c.name}">
                        <h3>${c.name}</h3>
                        <p class="role">as ${c.character}</p>
                    </div>
                `).join('')}
        </div>
    </section>
        
        ${type === 'tv' && data.seasons ? `
        <section class="seasons-section" style="padding-bottom: 2rem;">
            <h3 style="margin: 1rem 0 1.2rem; padding: 0 var(--main-padding); font-size: 1.2rem; font-weight: 700;">Seasons</h3>
            <div class="movie-row">
                ${data.seasons.map(s => `
                    <div class="movie-card">
                        <img src="${s.poster_path ? tmdb.getImageUrl(s.poster_path) : 'https://via.placeholder.com/500x750?text=No+Poster'}" alt="${s.name}">
                        <div class="movie-info">
                            <h3>${s.name}</h3>
                            <div class="movie-meta">
                                <span>${s.episode_count} Episodes</span>
                                <span>${s.air_date ? s.air_date.split('-')[0] : ''}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
        ` : ''
        }

        ${renderRegionalStreaming()}

        ${similarResults.length > 0 ? `
        <section class="similar-section">
            <h2 class="section-title">More Like This</h2>
            <div class="movie-row" id="similarGrid">
                ${similarResults.slice(0, 9).map(m => `
                    <div class="movie-card" onclick="window.location.href='detail.html?id=${m.id}&type=${type}'">
                        <img src="${tmdb.getImageUrl(m.poster_path)}" alt="${m.title || m.name}">
                        <div class="movie-info">
                            <h3>${m.title || m.name}</h3>
                            <div class="movie-meta">
                                <span>${(m.release_date || m.first_air_date || '').split('-')[0]}</span>
                                <span class="rating">★ ${m.vote_average.toFixed(1)}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
        ` : ''
        }
`;

    // Modal Logic
    if (trailer) {
        const modal = document.getElementById('trailerModal');
        const openBtn = document.getElementById('openTrailerBtn');
        const closeBtn = document.querySelector('.close-modal');
        const container = document.getElementById('trailerVideoContainer');

        if (openBtn) {
            openBtn.onclick = () => {
                container.innerHTML = `
                    <div class="trailer-container">
                        <iframe src="https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0" frameborder="0" allowfullscreen></iframe>
                    </div>
                `;
                modal.style.display = 'block';
            };
        }

        const closeModal = () => {
            modal.style.display = 'none';
            container.innerHTML = ''; // Stop video playback
        };

        if (closeBtn) closeBtn.onclick = closeModal;
        window.onclick = (e) => { if (e.target === modal) closeModal(); };
    }

    // Global Helper for tab/accordion switching
    window.switchService = (name) => {
        const provider = providerGroups[name];
        if (!provider) return;

        const safeId = name.replace(/\s/g, '-').replace(/[^a-zA-Z-]/g, '');
        const cards = document.querySelectorAll('.service-card');
        const targetCard = document.getElementById(`card-${safeId}`);
        const panel = document.getElementById('service-details-panel');

        if (!targetCard || !panel) return;

        const isCurrentlyActive = targetCard.classList.contains('active');

        // Reset all cards
        cards.forEach(card => card.classList.remove('active'));

        if (isCurrentlyActive) {
            panel.classList.remove('active');
            return;
        }

        // Activate new card
        targetCard.classList.add('active');

        // Populate Panel
        const countries = Object.keys(provider.countries).sort();
        const allTags = new Set();
        // Collect unique offer types across all countries for the header summary
        countries.forEach(c => provider.countries[c].forEach(off => allTags.add(off.type)));

        panel.innerHTML = `
            <div class="panel-content fadeInUp">
                <div class="panel-header">
                    <div class="p-brand-large">
                        <img src="https://image.tmdb.org/t/p/original${provider.logo}" alt="${name}">
                        <div class="p-info-large">
                            <h3>${name}</h3>
                            <p>${countries.length} countries · ${Array.from(allTags).map(type => `<span class="tag ${type.toLowerCase()}">${type}</span>`).join(' ')}</p>
                        </div>
                    </div>
                    <div class="p-actions-large">
                        <button class="btn-mini-alt" onclick="window.copyProviderLink('${name.replace(/'/g, "\\'")}', event)">
                            <i class="fas fa-copy"></i> Copy Link
                        </button>
                    </div>
                </div>
                <div class="country-grid-alt">
                    ${countries.map(c => {
                        const countryOffers = provider.countries[c];
                        const enriched = countryOffers.find(o =>
                            o.videoTechnology?.length || o.audioTechnology?.length || o.presentationType
                        );
                        const techBadges = enriched ? [
                            enriched.presentationType
                                ? `<span class="tech-badge">${enriched.presentationType.replace('_4K', '4K')}</span>`
                                : '',
                            ...(enriched.videoTechnology || []).map(v =>
                                `<span class="tech-badge">${v.replace(/_/g, ' ')}</span>`),
                            ...(enriched.audioTechnology || []).map(a =>
                                `<span class="tech-badge">${a.replace(/_/g, ' ')}</span>`)
                        ].filter(Boolean).join('') : '';

                        return `
                        <div class="country-pill-alt">
                            <div class="country-pill-row">
                                <div class="c-header">
                                    <span class="c-code">${c}</span>
                                    <span class="c-name">${countryNamesMap[c] || c}</span>
                                </div>
                                <div class="offer-tags">
                                    ${countryOffers.map(off => `
                                        <span class="tag ${off.type.toLowerCase()}"
                                              ${off.link ? `onclick="window.open('${off.link}', '_blank'); event.stopPropagation();" style="cursor:pointer;" title="Watch on ${name}"` : ''}>
                                            ${off.type}
                                            ${off.link ? '<i class="fas fa-play" style="margin-left:3px;font-size:0.45rem;"></i>' : ''}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                            ${techBadges ? `<div class="country-pill-tech">${techBadges}</div>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;

        panel.classList.add('active');

        // Scroll slightly if panel is far down
        setTimeout(() => {
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    };
}

init();
