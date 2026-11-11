# Energy Access Explorer (EAE) Tool - Developer & Run Guide

This guide explains how to clone, build, run, and test this forked version of the **Energy Access Explorer (EAE) Tool** (`feat/embed-mode`).

---

## 1. Prerequisites

Before getting started, make sure you have the following installed on your machine:

- **Git**: [git-scm.com](https://git-scm.com/)
- **Node.js**: (Version 18+ or 20+ recommended)
- **bmake** / **make** and build utilities:
  - On **Linux / Ubuntu / WSL**:
    ```bash
    sudo apt-get update
    sudo apt-get install -y bmake build-essential
    ```
  - *Windows users*: Use **WSL** (Windows Subsystem for Linux) to run the `bmake` build commands.

---

## 2. Clone the Repository

Clone the fork and checkout the `feat/embed-mode` branch:

```bash
# Clone the repository
git clone https://github.com/didier-bazayesu/tool.git

# Enter the directory
cd tool

# Switch to the feature branch
git checkout feat/embed-mode
```

---

## 3. Install Dependencies & Build

### Step 3.1: Install Node Dependencies
```bash
npm install
```

### Step 3.2: Compile TypeScript & Templates
To compile the TypeScript source files and build the analysis application:

- **On Linux / macOS / WSL**:
  ```bash
  bmake ts build-a
  ```

- **If building from Windows (via WSL)**:
  ```bash
  wsl -d Ubuntu -- bash -c "cd '/path/to/tool' && bmake ts build-a"
  ```

This will compile the templates and scripts into `./dist/a/index.html`.

---

## 4. Running the Tool Locally

You can serve the compiled application using any static HTTP server. For embed testing, serve on port `3000`:

```bash
# Using http-server
npx http-server serve -p 3000 -c-1
```

> **Note on directory structure:** The `serve/tool` directory links or junctions to `dist/`, so `http://localhost:3000/tool/a/` serves `./dist/a/index.html`.

### Verify in Browser:
- **Standalone App**: Open `http://localhost:3000/tool/a/?id=61cc6dc7-2159-405f-a0df-6faa8c583923`
- **Embed Mode**: Open `http://localhost:3000/tool/a/?id=61cc6dc7-2159-405f-a0df-6faa8c583923&embed=1`
  - In embed mode (`?embed=1`), navigation bars and cookie notices are hidden, and side panels start collapsed.

---

## 5. Running Automated Tests

Run the test suite using Node's test runner:

```bash
node --experimental-strip-types --test test/*.test.ts
```

All 56 unit tests should pass.

---

## 6. How Embed Mode & Integration Work

This fork adds full support for embedding EAE inside third-party wrappers (such as `oseas26-eae-wrapper-webpage`):

1. **Allowed Origins**:
   - Configured via `settings.embed_origins` in `src/config.js` or dynamically allowed for local development (`localhost:8000`, `localhost:3000`, and GitHub Pages).
2. **`eae:ready` Signal**:
   - When the tool finishes initializing in an `<iframe>`, it emits:
     ```javascript
     window.parent.postMessage({ type: "eae:ready" }, parentOrigin);
     ```
3. **`eae:set` Remote Control**:
   - The wrapper can control the embedded map dynamically by sending:
     ```javascript
     iframe.contentWindow.postMessage({
       type: "eae:set",
       center: { lng: 85.3, lat: 23.4 },  // Pan to coordinates
       zoom: 9,                           // Zoom level
       inputs: ["Community Health Center..."] // Turn on/off active datasets
     }, "*");
     ```

---

## 7. Troubleshooting

- **CORS or Iframe Blocked**: Verify that your parent wrapper's origin matches one of the allowed origins in `allowed_origins()`.
- **Changes Not Appearing**: Remember to run `bmake ts build-a` and do a hard refresh (`Ctrl + F5` or `Ctrl + Shift + R`) to clear browser cache.
- **Port Conflicts**: Ensure port `3000` is free, or pass `-p <port>` and update the wrapper's `EAE_APP` URL accordingly.
