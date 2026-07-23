import { Router, type IRouter } from "express";
import { getSession, isSessionValid, setSession } from "../lib/session.js";
import { loginWithSiampe } from "../lib/siampe-login.js";
import {
  InviaDocumentoBody,
  InviaDocumentoResponse,
  GetMeResponse,
  GetStampaParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const AE_BASE = "https://ivaservizi.agenziaentrate.gov.it";
const AE_API = `${AE_BASE}/ser/api/documenti/v1`;
const AE_COMMON = `${AE_BASE}/common/testata/v1`;

const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  Referer: `${AE_BASE}/ser/documenticommercialionline/?v=1729523483132`,
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

/** Ensure we have a valid session, auto-refresh if expired */
async function requireSession(): Promise<string> {
  if (!isSessionValid()) {
    const session = getSession();
    if (session?.credentials) {
      logger.info("Session expired, auto-refreshing via Puppeteer");
      const result = await loginWithSiampe(session.credentials);
      setSession({
        ...session,           // preserve address/business data from previous /me call
        cookies: result.cookieHeader,
        ragioneSociale: result.ragioneSociale || session.ragioneSociale,
        partitaIva: result.partitaIva || session.partitaIva,
        codiceFiscale: result.codiceFiscale || session.codiceFiscale,
        createdAt: new Date(),
      });
      return result.cookieHeader;
    }
    throw Object.assign(new Error("Not authenticated"), { status: 401 });
  }
  return getSession()!.cookies;
}

async function aeGet(
  url: string,
  cookies: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(url, {
    method: "GET",
    headers: { ...BROWSER_HEADERS, Cookie: cookies },
  });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, data };
}

async function aePost(
  url: string,
  cookies: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: unknown; headers: Headers }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      Cookie: cookies,
      "Content-Type": "application/json;charset=UTF-8",
      Origin: "https://ivaservizi.agenziaentrate.gov.it",
    },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

// GET /ae/me
router.get("/ae/me", async (req, res): Promise<void> => {
  let cookies: string;
  try {
    cookies = await requireSession();
  } catch {
    res.status(401).json({ error: "Non autenticato. Effettua il login." });
    return;
  }

  const ts = Date.now();
  const result = await aeGet(`${AE_COMMON}/info/me?v=${ts}`, cookies);

  if (!result.ok) {
    req.log.warn({ status: result.status, data: result.data, cookieLen: cookies.length }, "AE /me returned error");
    res.status(result.status).json({ error: "Errore AE", details: JSON.stringify(result.data) });
    return;
  }

  // Map AE response to our schema
  const aeData = result.data as Record<string, unknown>;
  const session = getSession();

  // Persist address data to session so buildDcw10Payload can use it
  if (session && aeData) {
    const updated = {
      ...session,
      ragioneSociale: (aeData.ragioneSociale as string) || session.ragioneSociale,
      partitaIva: (aeData.partitaIva as string) || session.partitaIva,
      codiceFiscale: (aeData.codiceFiscale as string) || session.codiceFiscale,
      indirizzo: (aeData.indirizzo as string) || session.indirizzo,
      numeroCivico: (aeData.numeroCivico as string) || session.numeroCivico,
      cap: (aeData.cap as string) || session.cap,
      comune: (aeData.comune as string) || session.comune,
      provincia: (aeData.provincia as string) || session.provincia,
      defAliquotaIVA: (aeData.defAliquotaIVA as string) || session.defAliquotaIVA,
    };
    setSession(updated);
  }

  const meResult = GetMeResponse.parse({
    ragioneSociale: (aeData?.ragioneSociale as string) ?? session?.ragioneSociale ?? "",
    partitaIva: (aeData?.partitaIva as string) ?? session?.partitaIva ?? "",
    codiceFiscale: (aeData?.codiceFiscale as string) ?? session?.codiceFiscale ?? "",
    indirizzo: (aeData?.indirizzo as string) ?? session?.indirizzo ?? "",
    comune: (aeData?.comune as string) ?? session?.comune ?? "",
    cap: (aeData?.cap as string) ?? session?.cap ?? "",
    provincia: (aeData?.provincia as string) ?? session?.provincia ?? "",
  });

  res.json(meResult);
});

// POST /ae/documenti
router.post("/ae/documenti", async (req, res): Promise<void> => {
  let cookies: string;
  try {
    cookies = await requireSession();
  } catch {
    res.status(401).json({ error: "Non autenticato. Effettua il login." });
    return;
  }

  const parsed = InviaDocumentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const session = getSession()!;

  // Build DCW10 payload matching AE's format
  const dcw10Payload = buildDcw10Payload(input, session);

  req.log.info({ tipoOperazione: input.tipoOperazione }, "Sending documento to AE");

  const result = await aePost(
    `${AE_API}/doc/documenti/?v=${Date.now()}`,
    cookies,
    dcw10Payload,
  );

  if (!result.ok) {
    const allowHeader = (result as { headers?: Headers }).headers?.get?.("allow") ?? "";
    req.log.warn({ status: result.status, data: result.data, allow: allowHeader, url: `${AE_API}/doc/documenti/` }, "AE documenti error");
    res.status(result.status).json({
      error: "Errore dall'AE durante l'invio del documento",
      details: JSON.stringify(result.data),
    });
    return;
  }

  const aeResp = result.data as Record<string, unknown>;

  // Real AE response: {"esito": true, "idtrx": "213251520", "progressivo": "DCW2026/1327-9909", "errori": []}
  if (aeResp.esito === false || (Array.isArray(aeResp.errori) && aeResp.errori.length > 0)) {
    req.log.warn({ aeResp }, "AE returned esito=false or errori");
    res.status(422).json({ error: "AE ha rifiutato il documento", details: JSON.stringify(aeResp.errori) });
    return;
  }

  const progressivo = aeResp.progressivo as string | undefined;

  const docResult = InviaDocumentoResponse.parse({
    success: true,
    numeroDocumento: progressivo ?? `DCW${new Date().getFullYear()}`,
    numeroProgressivo: progressivo ?? "",
    dataEmissione: new Date().toISOString().split("T")[0]!,
    pdfUrl: progressivo ? `/api/ae/stampa/${encodeURIComponent(progressivo)}` : null,
  });

  res.json(docResult);
});

// GET /ae/stampa/:numeroProgressivo
router.get("/ae/stampa/:numeroProgressivo", async (req, res): Promise<void> => {
  let cookies: string;
  try {
    cookies = await requireSession();
  } catch {
    res.status(401).json({ error: "Non autenticato." });
    return;
  }

  const rawParam = Array.isArray(req.params.numeroProgressivo)
    ? req.params.numeroProgressivo[0]
    : req.params.numeroProgressivo;

  const params = GetStampaParams.safeParse({ numeroProgressivo: rawParam });
  if (!params.success) {
    res.status(400).json({ error: "Numero progressivo non valido" });
    return;
  }

  const ts = Date.now();
  const pdfResp = await fetch(
    `${AE_BASE}/ser/documenticommercialionline/stampa?v=${ts}&progressivo=${params.data.numeroProgressivo}`,
    {
      headers: { ...BROWSER_HEADERS, Cookie: cookies },
    },
  );

  if (!pdfResp.ok) {
    res.status(pdfResp.status).json({ error: "Impossibile scaricare il PDF" });
    return;
  }

  const ct = pdfResp.headers.get("content-type") ?? "application/pdf";
  res.setHeader("Content-Type", ct);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="documento_${params.data.numeroProgressivo}.pdf"`,
  );

  const buf = await pdfResp.arrayBuffer();
  res.send(Buffer.from(buf));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a number as an 8-decimal-place string (e.g. "0.08196721") */
function fmt8(n: number): string {
  return n.toFixed(8);
}

/** Format a number as a 2-decimal-place string (e.g. "0.10") */
function fmt2(n: number): string {
  return n.toFixed(2);
}

/** Format today's date as "DD/MM/YYYY" */
function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function buildDcw10Payload(
  input: {
    tipoOperazione: string;
    codiceLotteria?: string;
    righe: Array<{
      quantita: number;
      descrizione: string;
      prezzoUnitario: number; // GROSS unit price (IVA inclusa)
      aliquotaIva: string;    // e.g. "22", "10", "4", "Esente", "Non soggette"
      sconto?: number;        // line discount amount (on total line)
      omaggio?: boolean;
    }>;
    pagamento: {
      contanti?: number;
      elettronico?: number;
      ticketRestaurant?: number;
      numeroTicket?: string;
      scontoAPagare?: number;
      documentoCollegato?: string;
    };
    flagDocCommPerRegalo?: boolean;
    corrispettivoNonRiscosso?: {
      emissioneFattura?: boolean;
      prestazioniServizi?: number;
      creditoCessioneBene?: number;
    };
  },
  session: {
    partitaIva: string;
    codiceFiscale: string;
    ragioneSociale: string;
    indirizzo: string;
    numeroCivico: string;
    cap: string;
    comune: string;
    provincia: string;
    defAliquotaIVA: string;
  },
) {
  // ── Per-line calculations ──────────────────────────────────────────────────
  const elementiContabili = input.righe.map((r) => {
    const aliqNum = parseFloat(r.aliquotaIva); // NaN for Esente/Non soggette
    const hasIva = !isNaN(aliqNum) && aliqNum > 0;
    const divisor = hasIva ? 1 + aliqNum / 100 : 1;

    const prezzoLordo = r.quantita * r.prezzoUnitario; // total gross (IVA included)
    const scontoLordo = r.sconto ?? 0;                 // discount on total gross
    const prezzoLordoNetto = prezzoLordo - scontoLordo; // after discount

    const imponibile = prezzoLordoNetto / divisor;     // taxable base
    const importoIVA = prezzoLordoNetto - imponibile;  // IVA amount

    // Per-unit net price (imponibile / quantita)
    const prezzoUnitarioNetto = imponibile / r.quantita;
    const scontoUnitario = r.quantita > 0 ? scontoLordo / r.quantita / divisor : 0;

    return {
      idElementoContabile: "",
      resiPregressi: fmt2(0),
      reso: fmt2(0),
      quantita: fmt2(r.quantita),
      descrizioneProdotto: r.descrizione,
      prezzoLordo: fmt8(prezzoLordo),
      prezzoUnitario: fmt8(prezzoUnitarioNetto),
      scontoUnitario: fmt8(scontoUnitario),
      scontoLordo: fmt8(scontoLordo),
      aliquotaIVA: hasIva ? String(Math.round(aliqNum)) : r.aliquotaIva,
      importoIVA: fmt8(importoIVA),
      imponibile: fmt8(imponibile),
      imponibileNetto: fmt8(imponibile), // same as imponibile when no additional line discounts
      totale: fmt8(prezzoLordoNetto),
      omaggio: r.omaggio ? "S" : "N",
    };
  });

  // ── Document totals ────────────────────────────────────────────────────────
  const ammontareComplessivo = elementiContabili.reduce(
    (s, e) => s + parseFloat(e.prezzoLordo), 0,
  );
  const totaleImponibile = elementiContabili.reduce(
    (s, e) => s + parseFloat(e.imponibile), 0,
  );
  const importoTotaleIva = elementiContabili.reduce(
    (s, e) => s + parseFloat(e.importoIVA), 0,
  );
  const scontoTotale = elementiContabili.reduce(
    (s, e) => s + parseFloat(e.scontoLordo), 0,
  );

  // ── Pagamento → vendita ────────────────────────────────────────────────────
  const pag = input.pagamento;
  const nrEf = input.corrispettivoNonRiscosso?.emissioneFattura ? (ammontareComplessivo) : 0;
  const nrPs = input.corrispettivoNonRiscosso?.prestazioniServizi ?? 0;
  const nrCs = input.corrispettivoNonRiscosso?.creditoCessioneBene ?? 0;
  const totaleNonRiscosso = nrEf + nrPs + nrCs;

  const vendita = [
    { tipo: "PC", importo: fmt2(pag.contanti ?? 0) },
    { tipo: "PE", importo: fmt2(pag.elettronico ?? 0) },
    { tipo: "TR", importo: fmt2(pag.ticketRestaurant ?? 0), numero: String(Math.round(parseFloat(pag.numeroTicket ?? "0"))) },
    { tipo: "NR_EF", importo: fmt2(nrEf) },
    { tipo: "NR_PS", importo: fmt2(nrPs) },
    { tipo: "NR_CS", importo: fmt2(nrCs) },
  ];

  // ── Final payload — field names/structure exactly as in real HAR capture ───
  return {
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore: {
      identificativiFiscali: {
        codicePaese: "IT",
        partitaIva: session.partitaIva,
        codiceFiscale: session.codiceFiscale,
      },
      altriDatiIdentificativi: {
        denominazione: session.ragioneSociale,
        indirizzo: session.indirizzo,
        numeroCivico: session.numeroCivico,
        cap: session.cap,
        comune: session.comune,
        provincia: session.provincia,
        nazione: "IT",
        modificati: false,   // false = use server-stored data; prevents validation errors
        defAliquotaIVA: session.defAliquotaIVA || "22",
        nuovoUtente: false,
      },
      multiAttivita: [],
      multiSede: [],
    },
    documentoCommerciale: {
      cfCessionarioCommittente: input.codiceLotteria ?? "",
      flagDocCommPerRegalo: input.flagDocCommPerRegalo ?? false,
      progressivoCollegato: pag.documentoCollegato ?? "",
      dataOra: todayDDMMYYYY(),              // "DD/MM/YYYY" not ISO
      multiAttivita: { codiceAttivita: "", descAttivita: "" }, // object not array
      importoTotaleIva: fmt8(importoTotaleIva),
      scontoTotale: fmt8(scontoTotale),
      scontoTotaleLordo: fmt8(scontoTotale),
      totaleImponibile: fmt8(totaleImponibile),
      ammontareComplessivo: fmt8(ammontareComplessivo),
      totaleNonRiscosso: fmt8(totaleNonRiscosso),
      elementiContabili,
      vendita,
      scontoAbbuono: fmt2(pag.scontoAPagare ?? 0),
      importoDetraibileDeducibile: fmt8(0),
    },
    flagIdentificativiModificati: false,
  };
}

export default router;
