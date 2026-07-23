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
        ...session,
        cookies: result.cookieHeader,
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

  const meResult = GetMeResponse.parse({
    ragioneSociale:
      (aeData?.ragioneSociale as string) ?? session?.ragioneSociale ?? "",
    partitaIva: (aeData?.partitaIva as string) ?? session?.partitaIva ?? "",
    codiceFiscale:
      (aeData?.codiceFiscale as string) ?? session?.codiceFiscale ?? "",
    indirizzo: (aeData?.indirizzo as string) ?? "",
    comune: (aeData?.comune as string) ?? "",
    cap: (aeData?.cap as string) ?? "",
    provincia: (aeData?.provincia as string) ?? "",
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

  // Extract document number from AE response
  const progressivo = extractProgressivo(aeResp);

  const docResult = InviaDocumentoResponse.parse({
    success: true,
    numeroDocumento: progressivo
      ? `DCW${new Date().getFullYear()}/${progressivo}`
      : "DCW/" + new Date().getFullYear(),
    numeroProgressivo: progressivo ?? "",
    dataEmissione: new Date().toISOString().split("T")[0]!,
    pdfUrl: progressivo ? `/api/ae/stampa/${progressivo}` : null,
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

function extractProgressivo(aeResp: Record<string, unknown>): string | null {
  // Try various fields AE might return
  const candidates = [
    aeResp?.progressivo,
    aeResp?.numeroProgressivo,
    aeResp?.id,
    aeResp?.documentoId,
    (aeResp?.documento as Record<string, unknown>)?.progressivo,
  ];
  for (const c of candidates) {
    if (c != null) return String(c);
  }
  return null;
}

function buildDcw10Payload(
  input: {
    tipoOperazione: string;
    codiceLotteria?: string;
    righe: Array<{
      quantita: number;
      descrizione: string;
      prezzoUnitario: number;
      aliquotaIva: string;
      sconto?: number;
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
  session: { partitaIva: string; codiceFiscale: string; ragioneSociale: string },
) {
  const righe = input.righe.map((r, i) => {
    const aliqNum = parseFloat(r.aliquotaIva);
    const isPercent = !isNaN(aliqNum);
    const prezzoComplessivo = r.quantita * r.prezzoUnitario;
    const importoIva = isPercent
      ? prezzoComplessivo * (aliqNum / 100) / (1 + aliqNum / 100)
      : 0;
    const sconto = r.sconto ?? 0;

    return {
      numero: i + 1,
      quantita: r.quantita,
      descrizione: r.descrizione,
      prezzoUnitario: r.prezzoUnitario,
      aliquotaIva: r.aliquotaIva,
      prezzoComplessivo: prezzoComplessivo,
      importoIva: Math.round(importoIva * 100) / 100,
      sconto,
      prezzoNetto: Math.round((prezzoComplessivo - sconto) * 100) / 100,
      omaggio: r.omaggio ?? false,
    };
  });

  return {
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore: {
      identificativiFiscali: {
        codicePaese: "IT",
        partitaIva: session.partitaIva,
        codiceFiscale: session.codiceFiscale,
      },
    },
    documentoCommerciale: {
      cfCessionarioCommittente: input.codiceLotteria ?? "",
      flagDocCommPerRegalo: input.flagDocCommPerRegalo ?? false,
      progressivoCollegato: input.pagamento.documentoCollegato ?? "",
      tipoOperazione: input.tipoOperazione,
      dataEmissione: new Date().toISOString().split("T")[0]!,
      righe,
      pagamento: {
        contanti: input.pagamento.contanti ?? 0,
        elettronico: input.pagamento.elettronico ?? 0,
        ticketRestaurant: input.pagamento.ticketRestaurant ?? 0,
        numeroTicket: input.pagamento.numeroTicket ?? "",
        scontoAPagare: input.pagamento.scontoAPagare ?? 0,
      },
      corrispettivoNonRiscosso: {
        emissioneFattura:
          input.corrispettivoNonRiscosso?.emissioneFattura ?? false,
        prestazioniServizi:
          input.corrispettivoNonRiscosso?.prestazioniServizi ?? 0,
        creditoCessioneBene:
          input.corrispettivoNonRiscosso?.creditoCessioneBene ?? 0,
      },
    },
    flagIdentificativiModificati: false,
  };
}

export default router;
