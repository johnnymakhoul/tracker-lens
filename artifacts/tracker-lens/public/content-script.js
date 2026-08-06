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
        inputs: document.querySelectorAll("input, textarea, select").length
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