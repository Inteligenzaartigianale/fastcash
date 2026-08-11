const AE_COOKIE_URLS = [
  // ADE creates the FATSC cookie while crossing this hand-off endpoint.
  // Querying only /ser and /common misses cookies scoped to /dp/PI2FC.
  "https://ivaservizi.agenziaentrate.gov.it/dp/PI2FC",
  "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/",
  "https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/dati/fiscali",
  "https://ivaservizi.agenziaentrate.gov.it/common/testata/v1/info/me",
  "https://ivaservizi.agenziaentrate.gov.it/instr/InstradamentofcWeb/home",
  "https://ivaservizi.agenziaentrate.gov.it/portale/web/guest/home",
  "https://portale.agenziaentrate.gov.it/PortaleWeb/home?to=FATBTB",
  "https://www.agenziaentrate.gov.it/",
];

async function collectCookies() {
  const allCookies = [];
  // Query each real DCO URL. Chrome only returns cookies applicable to the
  // requested path; querying the domain/root alone can miss cookies scoped to
  // /ser or send an unrelated value.
  for (const url of AE_COOKIE_URLS) {
    try {
      const list = await chrome.cookies.getAll({ url });
      for (const cookie of list) allCookies.push(cookie);
    } catch (_) {}
  }

  // Keep the most specific cookie for a name/path combination. The backend
  // receives a Cookie header, so duplicate names would otherwise be
  // ambiguous and ADE could select the wrong session value.
  const byName = new Map();
  for (const cookie of allCookies) {
    const existing = byName.get(cookie.name);
    if (
      !existing ||
      (cookie.path || "/").length > (existing.path || "/").length ||
      // Prefer the DCO host over a generic ADE host when both expose the
      // same cookie name.
      (cookie.domain || "").includes("ivaservizi") &&
      !(existing.domain || "").includes("ivaservizi")
    ) {
      byName.set(cookie.name, cookie);
    }
  }
  return [...byName.values()];
}

async function connectToApp(appUrl) {
  if (!appUrl) throw new Error("URL app non disponibile");

  const origin = new URL(appUrl).origin;
  const cookies = await collectCookies();
  if (cookies.length === 0) {
    throw new Error("Nessun cookie ADE trovato");
  }
  const cookieNames = cookies.map((cookie) => cookie.name);
  const dcoCookieNames = ["FATSC", "JSESSIONID"].filter((name) => cookieNames.includes(name));

  const response = await fetch(`${origin}/api/auth/cookie`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      cookieNames,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    await chrome.storage.local.set({
      connectionState: "disconnected",
      connectionError: data.error || `Errore server ${response.status}`,
    });
    const diagnostic = data.details || `Cookie letti: ${cookieNames.join(", ") || "nessuno"}`;
    throw new Error(`${data.error || `Errore server ${response.status}`} — ${diagnostic}`);
  }

  await chrome.storage.local.set({
    connectionState: "connected",
    connectedAt: Date.now(),
    connectionError: "",
    appOrigin: origin,
  });

  // Aggiorna subito tutte le schede dell'app già aperte.
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url?.startsWith(origin)) {
      chrome.tabs.sendMessage(tab.id, {
        type: "SCONTRINI_CONNECTION_STATE",
        success: true,
        cookieCount: cookies.length,
      }).catch(() => {});
    }
  }

  return { success: true, cookieCount: cookies.length, dcoCookieNames };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCONTRINI_GET_STATE") {
    chrome.storage.local.get(
      ["connectionState", "connectedAt", "connectionError"],
      (state) => sendResponse({
        success: state.connectionState === "connected",
        connectedAt: state.connectedAt || null,
        error: state.connectionError || "",
      }),
    );
    return true;
  }

  if (message?.type !== "SCONTRINI_CONNECT") return false;

  connectToApp(message.appUrl)
    .then((result) => sendResponse(result))
    .catch((error) =>
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Connessione fallita",
      }),
    );

  return true;
});