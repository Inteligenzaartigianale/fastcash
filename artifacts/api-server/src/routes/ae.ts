import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, documentiTable, impostazioniTable } from "@workspace/db";
import { clearSession, getSession, isSessionValid, setSession } from "../lib/session.js";
import {
  InviaDocumentoBody,
  InviaDocumentoResponse,
  GetMeResponse,
  GetStampaParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger.js";
import { randomUUID } from "node:crypto";

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

export async function validateDcoCookies(cookies: string): Promise<boolean> {
  const result = await checkDcoSession(cookies);
  return result.authenticated;
}

type DcoSessionCheck = {
  authenticated: boolean;
  httpStatus: number;
  message: string;
  details?: string;
  ragioneSociale?: string;
  partitaIva?: string;
  codiceFiscale?: string;
};

export async function checkDcoSession(cookies: string): Promise<DcoSessionCheck> {
  const result = await aeGet(`${AE_COMMON}/info/me?v=${Date.now()}`, cookies);
  if (!result.ok) {
    return {
      authenticated: false,
      httpStatus: result.status,
      message: result.status === 401
        ? "ADE non riconosce la sessione sul servizio DCO."
        : `ADE ha restituito HTTP ${result.status} durante la verifica della sessione.`,
      details: typeof result.data === "string" && result.data.trim()
        ? result.data.slice(0, 500)
        : undefined,
    };
  }

  const raw = result.data as Record<string, unknown>;
  const info = (raw.info ?? {}) as Record<string, Record<string, string>>;
  const utente = (info.utenteAutenticato ?? {}) as Record<string, string>;
  const lavoro = (info.utenzaLavoro ?? {}) as Record<string, string>;

  return {
    authenticated: true,
    httpStatus: result.status,
    message: "ADE ha riconosciuto la sessione sul servizio DCO.",
    ragioneSociale: lavoro.denominazione ?? "",
    partitaIva: lavoro.piva ?? lavoro.cf ?? "",
    codiceFiscale: lavoro.cf ?? utente.cf ?? "",
  };
}

/** Ensure the session is still authenticated on the actual DCO service. */
async function requireSession(): Promise<string> {
  const session = getSession();
  if (!session || !isSessionValid()) {
    throw Object.assign(new Error("Sessione ADE scaduta"), { status: 401 });
  }

  if (!(await validateDcoCookies(session.cookies))) {
    clearSession();
    throw Object.assign(new Error("Sessione DCO ADE non valida"), { status: 401 });
  }

  return session.cookies;
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

// ── Shared: fetch identity from ADE and update session ───────────────────────
export async function fetchMeAndUpdateSession(cookies: string): Promise<boolean> {
  const ts = Date.now();
  const [meResult, fiscaliResult] = await Promise.all([
    aeGet(`${AE_COMMON}/info/me?v=${ts}`, cookies),
    aeGet(`${AE_API}/doc/documenti/dati/fiscali?v=${ts}`, cookies),
  ]);
  if (!meResult.ok) return false;

  const raw = meResult.data as Record<string, unknown>;
  const info = (raw.info ?? {}) as Record<string, Record<string, string>>;
  const utente = (info.utenteAutenticato ?? {}) as Record<string, string>;
  const lavoro  = (info.utenzaLavoro ?? {}) as Record<string, string>;

  const ragioneSociale = lavoro.denominazione ?? "";
  const partitaIva     = lavoro.piva ?? lavoro.cf ?? "";
  const codiceFiscale  = lavoro.cf ?? utente.cf ?? "";

  const fiscali = fiscaliResult.ok
    ? ((fiscaliResult.data as Record<string, unknown>)?.altriDatiIdentificativi ?? {}) as Record<string, string>
    : {} as Record<string, string>;

  const session = getSession();
  if (session) {
    setSession({
      ...session,
      ragioneSociale: ragioneSociale || session.ragioneSociale,
      partitaIva:     partitaIva     || session.partitaIva,
      codiceFiscale:  codiceFiscale  || session.codiceFiscale,
      indirizzo:      fiscali.indirizzo   || session.indirizzo,
      numeroCivico:   fiscali.numeroCivico ?? session.numeroCivico,
      cap:            fiscali.cap         || session.cap,
      comune:         fiscali.comune      || session.comune,
      provincia:      fiscali.provincia   || session.provincia,
      defAliquotaIVA: fiscali.defAliquotaIVA || session.defAliquotaIVA,
    });
    logger.info({ ragioneSociale, partitaIva, codiceFiscale }, "fetchMeAndUpdateSession: session updated");
  }
  return true;
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

  // Call both endpoints in parallel: /me (identity) and /dati/fiscali (address)
  const [meResult, fiscaliResult] = await Promise.all([
    aeGet(`${AE_COMMON}/info/me?v=${ts}`, cookies),
    aeGet(`${AE_API}/doc/documenti/dati/fiscali?v=${ts}`, cookies),
  ]);

  if (!meResult.ok) {
    req.log.warn({ status: meResult.status, data: meResult.data, cookieLen: cookies.length }, "AE /me returned error");
    res.status(meResult.status).json({ error: "Errore AE", details: JSON.stringify(meResult.data) });
    return;
  }

  const raw = meResult.data as Record<string, unknown>;
  const info = (raw.info ?? {}) as Record<string, Record<string, string>>;
  const utente = (info.utenteAutenticato ?? {}) as Record<string, string>;
  const lavoro  = (info.utenzaLavoro ?? {}) as Record<string, string>;

  const ragioneSociale = lavoro.denominazione ?? "";
  const partitaIva     = lavoro.piva ?? lavoro.cf ?? "";
  const codiceFiscale  = lavoro.cf ?? utente.cf ?? "";

  const fiscali = fiscaliResult.ok
    ? ((fiscaliResult.data as Record<string, unknown>)?.altriDatiIdentificativi ?? {}) as Record<string, string>
    : {} as Record<string, string>;

  const session = getSession();

  if (session) {
    setSession({
      ...session,
      ragioneSociale: ragioneSociale || session.ragioneSociale,
      partitaIva:     partitaIva     || session.partitaIva,
      codiceFiscale:  codiceFiscale  || session.codiceFiscale,
      indirizzo:      fiscali.indirizzo   || session.indirizzo,
      numeroCivico:   fiscali.numeroCivico ?? session.numeroCivico,
      cap:            fiscali.cap         || session.cap,
      comune:         fiscali.comune      || session.comune,
      provincia:      fiscali.provincia   || session.provincia,
      defAliquotaIVA: fiscali.defAliquotaIVA || session.defAliquotaIVA,
    });
  }

  req.log.info({ ragioneSociale, partitaIva, codiceFiscale, indirizzo: fiscali.indirizzo, cap: fiscali.cap }, "AE /me+fiscali mapped");

  const finalSession = getSession();
  const parsed = GetMeResponse.parse({
    ragioneSociale: ragioneSociale || finalSession?.ragioneSociale || "",
    partitaIva:     partitaIva     || finalSession?.partitaIva     || "",
    codiceFiscale:  codiceFiscale  || finalSession?.codiceFiscale  || "",
    indirizzo: finalSession?.indirizzo || "",
    comune:    finalSession?.comune    || "",
    cap:       finalSession?.cap       || "",
    provincia: finalSession?.provincia || "",
  });

  res.json(parsed);
});

// GET /ae/status — diagnostic response from ADE, without exposing cookies
router.get("/ae/status", async (req, res): Promise<void> => {
  const session = getSession();
  if (!session || !isSessionValid()) {
    res.json({
      connected: false,
      httpStatus: 401,
      service: "Documenti Commerciali Online ADE",
      message: "Nessuna sessione ADE disponibile.",
      details: "Esegui l'accesso automatico oppure apri il DCO in Chrome e collega l'estensione.",
    });
    return;
  }

  const check = await checkDcoSession(session.cookies);
  if (!check.authenticated) clearSession();

  res.json({
    connected: check.authenticated,
    httpStatus: check.httpStatus,
    service: "Documenti Commerciali Online ADE",
    message: check.message,
    details: check.details,
    ragioneSociale: check.ragioneSociale,
    partitaIva: check.partitaIva,
    codiceFiscale: check.codiceFiscale,
  });
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

  const [maxDcoRow] = await db.select().from(impostazioniTable).limit(1);
  const importoDco = input.righe.reduce(
    (sum, riga) => sum + Math.max(0, riga.quantita * riga.prezzoUnitario - (riga.sconto ?? 0)),
    0,
  );
  const maxDco = maxDcoRow?.importoMassimoDco == null ? null : Number(maxDcoRow.importoMassimoDco);
  if (maxDco != null && importoDco > maxDco + 0.005) {
    res.status(400).json({
      error: "Importo DCO superiore alla soglia configurata",
      details: `Massimo consentito: € ${maxDco.toFixed(2)}`,
    });
    return;
  }

  // Without the optional local "gestione resto" feature, never forward a
  // received cash amount that is higher than the DCO total to ADE.
  const inputForAe = maxDcoRow?.gestioneResto
    ? input
    : {
        ...input,
        pagamento: {
          ...input.pagamento,
          contanti: input.pagamento.contanti ? importoDco : 0,
        },
      };

  // Build DCW10 payload matching AE's format
  const dcw10Payload = buildDcw10Payload(inputForAe, session);

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
  const emissione = new Date();
  const dataEmissione = emissione.toISOString().split("T")[0]!;
  const documentId = randomUUID();

  await db.insert(documentiTable).values({
    id: documentId,
    numeroDocumento: progressivo ?? `DCW${new Date().getFullYear()}`,
    numeroProgressivo: progressivo ?? null,
    dataEmissione,
    dataOraEmissione: emissione.toISOString(),
    tipoOperazione: input.tipoOperazione,
    totale: importoDco.toFixed(2),
    codiceLotteria: input.codiceLotteria ?? null,
    righe: input.righe,
    pagamento: inputForAe.pagamento,
  });

  const docResult = InviaDocumentoResponse.parse({
    success: true,
    id: documentId,
    numeroDocumento: progressivo ?? `DCW${new Date().getFullYear()}`,
    numeroProgressivo: progressivo ?? "",
    dataEmissione,
    pdfUrl: progressivo ? `/api/ae/stampa/${encodeURIComponent(progressivo)}` : null,
  });

  const segno = input.tipoOperazione === "Reso" ? -1 : input.tipoOperazione === "Annullo" ? 0 : 1;
  if (segno !== 0) {
    for (const riga of input.righe) {
      if (!riga.articoloId || riga.quantita <= 0) continue;
      const qta = Math.trunc(riga.quantita) * segno;
      // Le quantità vengono aggiornate con SQL atomico per supportare più casse/sessioni.
      await db.execute(
        sql`UPDATE articoli SET giacenza = giacenza - ${qta}, pezzi_venduti = pezzi_venduti + ${qta} WHERE id = ${riga.articoloId}`,
      );
    }
  }

  res.json(docResult);
});

// POST /documenti/:id/annulla
// Sends a real ADE annullo linked to the original DCO and keeps both records.
router.post("/documenti/:id/annulla", async (req, res): Promise<void> => {
  let cookies: string;
  try {
    cookies = await requireSession();
  } catch {
    res.status(401).json({ error: "Non autenticato. Effettua il login." });
    return;
  }

  const [originale] = await db
    .select()
    .from(documentiTable)
    .where(eq(documentiTable.id, req.params.id));

  if (!originale) {
    res.status(404).json({ error: "Documento non trovato." });
    return;
  }
  if (originale.tipoOperazione === "Annullo" || originale.stato === "Annullato") {
    res.status(409).json({ error: "Il documento è già annullato o è un annullo." });
    return;
  }
  if (!originale.numeroProgressivo) {
    res.status(400).json({ error: "Il documento non ha un progressivo ADE collegabile." });
    return;
  }

  const [annulloEsistente] = await db
    .select({ id: documentiTable.id })
    .from(documentiTable)
    .where(eq(documentiTable.documentoOrigineId, originale.id));
  if (annulloEsistente) {
    res.status(409).json({ error: "Esiste già un annullo per questo documento." });
    return;
  }

  const session = getSession()!;
  const input = {
    tipoOperazione: "Annullo",
    righe: originale.righe,
    pagamento: {
      ...originale.pagamento,
      documentoCollegato: originale.numeroProgressivo,
    },
    codiceLotteria: originale.codiceLotteria ?? undefined,
    resoAnnullo: {
      tipologia: "A" as const,
      dataOra: formatDateForDco(
        originale.dataOraEmissione
          ? new Date(originale.dataOraEmissione)
          : originale.createdAt,
      ),
      progressivo: originale.numeroProgressivo.includes("/")
        ? originale.numeroProgressivo.split("/").pop() ?? originale.numeroProgressivo
        : originale.numeroProgressivo,
    },
  };
  const result = await aePost(
    `${AE_API}/doc/documenti/?v=${Date.now()}`,
    cookies,
    buildDcw10Payload(input, session),
  );

  if (!result.ok) {
    res.status(result.status).json({
      error: "Errore dall'AE durante l'annullamento del documento",
      details: JSON.stringify(result.data),
    });
    return;
  }

  const aeResp = result.data as Record<string, unknown>;
  if (aeResp.esito === false || (Array.isArray(aeResp.errori) && aeResp.errori.length > 0)) {
    res.status(422).json({
      error: "ADE ha rifiutato l'annullamento",
      details: JSON.stringify(aeResp.errori),
    });
    return;
  }

  const progressivo = aeResp.progressivo as string | undefined;
  const emissione = new Date();
  const dataEmissione = emissione.toISOString().split("T")[0]!;
  const annulloId = randomUUID();

  await db.insert(documentiTable).values({
    id: annulloId,
    numeroDocumento: progressivo ?? `DCW${new Date().getFullYear()}`,
    numeroProgressivo: progressivo ?? null,
    dataEmissione,
    dataOraEmissione: emissione.toISOString(),
    tipoOperazione: "Annullo",
    stato: "Emesso",
    documentoOrigineId: originale.id,
    totale: Number(originale.totale).toFixed(2),
    codiceLotteria: originale.codiceLotteria,
    righe: originale.righe,
    pagamento: input.pagamento,
  });
  await db
    .update(documentiTable)
    .set({ stato: "Annullato" })
    .where(eq(documentiTable.id, originale.id));

  res.json(InviaDocumentoResponse.parse({
    success: true,
    id: annulloId,
    numeroDocumento: progressivo ?? `DCW${new Date().getFullYear()}`,
    numeroProgressivo: progressivo ?? "",
    dataEmissione,
  }));
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

function formatDateForDco(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function buildDcw10Payload(
  input: {
    tipoOperazione: string;
    codiceLotteria?: string;
    righe: Array<{
      quantita: number;
      descrizione: string;
      prezzoUnitario: number; // GROSS unit price (IVA inclusa)
      aliquotaIva: string;    // e.g. "22", "10", "4", "N1"..."N6"
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
    resoAnnullo?: {
      tipologia: "R" | "A";
      dataOra: string;
      progressivo: string;
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
    const legacyNatura = r.aliquotaIva === "Esente"
      ? "N4"
      : r.aliquotaIva === "Non soggette"
        ? "N2"
        : r.aliquotaIva;
    const aliqNum = parseFloat(legacyNatura); // NaN for N1...N6
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
      // The ADE Wizard2/DCW10 contract uses N1...N6 in this same field
      // for zero-rate lines; numeric rates remain percentages.
      aliquotaIVA: hasIva ? String(Math.round(aliqNum)) : legacyNatura,
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
    { tipo: "TR", importo: fmt2(pag.ticketRestaurant ?? 0), numero: String(Math.round(parseFloat(pag.numeroTicket || "0") || 0)) },
    { tipo: "NR_EF", importo: fmt2(nrEf) },
    { tipo: "NR_PS", importo: fmt2(nrPs) },
    { tipo: "NR_CS", importo: fmt2(nrCs) },
  ];

  const documentoCommercialeBase = {
    cfCessionarioCommittente: input.codiceLotteria ?? "",
    flagDocCommPerRegalo: input.flagDocCommPerRegalo ?? false,
    progressivoCollegato: pag.documentoCollegato ?? "",
    dataOra: todayDDMMYYYY(),
    multiAttivita: { codiceAttivita: "", descAttivita: "" },
    importoTotaleIva: fmt8(importoTotaleIva),
    scontoTotale: fmt8(scontoTotale),
    scontoTotaleLordo: fmt8(scontoTotale),
    totaleImponibile: fmt8(totaleImponibile),
    ammontareComplessivo: fmt8(ammontareComplessivo),
    totaleNonRiscosso: fmt8(totaleNonRiscosso),
    elementiContabili,
    scontoAbbuono: fmt2(pag.scontoAPagare ?? 0),
    importoDetraibileDeducibile: fmt8(0),
  };

  // ADE requires ResoAnnullo as an alternative to Vendita. In particular,
  // an annullo must never be sent with the ordinary payment block.
  const documentoCommerciale = input.resoAnnullo
    ? {
        ...documentoCommercialeBase,
        resoAnnullo: input.resoAnnullo,
      }
    : {
        ...documentoCommercialeBase,
        vendita,
      };

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
    documentoCommerciale,
    flagIdentificativiModificati: false,
  };
}

export default router;
