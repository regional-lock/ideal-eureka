import { tmdb } from './tmdb.js';
import { justwatch } from './justwatch.js';
import { initSearchDropdown } from './search-dropdown.js';

const detailContent = document.getElementById('detailContent');

// app.js keeps its own copy; the two pages are separate module graphs, so this
// stays local rather than pulling the whole homepage bundle in.
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Live search dropdown — selecting goes to detail, Enter redirects to index search
initSearchDropdown({
    onSelect: (type, id) => { window.location.href = `detail.html?id=${id}&type=${type}`; },
    onSearch: (query)    => {
        if (query.length > 0) window.location.href = `index.html?search=${encodeURIComponent(query)}`;
    }
});

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
            <div class="logo">Releasemap</div>
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
            detailContent.innerHTML = '<div class="detail-message"><h1>Content not found</h1><a href="index.html" class="btn btn-primary">Back to Home</a></div>';
            return;
        }

        renderDetails(data, type, similar ? similar.results : []);

        const title = data.title || data.name;
        const year = (data.release_date || data.first_air_date || '').split('-')[0];

        // Two-stage JustWatch enrichment: US first so Load Metadata is instant,
        // remaining countries in batches of 5 in the background.
        window.jwStatus = { usReady: false, fullReady: false, node: null };
        const REST_COUNTRIES = ["ID", "SG", "JP", "KR", "GB", "DE", "FR", "IT", "ES", "CA", "AU", "BR", "MX", "IN", "MY", "PH", "TH", "TW"];
        const REST_BATCHES = [REST_COUNTRIES.slice(0, 5), REST_COUNTRIES.slice(5, 10), REST_COUNTRIES.slice(10, 15), REST_COUNTRIES.slice(15)];
        try {
            console.log(`Searching JustWatch for: ${title} (${year})...`);
            const jwNode = await justwatch.findTitle(title, year, type);
            if (jwNode) {
                window.jwStatus.node = jwNode;
                console.log(`JustWatch Node Found: ${jwNode.id}. Fetching US first...`);
                const usStreaming = await justwatch.getStreaming(jwNode, ["US"]);
                window.enrichWithPrices(usStreaming);
                window.jwStatus.usReady = true;
                window.refreshJwButtons?.();
                // Background: fetch rest in batches of 5 to avoid proxy timeout.
                (async () => {
                    for (const batch of REST_BATCHES) {
                        if (!batch.length) continue;
                        try {
                            const rest = await justwatch.getStreaming(jwNode, batch);
                            if (Object.keys(rest).length) {
                                console.log(`JustWatch batch ${batch.join(',')}:`, Object.keys(rest));
                                window.enrichWithPrices(rest);
                            }
                        } catch (batchErr) {
                            console.warn(`JW batch [${batch.join(',')}]:`, batchErr.message || batchErr);
                        }
                    }
                    window.jwStatus.fullReady = true;
                    window.refreshJwButtons?.();
                })().catch((bgErr) => console.warn("JustWatch background fetch skipped:", bgErr));
            } else {
                console.warn("JustWatch node not found for this title.");
                window.jwStatus.usReady = true;
                window.refreshJwButtons?.();
            }
        } catch (jwErr) {
            console.warn("JustWatch enrichment skipped:", jwErr);
            window.jwStatus.usReady = true;
            window.refreshJwButtons?.();
        }

    } catch (error) {
        console.error('Error initializing details:', error);
        detailContent.innerHTML = '<div class="detail-message"><h1>Something went wrong</h1><a href="index.html" class="btn btn-primary">Back to Home</a></div>';
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

    const castCount = Math.min(data.credits?.cast?.length || 0, 12);

    // Long sections (cast grid, provider grid) turn into a dropdown on phones.
    // The toggle button is hidden on desktop by CSS, where the panel is always open.
    const renderSectionToggle = (panelId, count) => `
        <button type="button" class="section-toggle" aria-expanded="true" aria-controls="${panelId}"
                data-toggle-label data-count="${count}">
            <span class="section-toggle-text">Hide</span>
            <span class="section-toggle-chevron" aria-hidden="true"></span>
        </button>
    `;

    const renderOfferList = (offers) => {
        if (!offers || !offers.length) return '';
        return `
            <div class="offer-list">
                ${offers.map(o => `
                    <div class="offer-item" title="${o.provider_name}">
                        <img src="${logoUrl({ logo: o.logo_path })}" alt="${escapeHtml(o.provider_name)}" class="offer-logo" loading="lazy" decoding="async" onerror="this.src='${tmdb.getPlaceholderUrl(300, 300, 'No Logo')}'">
                        <span class="offer-name">${o.provider_name}</span>
                        <span class="offer-type">${o.type}</span>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const serviceUrlMap = {
        netflix: 'https://www.netflix.com/',
        'disneyplus': 'https://www.disneyplus.com/',
        'disney plus': 'https://www.disneyplus.com/',
        'hulu': 'https://www.hulu.com/',
        'amazonprimevideo': 'https://www.primevideo.com/',
        'amazon prime video': 'https://www.primevideo.com/',
        'appletvplus': 'https://tv.apple.com/',
        'apple tv plus': 'https://tv.apple.com/',
        'hbomax': 'https://play.max.com/',
        'max': 'https://play.max.com/',
        'peacock': 'https://www.peacocktv.com/',
        'paramountplus': 'https://www.paramountplus.com/',
        'paramount plus': 'https://www.paramountplus.com/',
        'crunchyroll': 'https://www.crunchyroll.com/',
        'mubi': 'https://mubi.com/',
        'tubi': 'https://tubitv.com/',
        'plutotv': 'https://pluto.tv/',
        'pluto tv': 'https://pluto.tv/',
        'roku': 'https://therokuchannel.roku.com/',
        'youtube': 'https://www.youtube.com/',
        'googleplaymovies': 'https://play.google.com/store/movies',
        'microsoftstore': 'https://www.microsoft.com/store/movies',
        'showtime': 'https://www.paramountplus.com/shows',
        'spectrumon': 'https://www.spectrum.com/',
        'viaplay': 'https://viaplay.com/'
    };

    const normalizeProviderKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9+]/g, '');
    const resolveServiceLink = (name, provider = {}) => {
        const rawName = String(name || '').trim();
        const explicitLink = provider.serviceLink || provider.officialUrl || provider.url || provider.promoLink;
        if (explicitLink && !/justwatch\.com|\/search\?q=/i.test(explicitLink)) return explicitLink;

        const key = normalizeProviderKey(rawName);
        const directMatch = serviceUrlMap[key];
        if (directMatch) return directMatch;

        for (const [candidateKey, candidateUrl] of Object.entries(serviceUrlMap)) {
            if (key.includes(candidateKey) || candidateKey.includes(key)) return candidateUrl;
        }

        return provider.promoLink || `https://www.justwatch.com/us/search?q=${encodeURIComponent(rawName || 'streaming')}`;
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
                        providerGroups[pName].countries[c].push({ type, price: null, presentationType: null, videoTechnology: [], audioTechnology: [], audioLanguages: [], subtitleLanguages: [] });
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

    // Normalize provider names: "Disney Plus" vs "Disney+", "HBO Max" vs "Max",
    // "Amazon Prime Video" vs "Amazon Prime", etc. Strip non-alphanumerics.
    const normProvider = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const brandOf = (norm) => {
        if (!norm) return '';
        if (norm.includes('netflix')) return 'netflix';
        if (norm.includes('disney')) return 'disney';
        if (norm.includes('amazon')) return 'amazon';
        if (norm.includes('apple')) return 'apple';
        if (norm.includes('hbo') || norm === 'max' || norm.includes('hbomax')) return 'max';
        if (norm === 'max' || (norm.includes('max') && norm.length <= 8)) return 'max';
        if (norm.includes('hulu')) return 'hulu';
        if (norm.includes('peacock')) return 'peacock';
        if (norm.includes('paramount')) return 'paramount';
        if (norm.includes('crunchyroll')) return 'crunchyroll';
        if (norm.includes('mubi')) return 'mubi';
        if (norm.includes('tubi')) return 'tubi';
        if (norm.includes('fubo')) return 'fubo';
        if (norm.includes('pluto')) return 'pluto';
        if (norm.includes('roku')) return 'roku';
        if (norm.includes('youtube')) return 'youtube';
        if (norm.includes('googleplay')) return 'googleplay';
        return '';
    };

    // Helper to inject JustWatch prices into providerGroups.
    // metaDetailsByCountry stores per-country tech for the country-selector popup.
    window.enrichWithPrices = (jwData) => {
        if (!jwData || !Object.keys(jwData).length) {
            console.warn('JustWatch enrichment: empty payload (proxy blocked or no offers). Keys TMDB:', Object.keys(providerGroups));
            return;
        }
        console.log('Starting enrichment with:', Object.keys(jwData));
        if (jwData.US) {
            console.log('US offers:', jwData.US.map(o => o.provider + (o.technicalName ? ` [${o.technicalName}]` : '')));
        }
        Object.keys(jwData).forEach(countryCode => {
            const offers = jwData[countryCode];
            offers.forEach(off => {
                const jwName = off.provider.toLowerCase();
                const jwNorm = normProvider(off.provider);
                const jwTech = normProvider(off.technicalName);
                const jwBrand = brandOf(jwNorm) || brandOf(jwTech);

                // Auto-create a provider group when JW has an offer but TMDB
                // watch/providers doesn't list it — this makes JW-only
                // countries (ID, GB, etc.) show up in the UI.
                let matchedProvider = null;
                for (const pName in providerGroups) {
                    const tmdbName = pName.toLowerCase();
                    const tmdbNorm = normProvider(pName);
                    const tmdbBrand = brandOf(tmdbNorm);
                    const isMatch = tmdbName.includes(jwName) ||
                        jwName.includes(tmdbName) ||
                        (tmdbNorm && jwNorm && (tmdbNorm.includes(jwNorm) || jwNorm.includes(tmdbNorm))) ||
                        (jwTech && (tmdbNorm.includes(jwTech) || jwTech.includes(tmdbNorm))) ||
                        (tmdbBrand && jwBrand && tmdbBrand === jwBrand);
                    if (isMatch) { matchedProvider = pName; break; }
                }

                if (!matchedProvider && off.provider) {
                    // Create a new provider group keyed by the JW clearName.
                    const newKey = off.provider;
                    if (!providerGroups[newKey]) {
                        providerGroups[newKey] = {
                            logo: off.logo || null,
                            jwLogo: off.logo || null,
                            countries: {},
                            promoLink: off.link,
                            metaDetails: null,
                            metaDetailsByCountry: {}
                        };
                    }
                    matchedProvider = newKey;
                }

                if (!matchedProvider) return;
                const prov = providerGroups[matchedProvider];

                // Ensure metaDetailsByCountry exists — strictly per-country, no US fallback.
                if (!prov.metaDetailsByCountry) prov.metaDetailsByCountry = {};
                if (!prov.metaDetailsByCountry[countryCode]) {
                    prov.metaDetailsByCountry[countryCode] = {
                        presentationType: off.quality || null,
                        videoTechnology: off.videoTechnology || [],
                        audioTechnology: off.audioTechnology || [],
                        audioLanguages: off.audioLanguages || [],
                        subtitleLanguages: off.subtitleLanguages || []
                    };
                }

                // Ensure country entry exists in providerGroups (auto-create missing)
                if (!prov.countries[countryCode]) {
                    prov.countries[countryCode] = [];
                }

                // Map JustWatch monetization types to our UI labels
                let jwType = off.type.toUpperCase();
                if (jwType === 'FLATRATE') jwType = 'STREAM';

                const targets = prov.countries[countryCode].filter(o => o.type === jwType);
                targets.forEach(target => {
                    const incomingHasTech = (off.videoTechnology?.length || off.audioTechnology?.length);
                    const targetLacksTech = (!target.videoTechnology?.length && !target.audioTechnology?.length);
                    if (incomingHasTech || targetLacksTech) {
                        target.link              = off.link;
                        target.videoTechnology   = off.videoTechnology   || [];
                        target.audioTechnology   = off.audioTechnology   || [];
                        target.audioLanguages    = off.audioLanguages    || [];
                        target.subtitleLanguages = off.subtitleLanguages || [];
                        target.presentationType  = off.quality           || null;
                    }
                });

                // If no existing TMDB offer of this type, create one so the
                // JW-only country shows up in the country grid.
                if (!targets.length) {
                    prov.countries[countryCode].push({
                        type: jwType,
                        link: off.link,
                        presentationType: off.quality || null,
                        videoTechnology: off.videoTechnology || [],
                        audioTechnology: off.audioTechnology || [],
                        audioLanguages: off.audioLanguages || [],
                        subtitleLanguages: off.subtitleLanguages || []
                    });
                }
            });
        });
        console.log("Pricing enrichment complete");

        // New JW-only providers may have been auto-created — re-render grid first
        // so cards (with JW logo fallback) appear, then refresh open UI.
        try { window.renderServicesGrid?.(); } catch (_) {}

        // If the details popup is open, re-render it with the fresh tech data.
        const openModal = document.getElementById('detailsPopupModal');
        if (openModal?.dataset?.provider) {
            window.loadProviderDetails(openModal.dataset.provider, null, openModal.dataset.country || 'US');
        }

        // If a panel is currently open, re-trigger the switch to update UI
        const activeCard = document.querySelector('.service-card.active');
        if (activeCard) {
            const currentProvider = activeCard.getAttribute('data-provider');
            if (currentProvider) {
                activeCard.classList.remove('active');
                window.switchService(currentProvider);
            }
        }
    };

    // Flip every Load Metadata button from loading -> ready once JW lands.
    // No FontAwesome in this project — plain text + CSS spinner via .is-loading.
    window.refreshJwButtons = () => {
        document.querySelectorAll('[data-jw-btn]').forEach((btn) => {
            btn.classList.remove('is-loading');
            btn.innerHTML = 'Load Metadata';
        });
    };

    // Link Helpers
    window.copyProviderLink = (name, event) => {
        const provider = providerGroups[name];
        const link = resolveServiceLink(name, provider || {});
        navigator.clipboard.writeText(link).then(() => {
            const btn = event.currentTarget || event.target.closest('button');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => btn.innerHTML = originalText, 2000);
        }).catch(() => {
            console.warn('Copy failed for', name, 'using fallback link:', link);
        });
    };

    window.loadProviderDetails = (name, event, selectedCountry) => {
        if (event) event.stopPropagation();
        const provider = providerGroups[name];
        if (!provider) return;

        const countries = Object.keys(provider.countries || {}).sort((a, b) => {
            if (a === 'US') return -1;
            if (b === 'US') return 1;
            return a.localeCompare(b);
        });
        if (!countries.length) return;

        let current = (selectedCountry && provider.countries[selectedCountry])
            ? selectedCountry
            : (provider.countries.US ? 'US' : countries[0]);

        const getCountryMeta = (cc) => {
            // Strictly per-country: aggregate tech from every offer in this
            // country only. No fallback to US/global meta — otherwise regions
            // without JustWatch data look identical (bug: offers change but
            // metadata doesn't, e.g. The End of Oak Street).
            const offers = provider.countries?.[cc] || [];
            const uniq = (arr) => [...new Set(arr)];
            const rank = { '_4K': 3, 'HD': 2, 'SD': 1 };
            const presentations = uniq(offers.map((o) => o.presentationType).filter(Boolean))
                .sort((a, b) => (rank[b] || 0) - (rank[a] || 0));
            const merged = {
                presentationType: presentations[0] || null,
                videoTechnology: uniq(offers.flatMap((o) => o.videoTechnology || [])),
                audioTechnology: uniq(offers.flatMap((o) => o.audioTechnology || [])),
                audioLanguages: uniq(offers.flatMap((o) => o.audioLanguages || [])),
                subtitleLanguages: uniq(offers.flatMap((o) => o.subtitleLanguages || []))
            };
            const hasMerged = !!(merged.presentationType || merged.videoTechnology.length || merged.audioTechnology.length || merged.audioLanguages.length || merged.subtitleLanguages.length);
            if (hasMerged) return merged;
            // No enriched offers in this country — return whatever JW stored
            // for this exact country (may be empty), never the global US meta.
            return provider.metaDetailsByCountry?.[cc] || {};
        };

        const formatList = (arr, fallback = '—') => {
            if (!arr || !arr.length) return `<span class="meta-empty">${fallback}</span>`;
            return arr.map(v => `<span class="meta-tag">${escapeHtml(String(v).replace(/_/g, ' '))}</span>`).join('');
        };

        const formatPresentation = (val) => {
            if (!val) return '<span class="meta-empty">—</span>';
            const labels = { '_4K': '4K UHD', 'SD': 'SD', 'HD': 'HD', 'DOLBY_VISION': 'Dolby Vision' };
            const display = labels[val] || String(val).replace(/_/g, ' ');
            const cls = val === '_4K' ? 'tag-4k' : val === 'HD' ? 'tag-hd' : 'tag-sd';
            return `<span class="meta-badge ${cls}">${escapeHtml(display)}</span>`;
        };

        const renderMetaBody = (cc) => {
            const meta = getCountryMeta(cc) || {};
            const offers = provider.countries?.[cc] || [];
            const hasAnyMeta = !!(meta.presentationType || meta.videoTechnology?.length || meta.audioTechnology?.length || meta.audioLanguages?.length || meta.subtitleLanguages?.length);
            const offerTags = offers.length
                ? offers.map(off => `<span class="tag ${String(off.type || '').toLowerCase()}">${escapeHtml(off.type || '')}</span>`).join('')
                : '<span class="meta-empty">—</span>';
            console.log(`Load Metadata for ${name} [${cc}]:`, hasAnyMeta ? meta : '(no JustWatch tech yet)');
            return `
                ${hasAnyMeta ? '' : `<div class="details-popup-hint">No JustWatch metadata for ${escapeHtml(countryNamesMap[cc] || cc)} yet — showing TMDB availability. Data loads in the background, try another region or reopen in a few seconds.</div>`}
                <div class="details-popup-row">
                    <div class="details-popup-label">Offers (${escapeHtml(cc)})</div>
                    <div class="details-popup-value">${offerTags}</div>
                </div>
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
                <div class="details-popup-row">
                    <div class="details-popup-label">Subtitles</div>
                    <div class="details-popup-value audio-langs">${formatList(meta.subtitleLanguages)}</div>
                </div>
            `;
        };

        const existingModal = document.getElementById('detailsPopupModal');
        if (existingModal) existingModal.remove();

        const modalEl = document.createElement('div');
        modalEl.id = 'detailsPopupModal';
        modalEl.className = 'details-popup-overlay';
        modalEl.dataset.provider = name;
        modalEl.dataset.country = current;
        modalEl.innerHTML = `
            <div class="details-popup">
                <div class="details-popup-header">
                    <div class="details-popup-brand">
                        <img src="${logoUrl(provider)}" alt="${escapeHtml(name)}" onerror="this.src='${tmdb.getPlaceholderUrl(300, 300, 'No Logo')}'">
                        <span>${escapeHtml(name)}</span>
                    </div>
                    <button class="details-popup-close" id="detailsPopupClose">&#x2715;</button>
                </div>
                <div class="details-popup-body">
                    <div class="details-popup-row">
                        <div class="details-popup-label">Region</div>
                        <div class="details-popup-value">
                            <div class="meta-region-grid">
                                ${countries.map(cc => `
                                    <button type="button" class="meta-region-btn${cc === current ? ' active' : ''}" data-country="${cc}" title="${escapeHtml(countryNamesMap[cc] || cc)}">
                                        <span class="meta-region-code">${cc}</span>
                                        <span class="meta-region-name">${escapeHtml(countryNamesMap[cc] || cc)}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <div id="metaDetailsBody">
                        ${renderMetaBody(current)}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);
        document.body.style.overflow = 'hidden';

        const close = () => { modalEl.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        document.getElementById('detailsPopupClose').onclick = close;
        modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

        modalEl.querySelectorAll('.meta-region-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const cc = btn.dataset.country;
                if (!cc || cc === modalEl.dataset.country) return;
                modalEl.dataset.country = cc;
                current = cc;
                modalEl.querySelectorAll('.meta-region-btn').forEach(b => b.classList.toggle('active', b.dataset.country === cc));
                const body = modalEl.querySelector('#metaDetailsBody');
                if (body) body.innerHTML = renderMetaBody(cc);
            });
        });
    };

    // Maps raw JustWatch tech enum values to clean human-readable labels
    const formatTechLabel = (val) => {
        if (!val) return '';
        const map = {
            '_4K':                '4K',
            'HD':                 'HD',
            'SD':                 'SD',
            'DOLBY_VISION':       'Dolby Vision',
            'HDR':                'HDR',
            'HDR10':              'HDR10',
            'HDR10_PLUS':         'HDR10+',
            'DOLBY_ATMOS':        'Dolby Atmos',
            'DOLBY_DIGITAL':      'Dolby Digital',
            'DOLBY_DIGITAL_PLUS': 'Dolby Digital+',
            '_5_1':               '5.1',
            '_7_1':               '7.1',
            '_5_POINT_1':         '5.1',
            '_7_POINT_1':         '7.1',
            'STEREO':             'Stereo',
            'MONO':               'Mono',
        };
        return map[val] ?? val.replace(/_/g, ' ').trim();
    };

    // Logo helper: TMDB path (/xxx.jpg) -> image.tmdb.org, JW URL (http...) -> as-is, null -> placeholder.
    const logoUrl = (provider) => {
        const raw = provider?.logo || provider?.jwLogo || null;
        if (!raw) return tmdb.getPlaceholderUrl(300, 300, 'No Logo');
        if (/^https?:\/\//i.test(raw)) return raw;
        return `https://image.tmdb.org/t/p/original${raw}`;
    };
    const sortedProviderNames = () => Object.keys(providerGroups).sort((a, b) => {
        const major = ['Netflix', 'Disney Plus', 'Amazon Prime Video', 'Apple TV Plus', 'HBO Max'];
        const aIdx = major.indexOf(a);
        const bIdx = major.indexOf(b);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.localeCompare(b);
    });
    // Re-render the services grid in place so JW-only providers (auto-created
    // during background enrichment) appear without a full page re-render.
    const renderServicesGrid = () => {
        const grid = document.querySelector('.services-grid');
        if (!grid) return;
        const names = sortedProviderNames();
        grid.innerHTML = names.map(name => {
            const provider = providerGroups[name];
            const safeId = name.replace(/\s/g, '-').replace(/[^a-zA-Z-]/g, '');
            const countries = Object.keys(provider.countries);
            return `
                <div id="card-${safeId}" class="service-card" onclick="window.switchService('${name.replace(/'/g, "\\'")}')" data-provider="${name}">
                    <div class="card-inner">
                        <img src="${logoUrl(provider)}" alt="${name}" loading="lazy" decoding="async" onerror="this.src='${tmdb.getPlaceholderUrl(300, 300, 'No Logo')}'">
                        <div class="card-info">
                            <span class="provider-name">${name}</span>
                            <span class="country-count">${countries.length} countries</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };
    window.renderServicesGrid = renderServicesGrid;

    const renderRegionalStreaming = () => {
        const providerNames = sortedProviderNames();

        if (providerNames.length === 0) return '';

        return `
            <section class="streaming-section">
                <div class="streaming-meta section-head">
                    <div>
                        <p class="eyebrow">Where to watch</p>
                        <h2 class="section-title">Services Availability</h2>
                    </div>
                    <div class="section-actions">
                        <span class="live-dot"></span><span class="live-text">Click a provider</span>
                        ${renderSectionToggle('services-panel', providerNames.length)}
                    </div>
                </div>
                
                <div class="collapsible" id="services-panel">
                  <div class="collapsible-inner">
                <div class="services-grid">
                    ${providerNames.map(name => {
            const provider = providerGroups[name];
            const safeId = name.replace(/\s/g, '-').replace(/[^a-zA-Z-]/g, '');
            const countries = Object.keys(provider.countries);
            return `
                            <div id="card-${safeId}" class="service-card" onclick="window.switchService('${name.replace(/'/g, "\\'")}')" data-provider="${name}">
                                <div class="card-inner">
                                    <img src="${logoUrl(provider)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" onerror="this.src='${tmdb.getPlaceholderUrl(300, 300, 'No Logo')}'">
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
                  </div>
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
                                <img src="${logoUrl({ logo: p.logo_path })}" alt="${escapeHtml(p.provider_name)}" loading="lazy" decoding="async" onerror="this.src='${tmdb.getPlaceholderUrl(300, 300, 'No Logo')}'">
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
                <p class="eyebrow">${type === 'tv' ? 'Series' : 'Film'} · ${year}</p>
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

                <div class="detail-actions">
                    ${trailer ? `<button class="btn btn-primary" id="openTrailerBtn">Watch Trailer</button>` : ''}
                    ${data.homepage ? `<a href="${data.homepage}" target="_blank" rel="noopener" class="btn btn-ghost">Official Website</a>` : ''}
                </div>
            </div>
        </header>

    <section class="cast-section">
        <div class="section-head">
            <div>
                <p class="eyebrow">The essentials</p>
                <h2 class="section-title">Details</h2>
            </div>
        </div>

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

        <div class="section-head">
            <div>
                <p class="eyebrow">Leading roles</p>
                <h2 class="section-title">Top Cast</h2>
            </div>
            ${renderSectionToggle('cast-panel', castCount)}
        </div>
        <div class="collapsible" id="cast-panel">
            <div class="collapsible-inner">
                <div class="cast-grid">
                    ${data.credits.cast.slice(0, 12).map(c => `
                    <div class="cast-card">
                        <img src="${c.profile_path ? tmdb.getImageUrl(c.profile_path) : tmdb.getPlaceholderUrl(300, 300, 'No Photo')}" alt="${c.name}">
                        <h3>${c.name}</h3>
                        <p class="role">as ${c.character}</p>
                    </div>
                `).join('')}
                </div>
            </div>
        </div>
    </section>
        
        ${type === 'tv' && data.seasons ? `
        <section class="seasons-section">
            <div class="section-head">
                <div>
                    <p class="eyebrow">Episodes by season</p>
                    <h2 class="section-title">Seasons</h2>
                </div>
                <div class="section-actions">
                    <span class="live-dot"></span><span class="live-text">Click a season</span>
                </div>
            </div>
            <div class="movie-row" id="seasonRow">
                ${data.seasons.map(s => `
                    <div class="movie-card season-card" role="button" tabindex="0" data-season="${s.season_number}" onclick="window.switchSeason(${s.season_number})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.switchSeason(${s.season_number})}">
                        <div class="poster-wrapper">
                            <img src="${s.poster_path ? tmdb.getImageUrl(s.poster_path) : tmdb.getPlaceholderUrl(500, 750, 'No Poster')}" alt="${escapeHtml(s.name)}" loading="lazy" decoding="async">
                            <span class="card-shine"></span>
                        </div>
                        <div class="movie-info">
                            <h3>${escapeHtml(s.name)}</h3>
                            <div class="movie-meta">
                                <span>${s.episode_count} Episodes</span>
                                <span>${s.air_date ? s.air_date.split('-')[0] : ''}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div id="season-details-panel" class="season-details-panel">
                <!-- Episodes load here -->
            </div>
        </section>
        ` : ''
        }

        ${renderRegionalStreaming()}

        ${similarResults.length > 0 ? `
        <section class="similar-section">
            <div class="section-head">
                <div>
                    <p class="eyebrow">If you liked this</p>
                    <h2 class="section-title">More Like This</h2>
                </div>
            </div>
            <div class="movie-row" id="similarGrid">
                ${similarResults.slice(0, 10).map(m => `
                    <div class="movie-card" onclick="window.location.href='detail.html?id=${m.id}&type=${type}'">
                        <div class="poster-wrapper">
                            <img src="${tmdb.getImageUrl(m.poster_path)}" alt="${escapeHtml(m.title || m.name)}" loading="lazy" decoding="async">
                            <span class="card-shine"></span>
                        </div>
                        <div class="movie-info">
                            <h3>${escapeHtml(m.title || m.name)}</h3>
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

    // --- Collapsible sections (phones only) -----------------------------
    // CSS opens the panels by default and only switches them to closed below
    // the breakpoint, so the buttons here just flip the [data-open] flag.
    const MOBILE_QUERY = '(max-width: 768px)';

    const setSectionOpen = (panel, toggle, open) => {
        if (!panel) return;
        panel.dataset.open = open ? 'true' : 'false';
        if (toggle) {
            toggle.setAttribute('aria-expanded', String(open));
            const label = toggle.querySelector('.section-toggle-text');
            if (label) label.textContent = open ? 'Hide' : `Show (${toggle.dataset.count})`;
        }
    };

    document.querySelectorAll('.section-toggle').forEach((toggle) => {
        const panel = document.getElementById(toggle.getAttribute('aria-controls'));
        if (!panel) return;
        // Start collapsed on phones, open everywhere else.
        setSectionOpen(panel, toggle, !window.matchMedia(MOBILE_QUERY).matches);

        toggle.addEventListener('click', () => {
            setSectionOpen(panel, toggle, panel.dataset.open !== 'true');
        });
    });

    // Rotating the phone to landscape should never leave a section stuck shut.
    window.matchMedia(MOBILE_QUERY).addEventListener('change', (e) => {
        document.querySelectorAll('.section-toggle').forEach((toggle) => {
            const panel = document.getElementById(toggle.getAttribute('aria-controls'));
            setSectionOpen(panel, toggle, !e.matches);
        });
    });

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

        // A provider can only be picked while the dropdown is open, but the
        // price enrichment path calls this later — make sure it stays visible.
        const sectionPanel = document.getElementById('services-panel');
        if (sectionPanel && sectionPanel.dataset.open !== 'true') {
            setSectionOpen(sectionPanel, document.querySelector('[aria-controls="services-panel"]'), true);
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
                        <img src="${logoUrl(provider)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" onerror="this.src='${tmdb.getPlaceholderUrl(300, 300, 'No Logo')}'">
                        <div class="p-info-large">
                            <h3>${name}</h3>
                            <p>${countries.length} countries · ${Array.from(allTags).map(type => `<span class="tag ${type.toLowerCase()}">${type}</span>`).join(' ')}</p>
                        </div>
                    </div>
                    <div class="p-actions-large">
                        <button class="btn-mini-alt" data-jw-btn onclick="window.loadProviderDetails('${name.replace(/'/g, "\\'")}', event)">
                            Load Metadata
                        </button>
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
                                ? `<span class="tech-badge">${formatTechLabel(enriched.presentationType)}</span>`
                                : '',
                            ...(enriched.videoTechnology || []).map(v => {
                                const label = formatTechLabel(v);
                                return label ? `<span class="tech-badge">${label}</span>` : '';
                            }),
                            ...(enriched.audioTechnology || []).map(a => {
                                const label = formatTechLabel(a);
                                return label ? `<span class="tech-badge">${label}</span>` : '';
                            })
                        ].filter(Boolean).join('') : '';
                        const hasTechBadges = techBadges.trim().length > 0;

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
                            ${hasTechBadges ? `<div class="country-pill-tech">${techBadges}</div>` : ''}
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

    // --- Seasons: click a season card to load its episodes ---
    const tvId = type === 'tv' ? data.id : null;
    let activeSeason = null;

    window.switchSeason = async (seasonNumber) => {
        if (!tvId) return;
        const num = Number(seasonNumber);
        const cards = document.querySelectorAll('.season-card');
        const panel = document.getElementById('season-details-panel');
        if (!panel) return;

        // Toggle off when clicking the active season again
        if (activeSeason === num && document.querySelector('.season-card.active')) {
            cards.forEach(c => c.classList.remove('active'));
            panel.classList.remove('active');
            panel.innerHTML = '';
            activeSeason = null;
            return;
        }
        activeSeason = num;

        cards.forEach(c => c.classList.toggle('active', Number(c.dataset.season) === num));

        panel.classList.add('active');
        panel.innerHTML = `<div class="season-loading">Loading episodes\u2026</div>`;

        try {
            const season = await tmdb.getSeason(tvId, num);
            if (!season || !season.episodes) throw new Error('No episodes');
            panel.innerHTML = `
                <div class="season-details-head">
                    <div>
                        <p class="eyebrow">Season ${season.season_number}</p>
                        <h3>${escapeHtml(season.name || `Season ${season.season_number}`)}</h3>
                        ${season.overview ? `<p class="season-overview">${escapeHtml(season.overview)}</p>` : ''}
                    </div>
                    <span class="season-count">${season.episodes.length} episodes</span>
                </div>
                <div class="episode-list">
                    ${season.episodes.map(ep => `
                        <article class="episode-item">
                            <div class="episode-thumb">
                                <img src="${ep.still_path ? tmdb.getImageUrl(ep.still_path) : tmdb.getPlaceholderUrl(320, 180, 'No Still')}" alt="${escapeHtml(ep.name || `Episode ${ep.episode_number}`)}" loading="lazy" decoding="async">
                                <span class="episode-num">E${ep.episode_number}</span>
                            </div>
                            <div class="episode-info">
                                <h4><span class="ep-code">${ep.episode_number}.</span> ${escapeHtml(ep.name || 'Untitled')}</h4>
                                <div class="episode-meta">
                                    ${ep.air_date ? `<span>${escapeHtml(ep.air_date)}</span>` : ''}
                                    ${ep.runtime ? `<span>${ep.runtime} min</span>` : ''}
                                    ${ep.vote_average ? `<span class="rating">\u2605 ${Number(ep.vote_average).toFixed(1)}</span>` : ''}
                                </div>
                                ${ep.overview ? `<p>${escapeHtml(ep.overview)}</p>` : '<p class="episode-empty">No synopsis available.</p>'}
                            </div>
                        </article>
                    `).join('')}
                </div>
            `;
        } catch (e) {
            console.warn('Failed to load season', num, e);
            panel.innerHTML = `<div class="season-loading">Could not load episodes for Season ${num}.</div>`;
        }
    };
}

init();

