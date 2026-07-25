const AE_DOMAIN = "ivaservizi.agenziaentrate.gov.it";
const DEFAULT_APP_URL = "";

const connectBtn = document.getElementById("connectBtn");
const statusBox = document.getElementById("status");
const appUrlInput = document.getElementById("appUrl");
const saveBtn = document.getElementById("saveBtn");
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
    // Get ALL cookies for the AE domain
    const cookies = await chrome.cookies.getAll({ domain: AE_DOMAIN });

    if (!cookies || cookies.length === 0) {
      setStatus("warning", "⚠️", "Nessun cookie trovato. Apri ivaservizi.agenziaentrate.gov.it, accedi, vai su Documento Commerciale Online e riprova.");
      setLoading(false);
      return;
    }

    // Check for critical session cookies
    const hasFATSC = cookies.some(c => c.name === "FATSC");
    const hasJSESSIONID = cookies.some(c => c.name.startsWith("JSESSIONID") && c.domain.includes("ivaservizi"));

    if (!hasFATSC || !hasJSESSIONID) {
      setStatus("warning", "⚠️",
        `Sessione incompleta (${hasFATSC ? "✓" : "✗"} FATSC, ${hasJSESSIONID ? "✓" : "✗"} JSESSIONID). ` +
        `Assicurati di aver aperto la sezione <strong>Documento Commerciale Online</strong> su ivaservizi.`
      );
      setLoading(false);
      return;
    }

    // Build cookie header string
    const cookieHeader = cookies
      .filter(c => c.domain.includes("ivaservizi") || c.domain.includes("agenziaentrate"))
      .map(c => `${c.name}=${c.value}`)
      .join("; ");

    cookieCountEl.textContent = `${cookies.length} cookie trovati`;

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

    setStatus("success", "✅", "Connesso! Puoi tornare all'app e iniziare a emettere documenti.");
    setLoading(false);

  } catch (err) {
    setStatus("error", "❌", `Errore di rete: ${err.message}. Controlla che l'app sia in esecuzione e l'URL sia corretto.`);
    setLoading(false);
  }
});

// CSS for spinner
const style = document.createElement("style");
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
