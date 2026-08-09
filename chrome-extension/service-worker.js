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
      const key = `${cookie.name}=${cookie.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        allCookies.push(cookie);
      }
    }
  }

  try {
    const list = await chrome.cookies.getAll({
      url: "https://ivaservizi.agenziaentrate.gov.it",
    });
    for (const cookie of list) {
      const key = `${cookie.name}=${cookie.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        allCookies.push(cookie);
      }
    }
  } catch (_) {}

  return allCookies;
}

async function connectToApp(appUrl) {
  if (!appUrl) throw new Error("URL app non disponibile");

  const origin = new URL(appUrl).origin;
  const cookies = await collectCookies();
  if (cookies.length === 0) {
    throw new Error("Nessun cookie ADE trovato");
  }

  const hasFATSC = cookies.some((cookie) => cookie.name === "FATSC");
  const hasJSESSION = cookies.some((cookie) =>
    cookie.name.includes("JSESSIONID"),
  );
  if (!hasFATSC && !hasJSESSION) {
    throw new Error(
      "Cookie trovati, ma sessione ADE non valida. Apri Documento Commerciale Online e accedi.",
    );
  }

  const response = await fetch(`${origin}/api/auth/cookie`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Errore server ${response.status}`);
  }

  return { success: true, cookieCount: cookies.length };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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