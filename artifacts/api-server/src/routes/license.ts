import { Router, type IRouter, type Request, type Response } from "express";
import { getSession } from "../lib/session.js";
import {
  activateLicense,
  consumeTransfer,
  createLicenseRequest,
  createTransfer,
  getLicenseStatus,
  licenseCodeFingerprint,
  makeDeviceIdentity,
} from "../lib/licensing.js";

const router: IRouter = Router();

function getContext(req: Request) {
  const device = makeDeviceIdentity({
    deviceId: req.header("x-scontrini-device-id"),
    publicKey: req.header("x-scontrini-device-key"),
    issuedAt: req.header("x-scontrini-device-issued-at"),
    nonce: req.header("x-scontrini-device-nonce"),
    signature: req.header("x-scontrini-device-signature"),
    platform: req.header("x-scontrini-device-platform"),
    displayName: req.header("x-scontrini-device-name"),
  });
  const partitaIva = getSession()?.partitaIva ?? "";
  return { device, partitaIva };
}

function requireContext(req: Request, res: Response) {
  const { device, partitaIva } = getContext(req);
  if (!device) {
    res.status(400).json({ error: "Identificativo dispositivo mancante o non valido. Aggiorna l’app e riprova." });
    return null;
  }
  if (!/^\d{11}$/.test(partitaIva)) {
    res.status(409).json({ error: "Partita IVA ADE non ancora disponibile. Riconnetti l’estensione e riprova." });
    return null;
  }
  return { device, partitaIva };
}

router.get("/license/status", async (req, res): Promise<void> => {
  const context = requireContext(req, res);
  if (!context) return;
  const status = await getLicenseStatus(context.partitaIva, context.device);
  res.json(status);
});

router.post("/license/activate", async (req, res): Promise<void> => {
  const context = requireContext(req, res);
  if (!context) return;
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (code.length < 30 || code.length > 2000) {
    res.status(400).json({ error: "Inserisci un codice licenza valido." });
    return;
  }
  try {
    const status = await activateLicense(code, context.partitaIva, context.device);
    req.log.info({ licenseCode: licenseCodeFingerprint(code), platform: context.device.platform }, "License activated");
    res.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Attivazione non riuscita.";
    req.log.warn({ platform: context.device.platform }, "License activation rejected");
    res.status(400).json({ error: message });
  }
});

router.post("/license/transfer/generate", async (req, res): Promise<void> => {
  const context = requireContext(req, res);
  if (!context) return;
  try {
    const transfer = await createTransfer(context.partitaIva, context.device);
    req.log.info({ platform: context.device.platform }, "License transfer QR generated");
    res.json(transfer);
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : "Impossibile avviare il trasferimento." });
  }
});

router.post("/license/transfer/consume", async (req, res): Promise<void> => {
  const context = requireContext(req, res);
  if (!context) return;
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
  if (!token || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "QR o PIN di trasferimento non valido." });
    return;
  }
  try {
    const status = await consumeTransfer(token, pin, context.partitaIva, context.device);
    req.log.info({ platform: context.device.platform }, "License transferred to device");
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Trasferimento non riuscito." });
  }
});

router.post("/license/request", async (req, res): Promise<void> => {
  const context = requireContext(req, res);
  if (!context) return;
  const type = req.body?.type;
  const note = typeof req.body?.note === "string" ? req.body.note : "";
  if (type !== "activation" && type !== "renewal" && type !== "recovery") {
    res.status(400).json({ error: "Tipo richiesta non valido." });
    return;
  }
  const requestId = await createLicenseRequest(context.partitaIva, type, note);
  req.log.info({ type, platform: context.device.platform }, "License support request created");
  res.status(201).json({ requestId });
});

export default router;