# Energy Access Explorer Tool (Fork)

This repository contains the patched and extended frontend visualization tool for the **Energy Access Explorer (EAE)** platform, supporting responsive embedded mode, bidirectional `postMessage` communication, URL state synchronization, and programmatic criteria filtering.

---

## 📋 Table of Contents
- [Prerequisites & System Requirements](#-prerequisites--system-requirements)
- [Quick Start: Installation & Setup](#-quick-start-installation--setup)
- [Build Pipeline](#-build-pipeline)
- [Running the Local Development Server](#-running-the-local-development-server)
- [Running Automated Tests](#-running-automated-tests)
- [Features & Embedded API](#-features--embedded-api)
  - [URL Query Parameters](#url-query-parameters)
  - [Bidirectional postMessage Protocol](#bidirectional-postmessage-protocol)
- [Project Structure](#-project-structure)
- [Troubleshooting & FAQ](#-troubleshooting--faq)
- [License & Attribution](#-license--attribution)

---

## 🛠 Prerequisites & System Requirements

To build and run this repository locally, you will need the following tools installed:

| Tool | Version / Requirement | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` (v20+ recommended) | JavaScript runtime and package execution |
| **npm** | `>= 9.0.0` | Package management (`npm install`, `npx`) |
| **bmake** | BSD Make (GNU `make` is **not** supported) | Makefile build pipeline orchestrator |
| **jq** | Any modern version | JSON processing during settings compilation |
| **WSL** (Windows only) | Ubuntu / Debian | Required on Windows to run `bmake` and shell utilities |
| **Mapbox Account** | Public token required | Rendering base vector tiles in Mapbox GL JS |

### Installing build utilities

- **Ubuntu / Debian / WSL**:
  ```bash
  sudo apt update
  sudo apt install -y bmake jq
  ```
- **macOS** (via Homebrew):
  ```bash
  brew install bmake jq
  ```
- **Windows**:
  Run TypeScript compilation natively in PowerShell or Command Prompt, and run the `bmake` build target through **WSL** (`wsl bash -c "bmake build-a"`).

---

## 🚀 Quick Start: Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/didier-bazayesu/tool.git
cd tool
```

### 2. Install Node dependencies
```bash
npm install
```

### 3. Configure environment variables
Copy the template configuration into `.env`:
```bash
cp .env.example .env
```

Open `.env` in your editor and configure:
```dotenv
TITLE = "Energy Access Explorer"
WORLD = "https://world.energyaccessexplorer.org"
DOMAIN = "energyaccessexplorer.org"
API_URL = "https://api.energyaccessexplorer.org"
STORAGE_URL = "https://wri-public-data.s3.amazonaws.com/EnergyAccess/"
MAPBOX_THEME = "mapbox/basic-v9"
MAPBOX_TOKEN = "your_mapbox_public_token_here"
EMBED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000"
```
> **Note**: `EMBED_ORIGINS` defines the permitted parent origins for iframe embedding. Include `http://localhost:8000` to allow the wrapper webpage to communicate with the tool.

---

## 🏗 Build Pipeline

Building the tool involves two steps: compiling TypeScript/ES modules into `tsbuild/`, followed by assembling templates and assets with `bmake`:

### Step 1: Compile TypeScript
```bash
npx tsc -p .
```
This compiles TypeScript files and outputs type-checked JavaScript to `tsbuild/src/`.

### Step 2: Assemble distribution with `bmake`
- **On Linux / macOS**:
  ```bash
  bmake build-a
  ```
- **On Windows (via WSL)**:
  ```powershell
  wsl bash -c "cd '$(pwd -W)' && bmake build-a"
  ```
  *(Or navigate to your WSL mount and run `bmake build-a`)*

This step will:
1. Merge `.env` settings into `settings.tmp.json` using `jq`.
2. Concatenate settings, translations, and core scripts into `dist/a/main.js`.
3. Concatenate and minify styles into `dist/a/main.css`.
4. Compile the HTML shell `views/a.tmpl` into `dist/a/index.html`.
5. Copy modern module scripts (including `src/embed.js`) into `dist/a/`.

---

## 🌐 Running the Local Development Server

The tool's distribution files in `dist/` can be served with any static HTTP server. A directory junction `serve/tool` points directly to `dist/`, matching the production path `/tool/a/`.

Start the development server on port **3000**:
```bash
npx http-server serve -p 3000 -c-1
```

Once running, verify in your browser:
- Standalone view (Nagaland):  
  [http://localhost:3000/tool/a/?id=61cc6dc7-2159-405f-a0df-6faa8c583923](http://localhost:3000/tool/a/?id=61cc6dc7-2159-405f-a0df-6faa8c583923)
- Embedded view (`?embed=1`):  
  [http://localhost:3000/tool/a/?id=61cc6dc7-2159-405f-a0df-6faa8c583923&embed=1](http://localhost:3000/tool/a/?id=61cc6dc7-2159-405f-a0df-6faa8c583923&embed=1)

---

## 🧪 Running Automated Tests

The repository includes a comprehensive Node.js native test suite covering data state management, reactive streams, spatial bounds validation, and embed communication:

```bash
node --experimental-strip-types --test test/*.test.ts
```

All 59 unit tests should pass with 0 failures:
```
# tests 59
# suites 13
# pass 59
# fail 0
```

---

## 🔌 Features & Embedded API

This fork adds first-class support for embedding EAE inside third-party portals or wrapper webpages.

### URL Query Parameters

| Parameter | Type | Example | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `?id=61cc6dc7-2159-405f-a0df-6faa8c583923` | Geography ID (required, e.g. Nagaland) |
| `embed` | `1 \| 0` | `?embed=1` | Activates embedded mode (hides nav, footer, banners; collapses panels) |
| `snapshot` | `string` | `?snapshot=1791614683478` | Restores an exact mentor analysis snapshot |
| `zoom` | `number` | `?zoom=9.5` | Sets map camera zoom level (0 - 20) |
| `lng`, `lat` | `float` | `?lng=94.5&lat=26.1` | Sets map camera center coordinates |
| `divtier` | `number` | `?divtier=1` | Sets active administrative tier level |
| `subdiv` | `number` | `?subdiv=303` | Selects and highlights a specific district/subdivision |
| `criteria` | `boolean` | `?criteria=1` | Enables "Only show areas that meet all criteria" mask |
| `view` | `string` | `?view=data` | Active tab view (`data`, `analysis`, `filtered`) |

### Bidirectional postMessage Protocol

When embedded inside an `<iframe>` whose origin is listed in `EMBED_ORIGINS`:

#### Outgoing Messages (Tool → Parent)

1. **`eae:ready`** (sent once when EAE finishes initial load):
   ```javascript
   {
     type: "eae:ready",
     divisions: [
       {
         tier: 1,
         name: "Districts",
         entries: [
           { id: 303, name: "Kohima" },
           { id: 306, name: "Mon" }
         ]
       }
     ]
   }
   ```
2. **`eae:view`** (debounced 500ms, fired after map camera stops moving):
   ```javascript
   {
     type: "eae:view",
     zoom: 9.5,
     center: { lng: 94.5123, lat: 26.1045 }
   }
   ```

#### Incoming Messages (Parent → Tool)

The parent window can send **`eae:set`** messages to control the tool dynamically:
```javascript
iframe.contentWindow.postMessage({
  type: "eae:set",
  divtier: 1,
  subdiv: 303,
  zoom: 10,
  center: { lng: 94.1, lat: 25.67 },
  criteria: true,
  layers: {
    on: ["power-plants-solar"],
    off: ["annual-ghi"]
  }
}, "http://localhost:3000");
```

---

## 📁 Project Structure

```
tool/
├── bin/                       # Native build executables (views-compiler)
├── dist/                      # Compiled production assets
│   └── a/                     # Compiled analysis application (served at /tool/a/)
│       ├── index.html         # Shell HTML
│       ├── main.js            # Bundled core logic
│       ├── main.css           # Bundled styles
│       └── embed.js           # PostMessage controller module
├── src/                       # TypeScript and ECMAScript source files
│   ├── a.js                   # Application bootstrap and lifecycle
│   ├── embed.js               # Embedded mode messaging handler
│   ├── timeline-view.ts       # Criteria masking & timeline logic
│   └── mapbox.js              # Mapbox GL initialization and layer management
├── test/                      # Unit tests (Node.js test runner)
│   └── embed.test.ts          # Pure unit tests for embed validators
├── views/                     # HTML templates compiled by views-compiler
│   └── a.tmpl                 # Master analysis template
├── makefile                   # BSD Make compilation targets
├── package.json               # NPM metadata
└── .env.example               # Configuration template
```

---

## ❓ Troubleshooting & FAQ

### 1. `bmake: command not found`
- **Solution**: Install BSD Make (`sudo apt install -y bmake` on Debian/Ubuntu/WSL, or `brew install bmake` on macOS). Standard GNU `make` does not work with this makefile.

### 2. `jq: command not found`
- **Solution**: Install `jq` (`sudo apt install -y jq` or `brew install jq`).

### 3. Blank map or Mapbox error
- **Solution**: Ensure your `MAPBOX_TOKEN` in `.env` contains a valid public Mapbox token. Re-run `bmake reconfig && bmake build-a` whenever `.env` changes.

### 4. `postMessage` not received in parent page
- **Solution**: Verify `EMBED_ORIGINS` in `.env` includes your wrapper origin (e.g., `http://localhost:8000`). If `.env` is updated, execute:
  ```bash
  bmake reconfig
  bmake build-a
  ```

---

## 📄 License & Attribution

This project is licensed under the **MIT License**.

Before using or deploying this software, please review the [Energy Access Explorer Attribution Page](https://www.energyaccessexplorer.org/attribution).
