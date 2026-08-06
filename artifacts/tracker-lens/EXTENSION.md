# Tracker Lens

Tracker Lens is a Manifest V3 Chrome/Edge extension that makes the data leaving a page visible.

## Load it locally

1. Build the project with `pnpm --filter @workspace/tracker-lens run build`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `artifacts/tracker-lens/dist/public`.
5. Pin Tracker Lens and open it from the toolbar on a page with network activity. It stays in the browser popup; it does not open a separate tab.

## What it observes

The interface is intentionally tracking-only. It presents a profile of data that can identify or characterize a visitor:

- Public IP visibility (shown as an honest network-level inference because browser extensions cannot read the public IP directly).
- Browser and device agent details.
- Screen size, pixel ratio, color depth, CPU/memory capability, and touch support.
- Language, preferred languages, timezone, and Do Not Track state.
- Page URL, title, description, form count, and input count.
- Cookies and identifier names observed in outbound headers.
- Exact cookie values observed for each recognized endpoint, alongside a plain-language interpretation of what the cookie is commonly used for.
- Referrer and origin context.
- Location permission requests and returned coordinates when a page calls the Geolocation API.

Individual network requests are used internally to collect evidence, but they are not shown in the user-facing readout.

## Provider matching

Tracker Lens recognizes common hosts for Meta Pixel, Google Analytics, Google Ads, Segment, and X Ads. A match is a host-based classification, not a guarantee of every purpose or data use. Unknown destinations carrying identifying data are labeled **Unclassified tracker** instead of being silently assigned to a provider.

Data is held in the extension service worker's bounded session memory. Turning capture off clears captured data. The extension does not send observations to a remote server.

## Limits

The browser does not expose every JavaScript-level value or encrypted request body to extensions. Tracker Lens reports what the browser makes observable, and labels the source of each signal so the view does not imply more certainty than the platform provides.