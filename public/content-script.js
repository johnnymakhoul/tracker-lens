(function () {
  const MAX_TEXT = 240;

  function clip(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  }

  function sendPageSnapshot() {
    const description = document.querySelector('meta[name="description"]')?.content || "";
    chrome.runtime.sendMessage({
      type: "pageSnapshot",
      page: {
        url: location.href,
        host: location.hostname,
        title: document.title,
        description,
        forms: document.forms.length,
        inputs: document.querySelectorAll("input, textarea, select").length,
        device: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          languages: navigator.languages?.slice(0, 4) || [],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen: `${window.screen.width} × ${window.screen.height} · ${window.devicePixelRatio}x`,
          colorDepth: `${window.screen.colorDepth}-bit`,
          hardwareConcurrency: navigator.hardwareConcurrency || null,
          deviceMemory: navigator.deviceMemory || null,
          maxTouchPoints: navigator.maxTouchPoints || 0,
          doNotTrack: navigator.doNotTrack,
          cookiesEnabled: navigator.cookieEnabled
        }
      }
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "tracker-lens-hook") return;
    chrome.runtime.sendMessage({
      type: "pageSignal",
      signal: {
        requestId: event.data.requestId,
        name: event.data.name,
        value: clip(event.data.value)
      }
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sendPageSnapshot, { once: true });
  } else {
    sendPageSnapshot();
  }

  const observer = new MutationObserver(() => {
    window.clearTimeout(observer.timer);
    observer.timer = window.setTimeout(sendPageSnapshot, 500);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();