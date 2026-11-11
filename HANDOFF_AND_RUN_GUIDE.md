# EAE Tool: Quickstart, Debugging & Handoff Guide

This document explains **how to run the project locally**, the **root cause of the white-screen bug and how it was fixed**, and **how to rebuild and test the tool** on a Windows machine using WSL.

---

## 1. Quick Start: How to Run the Project Locally

The project serves pre-built static files from the `serve/tool` folder (which mirrors `dist/`).

### Step 1: Start the Local HTTP Server
Run this from PowerShell or terminal in the repository root:
```powershell
npx http-server serve -p 3000 -c-1
```
> `-c-1` disables caching so any code edits or new builds reflect immediately.

### Step 2: Open in Your Browser
Navigate to the embedded map view:
```text
http://localhost:3000/tool/a/?id=61cc6dc7-2159-405f-a0df-6faa8c583923&snapshot=1791614683478&embed=1
```
* **Expected result**: You should see the interactive Mapbox map load with analysis layers, navigation controls, and sidebars ("Prioritization", "Data", "Export", etc.).

---

## 2. Background: What Caused the White Page & How It Was Fixed

### The Problem
When loading `http://localhost:3000/tool/a/...`, the screen remained completely blank (white page). DevTools console showed:
```text
pptxgen.js:3 Uncaught SyntaxError: Invalid or unexpected token
```

### The Diagnosis
1. `node --check dist/lib/pptxgen.js` failed with syntax error.
2. The file on disk was **163,102 bytes** instead of the expected **271,013 bytes**.
3. It had been truncated midway through an embedded base64 image string, causing invalid syntax when parsed as JavaScript.

### The Fix
1. Downloaded the clean vendor file from the URL listed in `dependencies.tsv`:
   `https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@4.0.1/dist/pptxgen.min.js` (271,010 bytes).
2. Applied the required build transform (`sed 's/var PptxGenJS=/window.PptxGenJS=/'`), yielding 271,013 bytes.
3. Verified syntax passed (`node --check`).
4. Replaced both `dist/lib/pptxgen.js` and `serve/tool/lib/pptxgen.js`.
5. Re-synced `dist/` into `serve/tool/`.

---

## 3. How to Rebuild the Project (Using WSL)

Windows lacks native `bmake`, `go` (for templates/locales), and `jq`. The build environment is configured to run inside **WSL Ubuntu**.

### One-Command Rebuild
Run this command directly from Windows PowerShell:
```powershell
wsl -d Ubuntu -- sh -c "cd '/mnt/d/The Gym/tool' && bmake reconfig build"
```

### Sync Build to the Server
After rebuilding `dist/`, update `serve/tool`:
```powershell
if (Test-Path serve\tool) { Remove-Item -Recurse -Force serve\tool }
Copy-Item -Recurse -Force dist serve\tool
```

### What the Build Command Does:
1. `reconfig`: Reads `.env` and compiles runtime configuration (`settings.tmp.json`) using `jq`.
2. `deps`: Validates vendor bundles in `dist/lib` against `dependencies.tsv`.
3. `templates` & `locales`: Compiles Go CLI tools in `./bin`.
4. `build-translations`: Generates localization dictionaries from CSV tables.
5. `ts`: Transpiles TypeScript files to JavaScript using `tsc -p .`.
6. `build-a`, `build-s`, `build-m`, `build-p`: Packages the Analysis, Select, My, and Snapshot screen bundles.
7. Generates final entry points: `dist/index.html` and screen HTML files.

---

## 4. How to Verify & Run Automated Tests

### A. Run Unit Tests (Node native test runner)
```powershell
node --experimental-strip-types --test test/*.test.ts
```
All 56 tests should pass.

### B. Run End-to-End Headless Browser Test (Playwright)
The `e2e/` folder contains a headless Chromium test using SwiftShader software WebGL:
```powershell
node e2e/run-browser.cjs
```
This script:
1. Boots headless Chromium with WebGL enabled.
2. Navigates to the local embed URL on port `3000`.
3. Verifies that the Mapbox canvas attached and rendered non-blank pixels.
4. Confirms zero fatal console errors.
5. Saves a screenshot to `e2e/results/page.png` and report to `e2e/results/browser-report.json`.

---

## 5. Key Architecture & File Map

| Path | Purpose |
| :--- | :--- |
| `src/` | TypeScript/JavaScript application source code. |
| `dist/` | Compiled distribution bundles and vendor libraries. |
| `serve/tool/` | Directory served by `http-server` (matches `dist/`). |
| `bin/deps` & `dependencies.tsv` | Vendor download manager and URL registry. |
| `Makefile` | BSD makefile orchestrating the build toolchain. |
| `.env` | Local configuration (Mapbox token, API URLs, embed origins). *Never commit.* |
| `e2e/` | Playwright browser test suite and results. |
| `AI_HELP_LOG.md` | Detailed diagnostic and verification log. |
