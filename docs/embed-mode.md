# Embed Mode in Energy Access Explorer

## Why

A standard webpage embedding Energy Access Explorer inside an `<iframe>` cannot interact with the map application. In vanilla EAE, navigation chrome, cookie banners, feedback widgets, and side panels remain expanded by default, obstructing the viewport. Furthermore, vanilla EAE does not accept camera positions, administrative subdivisions, or dataset layer toggles from URL query parameters or cross-window messages.

Embed mode adds:
1. URL query parameter parsing for camera coordinates, administrative divisions, screen tabs, and suitability criteria.
2. Responsive layout adjustments that collapse panels and hide chrome when embedded.
3. Bidirectional `window.postMessage` communication between the parent page and EAE.

## Enable It

Embed mode is activated by appending `embed=1` to the analysis view URL:

```
http://localhost:3000/tool/a/?id=<geography-uuid>&embed=1
```

### What Changes When `embed=1` is Present

1. **Window and Body Flags**:
   - `src/a.js:235-238`: Reads `url.searchParams.get('embed') === '1'`.
   - `src/a.js:240`: Sets `window.EMBED = true`.
   - `src/a.js:241`: Adds CSS class `embed` to `document.body` (`document.body.classList.add('embed')`).
2. **Hidden Chrome via CSS**:
   - `stylesheets/layout.css:57-89`: When `body.embed` is present:
     - `nav`: `display: none !important;` (hides main navigation header).
     - `#feedback-button`: `display: none !important;` (hides feedback modal trigger).
     - `#mobile-warning`: `display: none !important;` (hides desktop-only warning overlay).
     - `#cookie-notice`: `display: none !important;` (hides cookie banner).
     - `#right-panel`: Adjusted positioning without top navbar offset.
3. **Analytics and Tracking Scripts Suppressed**:
   - `views/google.tmpl:4`: If `?embed=1` is present, Google Tag Manager script returns early.
   - `views/hotjar.tmpl:4`: If `?embed=1` is present, Hotjar script returns early.
   - `views/sentry.tmpl:4`: If `?embed=1` is present, Sentry error monitoring script returns early.
   - `views/cookie.tmpl:4`: If `?embed=1` is present, Cookie notice initialization returns early.
4. **Panels Start Closed on Load**:
   - `src/a.js:525`: Skips `left_panel("cards")` when `window.EMBED` is true.
   - `src/a.js:532-537`: Left panel (`#left-panel`) and right panel (`#right-panel`) stay hidden (`display: none`), maximizing visible map area. They can still be opened manually using the side rail icon buttons.
5. **Initial Camera Rules**:
   - `src/a.js:540-566`: Handled by `initialViewStrategy`:
     - If `window.VIEW_FROM_URL` or `window.EMBED` is set, waits for `MAPBOX.loaded()` or the `idle` event before applying `STATE.center`, `STATE.zoom`, or `geographiessearch_load(STATE.divtier, STATE.subdiv)`.
     - Skips unconditional `mapbox_fit(GEOGRAPHY.envelope)` overwrite when camera parameters are specified.
6. **Communication Lifecycle Initialized**:
   - `src/a.js:573-579`: Calls `embed_init()` (`src/embed.js:85-143`) to set up message listeners and emit the initial `eae:ready` handshake.

## Behaviour Changes That Also Affect the NORMAL (Non-Embed) App

The following changes exist in the codebase and run even when `embed=1` is NOT present in the URL:

| File:Line | What it was (upstream `main`) | What it is now (`feat/embed-final`) | Why changed | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `src/a.js:246`, `src/s.js:240` | `if (window.innerWidth <= 768) return;` terminated execution on mobile screens. | Removed early return; added `if (window.innerWidth <= 768) MOBILE = true;` in `src/a.js:370`. | Allows EAE map initialization on screens <= 768 px width (including responsive embed iframes and mobile viewports). | Small layout rendering issues on very narrow mobile viewports (<320 px) where desktop panels were previously blocked entirely. |
| `stylesheets/mobile.css:22-26` | `#mobile-warning` displayed an overlay covering the entire screen on mobile. | `#mobile-warning { display: none !important; }` | Suppresses the blocking modal so users on narrow viewports can see the map. | Users on mobile viewports no longer see an explicit warning that desktop is recommended. |
| `views/env.tmpl:19-21` | Threw mismatch redirecting foreign domains to `/login` if hostname did not match `EAE['settings'].domain`. | `if (!match) { e = 'public'; }` | Allows hosting EAE on third-party hostnames (such as GitHub Pages or local staging). | An unauthenticated user browsing on an unlisted domain defaults to `public` instead of being redirected to `/login`. |
| `src/a.js:309-352` | URL query parameters (`zoom`, `center`, `divtier`, `subdiv`, `view`) were only parsed inside an `if (window.EMBED)` block. | Parameters are read and validated unconditionally in `init_1`. Sets `window.VIEW_FROM_URL = true` if valid camera params exist. | Allows standard EAE links with query parameters to restore specific map views directly in standalone mode. | If an invalid query string is supplied to normal EAE, it passes through validator functions; invalid values are discarded. |
| `src/a.js:1000-1025` | `load_inputs_param` matched dataset IDs by strict string equality only. | Added case-insensitive fallback matching against dataset `id`, `dataset_id`, `name`, and category names. | Allows flexible dataset activation from URL `inputs` parameter. | Potential name collision if two distinct datasets share identical normalized names. |

## URL Parameters

Parsed in `src/a.js:309-350`:

| Parameter | Type & Range | Function | Validation Rule |
| :--- | :--- | :--- | :--- |
| `id` | UUID string | Required. Selects geography. | Checked against API records in `init_1`. |
| `embed` | `"1"` | Enables embed mode. | Strict string equality: `=== '1'`. |
| `snapshot` | Numeric string | Loads saved analysis snapshot from API. | Loaded via `rpc/snapshot?_time=<time>`. |
| `zoom` | Float `0` to `22` | Sets Mapbox map zoom level. | `validate_state_value('zoom', v)` (`0 <= v <= 22`). |
| `lng` | Float `-180` to `180` | Sets map center longitude. | `validate_state_value('center', {lng, lat})`. |
| `lat` | Float `-90` to `90` | Sets map center latitude. | `validate_state_value('center', {lng, lat})`. |
| `divtier` | Integer `>= 0` | Sets active administrative tier level. | `validate_state_value('divtier', v)` (`v >= 0`). |
| `subdiv` | Integer `>= 0` | Sets active subdivision identifier. | `validate_state_value('subdiv', v)` (`v >= 0`). |
| `view` | `"data"` or `"analysis"` | Selects active view mode. | `validate_state_value('view', v)` (enum check). |
| `criteria` | `"1"`, `"0"`, `"true"`, `"false"` | Toggles suitability criteria mask. | Boolean check: `=== '1' \|\| === 'true'`. |
| `inputs` | Comma-separated strings | Activates initial datasets by ID or name. | Iterated and matched against loaded datasets in `DST`. |

## Messages

All cross-window communication is conducted via `window.postMessage`.

### 1. `eae:ready` (Tool -> Parent)

Emitted after tool initialization completes (`src/embed.js:101-110`) or when responding to `eae:ping` (`src/embed.js:150-159`).

**Payload Structure**:
```javascript
{
  type: "eae:ready",
  divisions: [
    {
      tier: 1,
      name: "Districts",
      entries: [
        { id: 0, name: "Dimapur" },
        { id: 1, name: "Kohima" },
        { id: 2, name: "Mokokchung" }
      ]
    }
  ]
}
```

The divisions payload is built by `build_divisions_payload` (`src/embed.js:17-82`). It reads `window.GEOGRAPHY.divisions` and `window.DST.get('admin-tiers')`, navigating hierarchical sub-region trees with a fallback to `divisions[1].csv.table`.

### 2. `eae:view` (Tool -> Parent)

Emitted when the map camera movement ends (`src/embed.js:113-142`). Debounced by 500 ms.

**Payload Structure**:
```javascript
{
  type: "eae:view",
  zoom: 8.36,
  center: {
    lng: 94.3077,
    lat: 26.1070
  }
}
```

### 3. `eae:ping` (Parent -> Tool)

Sent by parent to check readiness. The tool replies immediately with `eae:ready` and the current divisions payload (`src/embed.js:149-159`).

### 4. `eae:set` (Parent -> Tool)

Applies state modifications to the running EAE instance (`src/embed.js:161-254`). Fields are processed in this sequence:

| Field | Type | Action | Validation / Handling |
| :--- | :--- | :--- | :--- |
| `divtier` | number | Sets `STATE.divtier` | Applied before `subdiv`. |
| `subdiv` | number | Sets `STATE.subdiv` | Applied after `divtier`. |
| `zoom` | number | Sets `STATE.zoom` | Applied to map camera. |
| `center` | `{ lng, lat }` | Sets `STATE.center` | Applied to map camera. |
| `bounds` | `[minX, minY, maxX, maxY]` | Fits map camera to bounding box | Verified: array of 4 finite numbers, `-180 <= x <= 180`, `-90 <= y <= 90`, `min < max`. Calls `mapbox_fit`. |
| `view` | string | Sets `STATE.view` | Updates view tab. |
| `criteria` | boolean | Toggles criteria mask | Calls `window.setCriteriaMask(Boolean(data.criteria))`. |
| `layers` | `{ on: string[], off: string[] }` | Toggles specific dataset layers | Exact matching against `ds.id` or `ds.name`. Boundary layers (`polygons-boundaries`, `admin-tiers`) are protected and cannot be disabled. |

Any unrecognized fields in `eae:set` are ignored.

## Settings

Configured in `.env` and compiled into `dist/settings.json` and template bundles during build:

| Key | Description | Public / Private | Requirement |
| :--- | :--- | :--- | :--- |
| `TITLE` | Application page title | Public | String |
| `WORLD` | World view URL | Public | URL |
| `DOMAIN` | Main domain name | Public | Domain string |
| `API_URL` | EAE REST API base URL | Public | Must point to `https://api.energyaccessexplorer.org` |
| `STORAGE_URL` | S3 data bucket base URL | Public | Must point to `https://wri-public-data.s3.amazonaws.com/EnergyAccess/` |
| `MAPBOX_THEME` | Default Mapbox style theme | Public | Example: `mapbox/basic-v9` |
| `MAPBOX_TOKEN` | Mapbox GL access token | **Public token required** | Must be a user's own public `pk.` token restricted to the serving domain |
| `EMBED_ORIGINS` | Comma-separated allowed parent origins | Public | Origins permitted to embed and communicate via postMessage |

### `.env.example` Template

Create a local `.env` by copying `.env.example`:

```bash
TITLE = "Energy Access Explorer"
WORLD = "https://world.energyaccessexplorer.org"
DOMAIN = "energyaccessexplorer.org"
API_URL = "https://api.energyaccessexplorer.org"
STORAGE_URL = "https://wri-public-data.s3.amazonaws.com/EnergyAccess/"
MAPBOX_THEME = "mapbox/basic-v9"
MAPBOX_TOKEN = "<your_mapbox_token_here>"
EMBED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000"
```

*Note: Never commit `.env` containing active private tokens.*

## Build and Serve Locally

### Prerequisites

| Tool | Minimum Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` (v20+ recommended) | Package execution, test runner |
| **npm** | `>= 9.0.0` | Dependency installation |
| **bmake** | BSD Make | Makefile orchestration (GNU make is not supported) |
| **Go** | `>= 1.18` | Compiling template generator binaries in `bin/` |
| **jq** | Modern | JSON manipulation in make targets |
| **WSL** (Windows) | Ubuntu / Debian | Required on Windows to run `bmake` |

### Build Steps

In the `tool` repository directory:

```bash
# 1. Compile TypeScript source modules to tsbuild/
npx tsc -p .

# 2. Build analysis screen distribution using bmake (via WSL on Windows)
wsl bash -c "cd '/mnt/c/Users/user/Documents/The gym/react-understanding/react-project/tool' && bmake build-a"
```

### Serving Locally

The tool must be served on port `3000` from the distribution folder:

```bash
npx http-server serve -p 3000 -c-1 --cors
```

### Why Port 3000 is Required

The upstream WRI Amazon S3 data bucket (`https://wri-public-data.s3.amazonaws.com/EnergyAccess/`) permits browser CORS requests originating from `http://localhost:3000`. Serving the tool on other ports or domains causes data layer fetches to fail with HTTP 403 Forbidden errors.

The `-c-1` flag disables caching during local development.

## Tests

Execute unit tests from the `tool` directory:

```bash
node --experimental-strip-types --test test/*.test.ts
```

### Test Results

- Total tests: 48
- Passing: 46
- Failing: 2 (`even-label-indices.test.ts` and `locale-policy.test.ts`)

### Explanation of Legacy Test Failures

The 2 failing tests attempt to import uncompiled modules directly from `lib/`:
- `test/even-label-indices.test.ts` imports `lib/helpers.js`.
- `test/locale-policy.test.ts` imports `lib/bind.js`.

These legacy files are generated into `dist/lib/` during full `bmake deps` builds and are not checked into git. When `test/*.test.ts` is invoked directly without running the full make pipeline, Node.js cannot resolve the missing `lib/` files.

The embed test suite (`test/embed.test.ts`) has zero legacy dependencies and passes completely:
- `uses saved camera state only when a camera URL parameter was applied`: PASS
- `validates zoom, center, view, subdiv, divtier correctly`: PASS
- `validates bounding box geometry`: PASS
- `computes exact layer matching without touching boundaries`: PASS

## Security

1. **Origin Allow-List**:
   - `src/embed.js:3-16`: Reads `EMBED_ORIGINS` from `window.EAE.settings`. In development, defaults include `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:8000`, and `http://127.0.0.1:8000`.
   - In production, only origins declared in `EMBED_ORIGINS` are accepted.
2. **Event Verification**:
   - `src/embed.js:145-147`: Every received message is checked against `allowed_origins()`. Messages from unlisted origins are discarded.
3. **No Wildcard PostMessage**:
   - Outgoing messages (`eae:ready`, `eae:view`) explicitly specify parent origin targets (`src/embed.js:108, 137`). The target is never `*`.
4. **Input Sanitization**:
   - Numerical coordinates (`zoom`, `center`, `bounds`) are verified for numerical bounds and NaN/infinite values before application.

## Limitations

1. **Bucket CORS Restrictions**:
   - Direct hosting on public cloud domains is blocked because the S3 data bucket only permits whitelisted origins.
2. **Analytics Disabled**:
   - GTM, Hotjar, and Sentry are disabled when `embed=1` is active to prevent redundant parent/child event tracking.
3. **Subdivision Support**:
   - Administrative tree parsing in `build_divisions_payload` relies on availability of `admin-tiers` vector tables.

## Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| HTTP 404 at `/tool/a/` | Screen `a` has not been compiled into `dist/a/` | Run `bmake build-a` in the tool directory. |
| Blank white page with `pptxgen.js` syntax error | Outdated export dependency during make compilation | Run `bmake clean && bmake build-a`. |
| `TODO_` strings visible in `dist/a/main.js` | Settings placeholders were not replaced from `.env` | Ensure `.env` exists with valid configuration before running `bmake`. |
| Mapbox HTTP 401 Unauthorized | Missing or invalid Mapbox token | Verify `MAPBOX_TOKEN` in `.env` is set to a valid public token. |
| Mapbox tiles load but raster datasets fail | Serving origin rejected by S3 bucket CORS policy | Ensure tool server is running strictly on port `3000` (`http://localhost:3000`). |
