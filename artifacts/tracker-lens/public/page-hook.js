(function () {
  let sequence = 0;

  function clip(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value.slice(0, 240);
    try {
      return JSON.stringify(value).slice(0, 240);
    } catch {
      return Object.prototype.toString.call(value).slice(0, 240);
    }
  }

  function report(name, value, requestId) {
    window.postMessage({
      source: "tracker-lens-hook",
      name,
      value: clip(value),
      requestId
    }, "*");
  }

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const requestId = `fetch-${Date.now()}-${sequence++}`;
    const url = typeof input === "string" ? input : input?.url;
    report("fetch URL", url, requestId);
    if (init?.body) report("fetch body", init.body, requestId);
    return originalFetch.apply(this, arguments);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__trackerLens = {
      method,
      url,
      requestId: `xhr-${Date.now()}-${sequence++}`
    };
    report("XHR URL", url, this.__trackerLens.requestId);
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (body) report("XHR body", body, this.__trackerLens?.requestId);
    return originalSend.apply(this, arguments);
  };

  const originalBeacon = navigator.sendBeacon?.bind(navigator);
  if (originalBeacon) {
    navigator.sendBeacon = function (url, data) {
      const requestId = `beacon-${Date.now()}-${sequence++}`;
      report("beacon URL", url, requestId);
      if (data) report("beacon body", data, requestId);
      return originalBeacon(url, data);
    };
  }

  if (navigator.geolocation) {
    const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = function (success, error, options) {
      report("Location requested", options ? `accuracy=${options.enableHighAccuracy ? "high" : "standard"}` : "standard");
      return originalGetCurrentPosition(
        function (position) {
          report(
            "Location returned",
            `lat ${position.coords.latitude.toFixed(4)}, lon ${position.coords.longitude.toFixed(4)}, ±${Math.round(position.coords.accuracy)}m`,
          );
          success?.apply(this, arguments);
        },
        error,
        options,
      );
    };
  }
})();