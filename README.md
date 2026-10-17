# Tracker Lens

**See the actual data websites send to third-party trackers.**

Tracker Lens is a Chrome and Edge browser extension that shows you what information is leaving your browser while you browse the web. Instead of showing a complicated list of raw network requests, it translates hidden cookies, tracking IDs, and device signals into plain English—and alerts you when a tracker recognizes you across different websites.

---

## What It Does

- **Spots Known Trackers**: Identifies major ad and analytics networks (like **Meta Pixel**, **Google Analytics**, **Google Ads**, **Segment**, and **X Ads**) as well as unknown endpoints collecting your data.
- **Catches Cross-Site Tracking**: Remembers unique tracking IDs and ad click parameters (`fbclid`, `gclid`, etc.) so you can see when the exact same identifier is used to follow you from one website to another.
- **Translates Cookies into Plain English**: Shows the exact cookies sent to each tracker and explains what they are actually used for.
- **Reveals Device & Page Signals**: Shows what a page can see about your device (screen size, browser info, language, timezone, and location requests).
- **100% Local & Private**: Everything happens inside your browser. No browsing history or captured data is ever sent to a server.
- **Works as a Web Preview**: Can also be run as a standard web app with sample data for quick testing and design previews.

---

## Architecture

```
tracker-lens/
├── public/
│   ├── manifest.json       # Chrome/Edge Manifest V3 configuration
│   ├── background.js       # Service worker: webRequest listeners, entropy analysis & cross-site matching
│   ├── content-script.js   # ISOLATED world script: DOM/device snapshot & message bridge
│   └── page-hook.js        # MAIN world script: hooks fetch, XHR, sendBeacon, and geolocation
├── src/
│   ├── App.tsx             # Popup/dashboard UI, provider classification & signal aggregation
│   ├── main.tsx            # React entry point
│   ├── index.css           # Tailwind CSS v4 & custom theme styling
│   └── components/ui/      # Reusable Radix UI / shadcn components
├── EXTENSION.md            # Quick extension reference notes
├── package.json
└── vite.config.ts          # Vite build & dev server configuration
```

### How Data Flows

1. **Main-World Interception (`public/page-hook.js`)**: Injected at `document_start` in the page's `MAIN` execution world. Wraps `window.fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, and `navigator.geolocation.getCurrentPosition`, posting observed payloads to the window.
2. **Content Script Bridge (`public/content-script.js`)**: Collects document metadata (URL, title, description, form/input counts) and device capability signals, and forwards `page-hook.js` messages to the extension service worker.
3. **Background Service Worker (`public/background.js`)**:
   - Listens to `chrome.webRequest.onBeforeRequest` and `chrome.webRequest.onBeforeSendHeaders` across `<all_urls>`.
   - Extracts query parameters, request bodies, `Cookie` headers, and context headers (`Referer`, `Origin`, `User-Agent`, `Accept-Language`, `Sec-Fetch-*`, `DNT`).
   - Evaluates parameter and cookie values using format heuristics and **Shannon entropy** (`isHighEntropyIdentifier`) to persist high-entropy identifiers in `chrome.storage.local` (`trackingValueHistory`, capped at 2,500 entries) and detect cross-site matches.
4. **React Popup UI (`src/App.tsx`)**: Polls the background worker (`getSnapshot`) every second when running as an extension, grouping raw requests into provider endpoints, highlighting cross-site matches, and allowing one-click history clearing (`clearHistory`).

---

## Getting Started

### Prerequisites

- **Node.js** (v18+ recommended)
- **pnpm**

### Installation

```bash
pnpm install
```

### Running the Development Server

```bash
pnpm run dev
```

Open `http://localhost:5173` in your browser. Outside the Chrome Extension environment, the app runs in preview mode using sample tracker endpoints.

### Building the Extension

Build the extension bundle into `dist/public`:

```bash
pnpm run build
```

To run TypeScript type checking:

```bash
pnpm run typecheck
```

---

## Loading the Extension in Chrome / Edge

1. Build the project with `pnpm run build` so that `dist/public` is populated (including `manifest.json`, `background.js`, `content-script.js`, and `page-hook.js`).
2. Open your browser and navigate to `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `dist/public` directory.
5. Pin **Tracker Lens** to your browser toolbar and open the popup while browsing any website with network activity.

---

## Limitations & Honesty by Design

- **Provider Matching $\neq$ Proof of Intent**: Provider classification is host-based (`connect.facebook.net`, `analytics.google.com`, `cdn.segment.com`, `doubleclick.net`, `ads-twitter.com`, etc.). It indicates where data is sent, not every downstream use.
- **Platform Visibility Boundaries**: Browser extensions cannot directly read your public IP address (shown as a network-level inference) or decrypt opaque/binary request payloads not exposed by the browser's `webRequest` or DOM APIs.
- **Bounded Memory**: Session state is capped at 250 requests per tab across up to 40 tabs (`MAX_REQUESTS_PER_TAB = 250`, `MAX_TABS = 40`), and individual signal strings are clipped to 240 characters (`MAX_SIGNAL_LENGTH = 240`).
