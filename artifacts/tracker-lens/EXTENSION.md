# Tracker Lens

Tracker Lens is a Manifest V3 Chrome/Edge extension that makes the data leaving a page visible.

## Load it locally

1. Build the project with `pnpm --filter @workspace/tracker-lens run build`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `artifacts/tracker-lens/dist/public`.
5. Pin Tracker Lens and open it on a page with network activity.

## What it observes

- Every network destination and whether it is first- or third-party.
- URL query parameter names and values.
- Cookies and selected request headers, including referrer and origin.
- Form-encoded request bodies where the browser exposes them to `webRequest`.
- `fetch`, `XMLHttpRequest`, and `sendBeacon` URLs and payload previews.
- Page context such as title, description, form count, and input count.

Data is held in the extension service worker's bounded session memory. Turning capture off clears captured data. The extension does not send observations to a remote server.

## Limits

The browser does not expose every JavaScript-level value or encrypted request body to extensions. Tracker Lens reports what the browser makes observable, and labels the source of each signal so the view does not imply more certainty than the platform provides.