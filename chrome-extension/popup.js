const AE_DOMAINS = [
  "ivaservizi.agenziaentrate.gov.it",
  "agenziaentrate.gov.it",
];
const DEFAULT_APP_URL = "";

const connectBtn = document.getElementById("connectBtn");
const statusBox  = document.getElementById("status");
const appUrlInput = document.getElementById("appUrl");
const saveBtn    = document.getElementById("saveBtn");
const cookieCountEl = document.getElementById("cookieCount");

function setStatus(type, icon, text) {
  statusBox.className = `status-box ${type}`;
  statusBox.innerHTML = `<span class="status-icon">${icon}</span><span class="status-text">${text}</span>`;
}

function setLoading(loading) {
  connectBtn.disabled = loading;
  connectBtn.innerHTML = loading
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Connessione...`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Connetti all'app`;
}

// Load saved URL
chrome.storage.local.get(["appUrl"], (result) => {
  appUrlInput.value = result.appUrl || DEFAULT_APP_URL;
});

saveBtn.addEventListener("click", () => {
  const url = appUrlInput.value.trim().replace(/\/$/, "");
  chrome.storage.local.set({ appUrl: url }, () => {
    saveBtn.textContent = "✓ Salvato";
    setTimeout(() => { saveBtn.textContent = "Salva URL"; }, 1500);
  });
});

async function requestConnection(appUrl) {
  return await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "SCONTRINI_CONNECT", appUrl },
      (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result || {});
        }
      },
    );
  });
}

connectBtn.addEventListener("click", async () => {
  const appUrl = (appUrlInput.value || "").trim().replace(/\/$/, "");
  if (!appUrl) {
    setStatus("error", "❌", "Inserisci prima l'URL dell'app nelle impostazioni qui sotto.");
    return;
  }

  setLoading(true);
  setStatus("info", "⏳", "Lettura cookie da ivaservizi...");

  try {
    setStatus("info", "⏳", "Invio sessione all'app...");
    const result = await requestConnection(appUrl);
    if (!result.success) {
      setStatus("error", "❌", result.error || "Connessione fallita");
      setLoading(false);
      return;
    }

    if (cookieCountEl) {
      const dco = result.dcoCookieNames || [];
      cookieCountEl.textContent =
        `${result.cookieCount || 0} cookie trovati` +
        ` · DCO: ${dco.length ? dco.join(", ") : "nessuno"}`;
    }
    setStatus("success", "✅", "Connesso! Torna all'app per emettere documenti.");
    // Notifica anche direttamente la scheda attiva, nel caso il broadcast
    // del service worker sia arrivato prima del caricamento del content script.
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: "SCONTRINI_CONNECTION_STATE",
          success: true,
          cookieCount: result.cookieCount,
        }).catch(() => {});
      }
    } catch (_) {}
    setLoading(false);

  } catch (err) {
    setStatus("error", "❌", `Errore: ${err.message}`);
    setLoading(false);
  }
});

// CSS spinner
const style = document.createElement("style");
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
