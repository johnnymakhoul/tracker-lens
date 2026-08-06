const MAX_REQUESTS_PER_TAB = 250;
const MAX_TABS = 40;
const MAX_SIGNAL_LENGTH = 240;
const tabs = new Map();
const pendingRequests = new Map();
let captureEnabled = true;

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.session.get({ captureEnabled: true }, (result) => {
  captureEnabled = result.captureEnabled !== false;
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
        snapshot: session || {
          tabId,
          capturedAt: Date.now(),
          page: null,
          pageSignals: [],
          requests: [],
          stats: { total: 0, thirdParty: 0, withCookies: 0, withContext: 0 }
        }
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
});