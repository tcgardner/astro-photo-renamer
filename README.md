# astro-photo-renamer

A CLI tool that selects astrophotos from Google Photos via the Picker API and automatically renames them by deep-sky object catalog identifier (Messier, Caldwell, NGC, IC).

## How it works

1. **Google Photos Picker** — Opens a browser-based picker so you select exactly which photos to process.
2. **Download** — Fetches the selected images to a local staging directory.
3. **Identify** — Each image passes through a four-layer pipeline until resolved:
   - **Layer 1 — EXIF** Reads a catalog name (e.g. `M31`) or RA/Dec coordinates out of embedded EXIF/XMP metadata.
   - **Layer 2 — Plate solve** Submits the image to [astrometry.net](https://nova.astrometry.net/). If objects are named in `objects_in_field`, all are collected and the best match by catalog precedence (Messier > Caldwell > NGC > IC) wins immediately; otherwise the returned RA/Dec feeds the next layer.
   - **Layer 2b — Catalog cross-reference** Queries VizieR (Messier VII/118, Caldwell VII/294, NGC/IC VII/1B) with the RA/Dec to find the nearest object.
   - **Layer 3 — AI vision** Sends the image to Gemini with a structured prompt and accepts the result if confidence is `high` or `medium`.
4. **Rename** — Resolved images move to `output/resolved/` named `{Identifier}_{Common_Name}.jpg`; unresolved images move to `output/unresolved/`.

## Prerequisites

- **Node.js 20+**
- A Google Cloud project with:
  - **Photos Picker API** enabled
  - An **OAuth 2.0 Client ID** (Desktop app type) downloaded as `credentials.json`
- An [astrometry.net](https://nova.astrometry.net/) API key *(optional but strongly recommended)*
- A [Google AI Studio API key](https://aistudio.google.com/apikey) *(optional, used as last-resort AI fallback — free tier available)*

## Setup

> **Quick note on `start.*` scripts:** `start.sh`, `start.ps1`, and `start.cmd` are included in this directory. They run pre-flight checks (Node version, `.env`, `credentials.json`) and print usage, then exit. This tool has no server to start — use `npm run dev -- <command>` directly.

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your values:

```env
GPHOTO_CREDENTIALS_FILE=credentials.json   # path to OAuth client JSON
ASTROMETRY_API_KEY=                         # astrometry.net key
GEMINI_API_KEY=                             # Google AI Studio key
```

On first run a browser window will open for Google OAuth consent. The resulting token is cached to `token.json`. Delete `token.json` to force re-authentication.

## Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Enable APIs**.
2. Search for and enable **Photos Picker API**.
3. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID** (Application type: *Desktop app*).
4. Download the JSON file and save it as `credentials.json` in the project root (or wherever `GPHOTO_CREDENTIALS_FILE` points).

## Usage

```bash
npm run dev -- <command> [options]
```

| Command | Description |
|---------|-------------|
| `download` | Open Photos Picker, download selected images to `staging/` |
| `identify` | Identify and rename images already in `staging/` |
| `rename` | Alias for `identify` |
| `run` | Download + identify + rename in one shot |
| `run --local` | Skip download; process images already in `staging/` |

```bash
# Full pipeline
npm run dev -- run

# Download only
npm run dev -- download

# Re-process images you already have in staging/
npm run dev -- run --local

# Preview what would happen without moving any files
DRY_RUN=true npm run dev -- run --local
```

## Output structure

```
output/
  resolved/
    M31_Andromeda_Galaxy.jpg
    M42_Orion_Nebula.jpg
    M42_Orion_Nebula_02.jpg      ← duplicate target → gets _02, _03, … suffix
    NGC_7000_North_America_Nebula.jpg
  unresolved/
    IMG_0042.jpg                 ← identification failed
  run_log.json                   ← JSON summary of the run
staging/
  *.jpg                          ← downloaded originals (kept as-is)
```

## Naming rules

- **Catalog priority**: Messier > Caldwell > NGC > IC
- **Format**: `{Identifier}_{Common_Name}.{ext}` (common name omitted if unavailable)
- **NGC / IC identifiers** have their internal space replaced by `_`: `NGC_7000`, `IC_1805`
- **Common names** are sanitized: non-word characters stripped, whitespace collapsed to `_`
- **Duplicates**: a second photo of the same object becomes `_02`, a third `_03`, etc.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GPHOTO_CREDENTIALS_FILE` | `credentials.json` | Path to OAuth 2.0 client credentials |
| `STAGING_DIR` | `./staging` | Download destination |
| `OUTPUT_DIR` | `./output` | Root output directory |
| `UNRESOLVED_DIR` | `./output/unresolved` | Destination for unidentified images |
| `ASTROMETRY_API_KEY` | *(empty)* | astrometry.net API key; plate solving skipped if unset |
| `GEMINI_API_KEY` | *(empty)* | Google AI Studio API key; AI vision skipped if unset |
| `AI_VISION_MODEL` | `gemini-2.5-flash` | Gemini model used for visual identification |
| `DRY_RUN` | `false` | Log moves without executing them |
| `PLATE_SOLVE_TIMEOUT_SECONDS` | `180` | Max seconds to wait for astrometry.net |
| `SKIP_EXISTING` | `true` | Skip re-downloading files already present in staging |
| `DOWNLOAD_CACHE_FILE` | `./output/download_cache.json` | Path to the download cache; items already in the cache are skipped entirely |

## Development

```bash
npm run dev -- <command>   # Run via tsx (no build step)
npm run build              # Compile TypeScript → dist/
npm start -- <command>     # Run compiled output
npm test                   # Run unit tests
```
