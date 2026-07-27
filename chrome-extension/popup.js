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

connectBtn.addEventListener("click", async () => {
  const appUrl = (appUrlInput.value || "").trim().replace(/\/$/, "");
  if (!appUrl) {
    setStatus("error", "❌", "Inserisci prima l'URL dell'app nelle impostazioni qui sotto.");
    return;
  }

  setLoading(true);
  setStatus("info", "⏳", "Lettura cookie da ivaservizi...");

  try {
    // Raccoglie cookie da tutti i domini AE (anche con punto iniziale)
    const allCookies = [];
    const seen = new Set();

    for (const domain of AE_DOMAINS) {
      const list = await chrome.cookies.getAll({ domain });
      for (const c of list) {
        const key = `${c.name}=${c.value}`;
        if (!seen.has(key)) { seen.add(key); allCookies.push(c); }
      }
    }

    // Prova anche con url diretto
    try {
      const byUrl = await chrome.cookies.getAll({ url: "https://ivaservizi.agenziaentrate.gov.it" });
      for (const c of byUrl) {
        const key = `${c.name}=${c.value}`;
        if (!seen.has(key)) { seen.add(key); allCookies.push(c); }
      }
    } catch (_) {}

    if (allCookies.length === 0) {
      setStatus("warning", "⚠️",
        "Nessun cookie trovato. Apri <strong>ivaservizi.agenziaentrate.gov.it</strong>, " +
        "accedi con Fisconline e torna qui."
      );
      setLoading(false);
      return;
    }

    const hasFATSC     = allCookies.some(c => c.name === "FATSC");
    const hasJSESSION  = allCookies.some(c => c.name.includes("JSESSIONID"));

    if (!hasFATSC && !hasJSESSION) {
      setStatus("warning", "⚠️",
        `Cookie trovati (${allCookies.length}) ma mancano FATSC e JSESSIONID. ` +
        `Vai su ivaservizi → <strong>Documento Commerciale Online</strong> e riprova.`
      );
      setLoading(false);
      return;
    }

    const cookieHeader = allCookies.map(c => `${c.name}=${c.value}`).join("; ");
    if (cookieCountEl) cookieCountEl.textContent = `${allCookies.length} cookie trovati`;

    setStatus("info", "⏳", "Invio sessione all'app...");

    const response = await fetch(`${appUrl}/api/auth/cookie`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookieHeader }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus("error", "❌", `Errore dal server: ${data.error || response.status}`);
      setLoading(false);
      return;
    }

    setStatus("success", "✅", "Connesso! Torna all'app per emettere documenti.");
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
