# TorBox Browser Extension

A browser extension that integrates [TorBox](https://torbox.app) — a cloud-based download service — directly into your browser. Manage torrents, Usenet downloads, and web downloads without leaving your current tab.

![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-brightgreen)
![Firefox](https://img.shields.io/badge/Firefox-Manifest%20V2-orange)
![React](https://img.shields.io/badge/React-18-blue)
![Vite](https://img.shields.io/badge/Vite-5-purple)

## Features

- **Download Management** — View and control all your torrents, Usenet downloads, and web downloads from the popup
- **One-Click Magnet Links** — Automatically injects "+ TorBox" buttons next to magnet links on any webpage
- **Right-Click to Add** — Context menu option to send magnet links directly to TorBox
- **Live Status Tracking** — Real-time download/upload speeds, progress bars, ETA, seed/peer counts, and ratio info
- **Slot Monitoring** — Displays active vs. max concurrent download slots based on your plan
- **Queue Management** — Start or delete queued downloads
- **Badge Counter** — Extension icon badge shows the number of active downloads, updated every 30 seconds
- **Account Overview** — View your plan, total downloaded bytes, and download counts
- **Cross-Browser** — Supports both Chrome (Manifest V3) and Firefox (Manifest V2)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- A [TorBox](https://torbox.app) account and API key (found at [torbox.app/settings](https://torbox.app/settings))

### Installation

```bash
git clone https://github.com/your-username/TorboxExtension.git
cd TorboxExtension
npm install
```

### Build

```bash
# Chrome
npm run build:chrome

# Firefox
npm run build:firefox

# Both
npm run build:all
```

### Development

```bash
# Watch mode for Chrome
npm run dev:chrome

# Watch mode for Firefox
npm run dev:firefox
```

### Load the Extension

**Chrome:**
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/chrome` folder

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file inside the `dist/firefox` folder

### Packaging

```bash
# Chrome (.zip for Chrome Web Store)
npm run package:chrome

# Firefox (.xpi)
npm run package:firefox
```

## Usage

1. Click the TorBox extension icon in your browser toolbar
2. Enter your TorBox API key and click **Save**
3. You're in — browse your active downloads, add magnet links, and manage your queue

On any webpage with magnet links, you'll see green **+ TorBox** buttons injected next to each link for one-click adding. If your download slots are full, the button turns red with a "Slots full" indicator.

## Project Structure

```
src/
├── background/     # Service worker — badge updates, context menu, API calls
├── content/        # Content script — detects magnet links, injects buttons
├── popup/          # React popup UI — login, download list, controls
├── options/        # Options page — API key management
└── utils/          # Shared utilities — API wrapper, storage helpers
manifests/
├── chrome.json     # Manifest V3
└── firefox.json    # Manifest V2
public/icons/       # Extension icons
scripts/build.js    # Post-build processing
```

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Persist your API key locally |
| `activeTab` | Access the current tab for context menu actions |
| `tabs` | Query tab info for content script communication |
| `contextMenus` | "Add to TorBox" right-click menu |
| `notifications` | Desktop notifications for success/error feedback |
| `alarms` | Schedule periodic badge count updates |
| `api.torbox.app` | Network access to the TorBox API |

## Tech Stack

- **React 18** — Popup and options page UI
- **Vite 5** — Build tooling with HMR in dev mode
- **webextension-polyfill** — Cross-browser API compatibility
- **web-ext** — Firefox extension tooling

## License

This project is provided as-is. See [LICENSE](LICENSE) for details.
