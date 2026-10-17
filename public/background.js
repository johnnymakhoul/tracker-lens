const MAX_REQUESTS_PER_TAB = 250;
const MAX_TABS = 40;
const MAX_SIGNAL_LENGTH = 240;
const MAX_HISTORY_ENTRIES = 2500;
const HISTORY_STORAGE_KEY = "trackingValueHistory";
const tabs = new Map();
const pendingRequests = new Map();
let captureEnabled = true;
let trackingValueHistory = [];
let historyWriteTimer = null;

chrome.storage.session.get({ captureEnabled: true }, (result) => {
  captureEnabled = result.captureEnabled !== false;
});

chrome.storage.local.get({ [HISTORY_STORAGE_KEY]: [] }, (result) => {
  trackingValueHistory = Array.isArray(result[HISTORY_STORAGE_KEY])
    ? result[HISTORY_STORAGE_KEY].slice(0, MAX_HISTORY_ENTRIES)
    : [];
});

function bounded(value, max = MAX_SIGNAL_LENGTH) {
  if (value === undefined || value === null) return "";
  return String(value).slice(0, max);
}

function parseUrlSignals(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const query = [];
    url.searchParams.forEach((value, name) => {
      query.push({
        name: bounded(name, 80),
        value: bounded(value)
      });
    });
    return {
      host: url.hostname,
      path: url.pathname,
      query,
      protocol: url.protocol
    };
  } catch {
    return { host: rawUrl, path: "", query: [], protocol: "" };
  }
}

function classifyHost(host, pageHost = "") {
  if (!host) return "unknown";
  if (host === pageHost || host.endsWith(`.${pageHost}`)) return "first-party";
  return "third-party";
}

function headerValue(headers, name) {
  const header = (headers || []).find(
    (item) => item.name && item.name.toLowerCase() === name
  );
  return header ? bounded(header.value) : "";
}

function headerSignals(headers) {
  const cookieHeader = headerValue(headers, "cookie");
  const cookies = cookieHeader
    ? cookieHeader.split(";").map((part) => {
        const separator = part.indexOf("=");
        const name = separator === -1 ? part.trim() : part.slice(0, separator).trim();
        const value = separator === -1 ? "" : part.slice(separator + 1).trim();
        return { name: bounded(name, 100), value: bounded(value) };
      }).filter((item) => item.name)
    : [];

  return {
    cookies,
    referer: headerValue(headers, "referer"),
    origin: headerValue(headers, "origin"),
    userAgent: headerValue(headers, "user-agent"),
    acceptLanguage: headerValue(headers, "accept-language"),
    secFetchSite: headerValue(headers, "sec-fetch-site"),
    secFetchDest: headerValue(headers, "sec-fetch-dest"),
    dnt: headerValue(headers, "dnt")
  };
}

function ensureTab(tabId) {
  if (!tabs.has(tabId)) {
    tabs.set(tabId, {
      tabId,
      capturedAt: Date.now(),
      page: null,
      pageSignals: [],
      requests: [],
      stats: { total: 0, thirdParty: 0, withCookies: 0, withContext: 0 }
    });
  }
  return tabs.get(tabId);
}

function trimTabs() {
  while (tabs.size > MAX_TABS) {
    const oldest = [...tabs.values()].sort((a, b) => a.capturedAt - b.capturedAt)[0];
    tabs.delete(oldest.tabId);
  }
}

function addRequest(tabId, request) {
  if (!captureEnabled || tabId < 0) return;
  const session = ensureTab(tabId);
  const existingIndex = session.requests.findIndex((item) => item.id === request.id);
  if (existingIndex >= 0) {
    session.requests[existingIndex] = { ...session.requests[existingIndex], ...request };
  } else {
    session.requests.unshift(request);
    session.stats.total += 1;
    if (request.party === "third-party") session.stats.thirdParty += 1;
    if (request.signals?.cookies?.length) session.stats.withCookies += 1;
    if (request.signals?.context?.length) session.stats.withContext += 1;
  }
  session.capturedAt = Date.now();
  session.requests = session.requests.slice(0, MAX_REQUESTS_PER_TAB);
  trimTabs();
}

function pageHost(pageUrl) {
  try {
    return new URL(pageUrl || "").hostname;
  } catch {
    return "";
  }
}

function normalizedTrackingValue(value) {
  if (value === undefined || value === null) return "";
  let normalized = String(value).trim();
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the raw value when it is not URI encoded.
  }
  return normalized.slice(0, MAX_SIGNAL_LENGTH);
}

const LOW_ENTROPY_BLOCKLIST = new Set([
  "true", "false", "undefined", "null", "none", "0", "1", "-1", "200", "404", "500",
  "utf-8", "utf8", "en-us", "en", "us", "desktop", "mobile", "tablet", "pageview",
  "click", "submit", "load", "scroll", "event", "get", "post", "head", "options",
  "javascript", "json", "html", "text", "xml", "application/json", "text/html",
  "same-origin", "cross-site", "cors", "navigate", "script", "image", "xmlhttprequest", "fetch"
]);

const CLICK_ID_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "ttclid", "twclid", "tw_clid",
  "yclid", "li_fat_id", "wbraid", "gbraid", "utm_id", "_hsenc"
]);

function calculateShannonEntropy(str) {
  if (!str) return 0;
  const len = str.length;
  const counts = {};
  for (let i = 0; i < len; i++) {
    const char = str[i];
    counts[char] = (counts[char] || 0) + 1;
  }
  let entropy = 0;
  for (const char in counts) {
    const p = counts[char] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function isHighEntropyIdentifier(value, paramName = "") {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (trimmed.length < 6) return false;
  if (LOW_ENTROPY_BLOCKLIST.has(trimmed.toLowerCase())) return false;

  // Known tracking identifier formats (UUID, 16+ char hex, GA cookies, Facebook IDs, Click IDs)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  const isHexId = /^[0-9a-f]{16,}$/i.test(trimmed);
  const isGACookie = /^GA\d\.\d\.\d+/i.test(trimmed);
  const isFbpCookie = /^fb\.\d\.\d+/i.test(trimmed);
  const isClickId = CLICK_ID_PARAMS.has((paramName || "").toLowerCase()) || /^(EAIaIQob|gcl|fb\.|msclkid|ttclid)/i.test(trimmed);

  if (isUUID || isHexId || isGACookie || isFbpCookie || isClickId) {
    return true;
  }

  // Shannon Entropy threshold (>= 2.6 for length >= 8)
  const entropy = calculateShannonEntropy(trimmed);
  return trimmed.length >= 8 && entropy >= 2.6;
}

function scheduleHistoryPersist() {
  if (historyWriteTimer) return;
  historyWriteTimer = setTimeout(() => {
    historyWriteTimer = null;
    chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: trackingValueHistory });
  }, 250);
}

function trackingValuesFromRequest(request) {
  const signals = request.signals || {};
  const mapItem = (item, defaultKind) => {
    const name = item.name || "";
    const isClickId = CLICK_ID_PARAMS.has(name.toLowerCase());
    return {
      ...item,
      kind: isClickId ? "Link Decoration" : defaultKind,
      isClickId
    };
  };
  return [
    ...(signals.cookies || []).map((item) => mapItem(item, "cookie")),
    ...(signals.query || []).map((item) => mapItem(item, "URL parameter")),
    ...(signals.body || []).map((item) => mapItem(item, "request body")),
    ...(signals.context || []).map((item) => mapItem(item, "page context"))
  ];
}

function rememberRequestValues(tabId, request) {
  if (!captureEnabled || tabId < 0) return;
  const session = tabs.get(tabId);
  const siteHost = pageHost(session?.page?.url);
  const destinationHost = request.host || pageHost(request.url);
  if (!siteHost || !destinationHost) return;

  for (const item of trackingValuesFromRequest(request)) {
    const value = normalizedTrackingValue(item.value);
    const name = bounded(item.name || "value", 100);
    if (!value || !isHighEntropyIdentifier(value, name)) continue;
    const kind = item.kind;
    const isClickId = Boolean(item.isClickId);
    const key = [value, name, kind, siteHost, destinationHost].join("\u001f");
    const existing = trackingValueHistory.find((entry) => entry.key === key);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.seenCount = Number(existing.seenCount || 0) + 1;
    } else {
      trackingValueHistory.unshift({
        key,
        value,
        name,
        kind,
        isClickId,
        siteHost,
        destinationHost,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        seenCount: 1
      });
    }
  }
  trackingValueHistory = trackingValueHistory.slice(0, MAX_HISTORY_ENTRIES);
  scheduleHistoryPersist();
}

function currentRequestValues(request) {
  return trackingValuesFromRequest(request)
    .map((item) => {
      const name = bounded(item.name || "value", 100);
      const val = normalizedTrackingValue(item.value);
      return {
        name,
        kind: item.kind,
        isClickId: Boolean(item.isClickId),
        value: val
      };
    })
    .filter((item) => item.value && isHighEntropyIdentifier(item.value, item.name));
}

function crossSiteMatches(session) {
  const currentSite = pageHost(session?.page?.url);
  if (!currentSite) return [];
  const matches = [];
  for (const request of session?.requests || []) {
    for (const current of currentRequestValues(request)) {
      const previous = trackingValueHistory.filter(
        (entry) => entry.value === current.value && entry.siteHost && entry.siteHost !== currentSite
      );
      if (!previous.length) continue;
      const previousSites = [...new Set(previous.map((entry) => entry.siteHost))].slice(0, 8);
      const previousDestinations = [...new Set(previous.map((entry) => entry.destinationHost))].slice(0, 8);
      matches.push({
        requestId: request.id,
        endpointHost: request.host,
        name: current.name,
        kind: current.kind,
        value: current.value,
        isClickId: Boolean(current.isClickId || previous.some((p) => p.isClickId)),
        previousSites,
        previousDestinations,
        seenCount: previous.reduce((total, entry) => total + Number(entry.seenCount || 1), 0)
      });
    }
  }
  return matches;
}

function historyStats() {
  return {
    values: new Set(trackingValueHistory.map((entry) => entry.value)).size,
    sites: new Set(trackingValueHistory.map((entry) => entry.siteHost)).size
  };
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!captureEnabled || details.tabId < 0) return;
    const parsed = parseUrlSignals(details.url);
    const session = ensureTab(details.tabId);
    const pageUrl = session.page?.url || details.initiator || "";
    const request = {
      id: details.requestId,
      url: bounded(details.url, 1600),
      method: details.method,
      type: details.type,
      host: parsed.host,
      path: parsed.path,
      protocol: parsed.protocol,
      party: classifyHost(parsed.host, pageHost(pageUrl)),
      timestamp: Date.now(),
      size: details.requestBody?.raw?.reduce((total, item) => total + (item.bytes?.byteLength || 0), 0) || 0,
      signals: {
        query: parsed.query,
        cookies: [],
        headers: {},
        context: [],
        body: []
      }
    };
    if (details.requestBody?.formData) {
      request.signals.body = Object.entries(details.requestBody.formData).flatMap(([name, values]) =>
        values.map((value) => ({ name: bounded(name, 100), value: bounded(value) }))
      );
    }
    pendingRequests.set(details.requestId, request);
    addRequest(details.tabId, request);
    rememberRequestValues(details.tabId, request);
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!captureEnabled || details.tabId < 0) return;
    const existing = pendingRequests.get(details.requestId);
    const session = ensureTab(details.tabId);
    const pageUrl = session.page?.url || details.initiator || "";
    const parsed = parseUrlSignals(details.url);
    const signals = headerSignals(details.requestHeaders);
    const request = existing || {
      id: details.requestId,
      url: bounded(details.url, 1600),
      method: details.method,
      type: details.type,
      host: parsed.host,
      path: parsed.path,
      protocol: parsed.protocol,
      party: classifyHost(parsed.host, pageHost(pageUrl)),
      timestamp: Date.now(),
      signals: { query: parsed.query, body: [], context: [] }
    };
    request.signals = {
      ...(request.signals || {}),
      cookies: signals.cookies,
      headers: {
        referer: signals.referer,
        origin: signals.origin,
        userAgent: signals.userAgent,
        acceptLanguage: signals.acceptLanguage,
        secFetchSite: signals.secFetchSite,
        secFetchDest: signals.secFetchDest,
        dnt: signals.dnt
      }
    };
    addRequest(details.tabId, request);
    rememberRequestValues(details.tabId, request);
    pendingRequests.delete(details.requestId);
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"]
);

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "pageSnapshot" && sender.tab?.id !== undefined) {
    const session = ensureTab(sender.tab.id);
    session.page = {
      url: bounded(message.page?.url, 1600),
      title: bounded(message.page?.title),
      host: bounded(message.page?.host, 200),
      description: bounded(message.page?.description),
      forms: Number(message.page?.forms || 0),
      inputs: Number(message.page?.inputs || 0),
      device: message.page?.device || {},
      capturedAt: Date.now()
    };
    session.capturedAt = Date.now();
    trimTabs();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "pageSignal" && sender.tab?.id !== undefined) {
    const requestId = message.signal?.requestId;
    const session = ensureTab(sender.tab.id);
    session.pageSignals = [
      ...(session.pageSignals || []),
      {
        name: bounded(message.signal.name, 100),
        value: bounded(message.signal.value),
        source: bounded(message.signal.source || "page", 40),
        capturedAt: Date.now()
      }
    ].slice(-100);
    const request = requestId && session.requests.find((item) => item.id === requestId);
    if (request) {
      request.signals.context = [
        ...(request.signals.context || []),
        {
          name: bounded(message.signal.name, 100),
          value: bounded(message.signal.value)
        }
      ].slice(0, 40);
      session.stats.withContext += 1;
      session.capturedAt = Date.now();
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "getSnapshot") {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (activeTabs) => {
      const tabId = message.tabId ?? activeTabs[0]?.id;
      const session = tabId === undefined ? null : tabs.get(tabId);
      sendResponse({
        enabled: captureEnabled,
        tabId,
        historyStats: historyStats(),
        snapshot: session || {
          tabId,
          capturedAt: Date.now(),
          page: null,
          pageSignals: [],
          requests: [],
          stats: { total: 0, thirdParty: 0, withCookies: 0, withContext: 0 }
        },
        valueMatches: session ? crossSiteMatches(session) : []
      });
    });
    return true;
  }

  if (message?.type === "setCapture") {
    captureEnabled = Boolean(message.enabled);
    chrome.storage.session.set({ captureEnabled });
    if (!captureEnabled) {
      tabs.clear();
      pendingRequests.clear();
    }
    sendResponse({ enabled: captureEnabled });
    return true;
  }

  if (message?.type === "clearSnapshot") {
    const tabId = message.tabId;
    if (tabId !== undefined) tabs.delete(tabId);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "clearHistory") {
    trackingValueHistory = [];
    chrome.storage.local.remove(HISTORY_STORAGE_KEY);
    sendResponse({ ok: true, historyStats: historyStats() });
    return true;
  }
});