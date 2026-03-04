const JW_API = "/api/jw";

const COUNTRIES = [
    "US", "ID", "SG", "JP", "KR", "GB", "DE", "FR", "IT", "ES",
    "CA", "AU", "BR", "MX", "IN", "MY", "PH", "TH", "TW"
];

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------
async function jwRequest(operationName, query, variables) {
    try {
        const res = await fetch(JW_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // JustWatch expects a recognisable User-Agent; bare "fetch" is
                // often blocked. Set this on a server-side proxy if CORS is an issue.
                "User-Agent": "Mozilla/5.0"
            },
            body: JSON.stringify({ operationName, query, variables })
        });

        if (!res.ok) {
            console.error(`JustWatch HTTP error: ${res.status}`);
            return null;
        }

        const data = await res.json();

        if (data.errors?.length) {
            console.error("JustWatch GraphQL errors:", data.errors);
            return null;
        }

        return data.data ?? null;
    } catch (err) {
        console.error("JustWatch fetch error:", err);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Build per-country offer aliases.
// Country values must be GraphQL enum literals (no quotes).
// ---------------------------------------------------------------------------
function buildCountryOfferAliases(countries) {
    return countries.map(c => `
        ${c.toLowerCase()}: offers(country: ${c}, platform: WEB, filter: { bestOnly: false }) {
            ...OfferFields
        }
    `).join("\n");
}

// Reusable offer fragment — retailPrice requires a language argument.
const OFFER_FRAGMENT = `
    fragment OfferFields on Offer {
        id
        monetizationType
        presentationType
        videoTechnology
        audioTechnology
        audioLanguages
        subtitleLanguages
        retailPrice(language: en)
        retailPriceValue
        currency
        standardWebURL
        elementCount
        availableTo
        package {
            id
            packageId
            clearName
            technicalName
            icon(profile: S100)
        }
    }
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const justwatch = {

    /**
     * Search for a title and return the best-matching JustWatch node.
     * Uses the correct `searchTitles` query with proper argument types.
     */
    async findTitle(title, year, type) {
        // objectTypes must be enum values: MOVIE or SHOW
        const objectType = type === "movie" ? "MOVIE" : "SHOW";

        const query = `
            query SearchTitles($searchTitlesFilter: TitleFilter!, $language: Language!, $first: Int!) {
                popularTitles(
                    country: US
                    filter: $searchTitlesFilter
                    first: $first
                    sortBy: POPULAR
                    sortRandomSeed: 0
                ) {
                    edges {
                        node {
                            id
                            objectType
                            content(country: US, language: $language) {
                                title
                                originalReleaseYear
                                fullPath
                            }
                        }
                    }
                }
            }
        `;

        // JustWatch filter uses searchQuery for text search
        const variables = {
            searchTitlesFilter: {
                searchQuery: title,
                objectTypes: [objectType]
            },
            language: "en",
            first: 15
        };

        const data = await jwRequest("SearchTitles", query, variables);
        if (!data?.popularTitles) return null;

        const edges = data.popularTitles.edges ?? [];

        // Find the closest match by title + year
        const needle = title.toLowerCase();

        let match = edges.find(({ node }) => {
            const nodeTitle = node.content?.title?.toLowerCase() ?? "";
            const nodeYear = node.content?.originalReleaseYear;

            const titleMatch =
                nodeTitle === needle ||
                nodeTitle.includes(needle) ||
                needle.includes(nodeTitle);

            const yearMatch =
                !year || !nodeYear ||
                Math.abs(parseInt(nodeYear) - parseInt(year)) <= 1;

            return titleMatch && yearMatch;
        });

        // Fall back to the first result when nothing matches exactly
        if (!match && edges.length > 0) match = edges[0];

        return match ? match.node : null;
    },

    /**
     * Fetch streaming offers for a given JustWatch node across multiple countries.
     * Returns { [countryCode]: Offer[] }
     */
    async getStreaming(jwNode, countryList) {
        if (!jwNode?.id) return {};

        const countries = countryList ?? COUNTRIES;

        const query = `
            query GetOffers($id: ID!) {
                node(id: $id) {
                    ... on MovieOrShowOrSeasonOrEpisode {
                        ${buildCountryOfferAliases(countries)}
                    }
                }
            }
            ${OFFER_FRAGMENT}
        `;

        const data = await jwRequest("GetOffers", query, { id: jwNode.id });
        if (!data?.node) return {};

        const resultsByCountry = {};

        for (const country of countries) {
            const raw = data.node[country.toLowerCase()];
            if (!raw?.length) continue;

            resultsByCountry[country] = raw.map(o => ({
                provider: o.package.clearName,
                technicalName: o.package.technicalName,
                type: o.monetizationType,          // FLATRATE | BUY | RENT | FREE | ADS
                quality: o.presentationType,          // SD | HD | _4K
                videoTechnology: o.videoTechnology ?? [],    // ["HDR10", "DOLBY_VISION", …]
                audioTechnology: o.audioTechnology ?? [],    // ["DOLBY_ATMOS", …]
                audioLanguages: o.audioLanguages ?? [],
                subtitleLanguages: o.subtitleLanguages ?? [],
                elementCount: o.elementCount,              // seasons / episodes available
                availableTo: o.availableTo,               // expiry date string or null
                link: o.standardWebURL,
                price: o.retailPriceValue != null
                    ? `${o.retailPriceValue} ${o.currency ?? ""}`.trim()
                    : null,
                logo: `https://images.justwatch.com/icon/${o.package.technicalName}/s100/`
            }));
        }

        return resultsByCountry;
    },

    /**
     * Convenience: search then fetch offers in one call.
     */
    async lookup(title, year, type, countryList) {
        const node = await this.findTitle(title, year, type);
        if (!node) return { node: null, streaming: {} };

        const streaming = await this.getStreaming(node, countryList);
        return { node, streaming };
    }
};

