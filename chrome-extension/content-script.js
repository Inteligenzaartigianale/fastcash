function publishConnectionState(result) {
  window.postMessage(
    {
      source: "scontrini-extension",
      type: "SCONTRINI_CONNECTION_STATE",
      success: result?.success === true,
      error: result?.error,
      cookieCount: result?.cookieCount,
    },
    "*",
  );
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SCONTRINI_CONNECTION_STATE") {
    publishConnectionState(message);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.connectionState) return;
  const connected = changes.connectionState.newValue === "connected";
  publishConnectionState({
    success: connected,
    error: changes.connectionError?.newValue || "",
  });
});

// Recupera lo stato anche quando la pagina viene ricaricata dopo
// una connessione eseguita dal popup.
chrome.runtime.sendMessage({ type: "SCONTRINI_GET_STATE" }, (result) => {
  if (!chrome.runtime.lastError && result) {
    publishConnectionState(result);
  }
});

window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.data?.source !== "scontrini-app" ||
    event.data?.type !== "SCONTRINI_CONNECT"
  ) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "SCONTRINI_CONNECT",
      appUrl: window.location.origin,
    },
    (result) => {
      const runtimeError = chrome.runtime.lastError;
      const state = {
        success: !runtimeError && result?.success === true,
        error: runtimeError?.message || result?.error,
        cookieCount: result?.cookieCount,
      };
      window.postMessage({
        source: "scontrini-extension",
        type: "SCONTRINI_CONNECT_RESULT",
        ...state,
      }, "*");
      publishConnectionState(state);
    },
  );
});