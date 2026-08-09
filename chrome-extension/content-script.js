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
      window.postMessage(
        {
          source: "scontrini-extension",
          type: "SCONTRINI_CONNECT_RESULT",
          success: !runtimeError && result?.success === true,
          error: runtimeError?.message || result?.error,
          cookieCount: result?.cookieCount,
        },
        "*",
      );
    },
  );
});