# TubeScout v1.3.1

**YouTube Competitor Research Tool**

TubeScout researches public YouTube video metadata and turns selected reference patterns into a new original content direction.

## Features

### Research
- Up to 50 YouTube URLs / video IDs per batch
- Supports watch, youtu.be, Shorts, live and embed URLs
- Title, description, public tags, channel, published date, duration and statistics
- Views/day velocity
- Engagement rate
- TubeScout title SEO heuristic
- Tag frequency and keyword overlap
- Competitor comparison
- CSV / XLSX export

### Scout to Create (v1.3.1)
Select 1–5 researched videos and generate locally in the browser:
- 1 main title + 5 alternative titles
- 3 image prompts: primary, variation and thumbnail
- Short hook description + full SEO description
- Meta tag keywords
- Hashtags
- Similarity level, use case, visual style, scene rule and aspect ratio controls
- Exportable Idea Pack (.txt)

The creator module uses local pattern analysis and does **not** require a second AI API key.

### PWA
- Web App Manifest
- Service worker / offline shell caching
- 192px and 512px install icons
- Apple touch icon + favicon
- Install App button when supported by the browser

## Environment Variable

Create this in Vercel:

```env
YOUTUBE_API_KEY=your_youtube_data_api_key
```

Keep the key server-side. Do not rename it to `NEXT_PUBLIC_YOUTUBE_API_KEY`.

For this server-side architecture, Google Cloud's **HTTP referrer restriction is not suitable** because server-to-server requests have no browser referrer. Restrict the key to **YouTube Data API v3** under API Restrictions.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Production build

```bash
npm run build
npm start
```

## Vercel

- Framework Preset: Next.js
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: default / blank
- Node.js: 22.x or newer compatible version

After adding or changing `YOUTUBE_API_KEY`, redeploy the project so the new deployment receives the environment variable.


## v1.3.1 branding update
- Red / black / white TubeScout theme.
- Sticky header with TubeScout H1 and transparent binocular logo.
- Logo mark is used for favicon and PWA icons.
- Full TubeScout artwork is shown as the standalone PWA launch splash.


## v1.3.1 changes
- Full-width sticky header with aligned inner branding.
- Success alerts use green; errors/warnings use amber.
- Scout to Create uses semantic anchors and Auto from reference intent detection.
- Baby sleep/lullaby/rain references preserve audience, sleep intent, sound theme, title language, visual direction, keywords and hashtags.


## v1.3.4 UI revision
- Font scale updated: original 10px → 12px, 8px → 10px, 7px → 9px.
- CSV export removed; XLSX export retained.
- Research Workspace inactive tabs use a red gradient with white text, including Create.
