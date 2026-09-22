# Ideal Eureka

A static movie discovery and detail site built with plain HTML, CSS, and JavaScript. The app pulls metadata from TMDB and streaming/offer data from JustWatch, with a Vercel serverless proxy for the JustWatch GraphQL endpoint.

## Features

- Movie and show listing from TMDB
- Detail page with metadata, synopsis, and provider information
- Country/region-based JustWatch offer selection
- Per-country metadata rendering
- Vercel-ready serverless API proxy

## Project structure

- `index.html` — homepage
- `detail.html` — movie/show detail page
- `css/` — stylesheets
- `js/` — frontend logic
- `api/jw.js` — Vercel API route for JustWatch requests
- `vercel.json` — Vercel rewrite configuration

## Run locally

Because this is a static site, you can run it with any local static server.

### Option 1: Python

```bash
cd e:\WEB\ideal-eureka-main
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

### Option 2: VS Code Live Server

Open the folder in VS Code and run a static server extension such as Live Server.

## Required environment

The app depends on external APIs and works best when the environment supports browser fetch requests to the local proxy.

- TMDB API keys/config in the frontend logic if required by your implementation
- JustWatch access via the proxy at `/api/jw`

## Vercel deployment

This project is designed for Vercel.

1. Push the project to GitHub.
2. Import the repository in Vercel.
3. Use the default settings.
4. Vercel will serve the static site and run the serverless route in `api/jw.js`.

The rewrite config is already included in `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ]
}
```

## Notes

- The frontend gracefully falls back to CORS proxies if the local `/api/jw` route is unavailable during local testing.
- For production, the Vercel serverless API is the preferred path.

## License

This project is for internal use unless otherwise stated by the original author.
