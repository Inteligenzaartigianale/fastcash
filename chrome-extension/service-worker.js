// Domains da cui raccogliere i cookie ADE.
// Si usa { domain } e non { url } perché { url } applica filtri per percorso
// e può escludere FATSC se ha un path diverso da quello interrogato.
const AE_DOMAINS = [
  "ivaservizi.agenziaentrate.gov.it",
  "agenziaentrate.gov.it",
];

async function collectCookies() {
  const allCookies = [];
  const seen = new Set();

  for (const domain of AE_DOMAINS) {
    const list = await chrome.cookies.getAll({ domain });
    for (const cookie of list) {
      // Dedup per nome=valore (stessa logica della versione pubblicata):
      // se lo stesso cookie esiste per domini diversi con valori diversi,
      // entrambi vengono inclusi perché ADE potrebbe richiedere entrambi.
      const key = `${cookie.name}=${cookie.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        allCookies.push(cookie);
      }
    }
  }

  return allCookies;
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
    const diagnostic = data.details || `Cookie trovati: ${cookieNames.join(", ") || "nessuno"}`;
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
