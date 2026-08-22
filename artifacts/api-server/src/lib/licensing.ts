import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  licensedDevicesTable,
  licenseCodeRedemptionsTable,
  licenseRequestsTable,
  licenseTransfersTable,
  licensesTable,
  type License,
} from "@workspace/db";

export type DevicePlatform = "desktop" | "mobile";

export interface DeviceIdentity {
  deviceId: string;
  platform: DevicePlatform;
  displayName: string;
  publicKey: string;
  issuedAt: string;
  nonce: string;
  signature: string;
}

export type LicenseState =
  | "demo"
  | "active"
  | "expiring"
  | "expired"
  | "suspended"
  | "device_not_authorized";

export interface LicenseStatus {
  state: LicenseState;
  canEmit: boolean;
  plan: "annuale" | "a_vita" | null;
  fiscalChannel: "browser" | "rest" | null;
  expiresOn: string | null;
  daysRemaining: number | null;
  activeDevice: boolean;
  message: string;
}

interface LicenseCodePayload {
  v: 1;
  id: string;
  piva: string;
  plan: "annuale" | "a_vita";
  expiresOn: string | null;
  channel: "browser" | "rest";
}

const TRANSFER_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_TRANSFER_PIN_ATTEMPTS = 3;
let licenseStorageReady: Promise<void> | null = null;

/**
 * Keeps first boot safe on a freshly deployed instance. Drizzle remains the
 * source of truth, while this idempotent bootstrap avoids serving license
 * endpoints before the commercial tables have been created.
 */
export function ensureLicenseStorage(): Promise<void> {
  if (!licenseStorageReady) {
    licenseStorageReady = (async () => {
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS licenses (
          id TEXT PRIMARY KEY,
          partita_iva TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'active',
          plan TEXT NOT NULL DEFAULT 'annuale',
          fiscal_channel TEXT NOT NULL DEFAULT 'browser',
          activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_on DATE,
          active_device_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS licensed_devices (
          id TEXT PRIMARY KEY,
          license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
          device_id TEXT NOT NULL UNIQUE,
          platform TEXT NOT NULL,
          display_name TEXT NOT NULL,
          proof_hash TEXT NOT NULL DEFAULT '',
          public_key TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active',
          activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          revoked_at TIMESTAMPTZ
        );
        ALTER TABLE licensed_devices ADD COLUMN IF NOT EXISTS proof_hash TEXT NOT NULL DEFAULT '';
        ALTER TABLE licensed_devices ADD COLUMN IF NOT EXISTS public_key TEXT NOT NULL DEFAULT '';
        CREATE TABLE IF NOT EXISTS license_requests (
          id TEXT PRIMARY KEY,
          license_id TEXT REFERENCES licenses(id) ON DELETE SET NULL,
          partita_iva TEXT NOT NULL,
          type TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'open',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS license_code_redemptions (
          code_fingerprint TEXT PRIMARY KEY,
          license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
          partita_iva TEXT NOT NULL,
          redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS license_transfers (
          id TEXT PRIMARY KEY,
          license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
          source_device_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          pin_hash TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          failed_attempts TEXT NOT NULL DEFAULT '0',
          consumed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `));
    })();
  }
  return licenseStorageReady;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(date: string): number {
  const today = new Date(`${todayIso()}T00:00:00Z`);
  const target = new Date(`${date}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function normalizePiva(value: string): string {
  return value.trim().toUpperCase().replace(/^IT/, "").replace(/\s/g, "");
}

function verifyDeviceSignature(device: DeviceIdentity): boolean {
  const timestamp = Number(device.issuedAt);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 2 * 60 * 1000) return false;
  try {
    const jwk = JSON.parse(Buffer.from(device.publicKey, "base64url").toString("utf8"));
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.x !== "string" || typeof jwk.y !== "string") return false;
    return verify(
      "sha256",
      Buffer.from(`${device.deviceId}.${device.issuedAt}.${device.nonce}`),
      { key: jwk, format: "jwk", dsaEncoding: "ieee-p1363" },
      Buffer.from(device.signature, "base64url"),
    );
  } catch {
    return false;
  }
}

function codeSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET non configurato: impossibile verificare il codice licenza.");
  }
  return secret;
}

function makeStatus(license: License | undefined, deviceId: string, deviceIsActive = false): LicenseStatus {
  if (!license) {
    return {
      state: "demo",
      canEmit: false,
      plan: null,
      fiscalChannel: null,
      expiresOn: null,
      daysRemaining: null,
      activeDevice: false,
      message: "Modalità demo: puoi provare la cassa, ma non emettere documenti fiscali.",
    };
  }

  const activeDevice = license.activeDeviceId === deviceId && deviceIsActive;
  const plan = license.plan === "a_vita" ? "a_vita" : "annuale";
  const fiscalChannel = license.fiscalChannel === "rest" ? "rest" : "browser";

  if (license.status !== "active") {
    return {
      state: "suspended",
      canEmit: false,
      plan,
      fiscalChannel,
      expiresOn: license.expiresOn,
      daysRemaining: license.expiresOn ? daysUntil(license.expiresOn) : null,
      activeDevice,
      message: "La licenza è sospesa. Contatta l’assistenza per riattivarla.",
    };
  }

  if (plan !== "a_vita" && (!license.expiresOn || daysUntil(license.expiresOn) < 0)) {
    return {
      state: "expired",
      canEmit: false,
      plan,
      fiscalChannel,
      expiresOn: license.expiresOn,
      daysRemaining: license.expiresOn ? daysUntil(license.expiresOn) : 0,
      activeDevice,
      message: "Licenza scaduta: rinnova per tornare a emettere documenti.",
    };
  }

  if (!activeDevice) {
    return {
      state: "device_not_authorized",
      canEmit: false,
      plan,
      fiscalChannel,
      expiresOn: license.expiresOn,
      daysRemaining: license.expiresOn ? Math.max(0, daysUntil(license.expiresOn)) : null,
      activeDevice: false,
      message: "La licenza è attiva su un altro dispositivo. Trasferiscila con il QR dal dispositivo attuale oppure richiedi il recupero.",
    };
  }

  const remaining = license.expiresOn ? daysUntil(license.expiresOn) : null;
  if (remaining !== null && remaining <= 30) {
    return {
      state: "expiring",
      canEmit: true,
      plan,
      fiscalChannel,
      expiresOn: license.expiresOn,
      daysRemaining: remaining,
      activeDevice: true,
      message: `Licenza in scadenza tra ${remaining} ${remaining === 1 ? "giorno" : "giorni"}. Rinnova per evitare interruzioni.`,
    };
  }

  return {
    state: "active",
    canEmit: true,
    plan,
    fiscalChannel,
    expiresOn: license.expiresOn,
    daysRemaining: remaining,
    activeDevice: true,
    message: plan === "a_vita"
      ? "Licenza a vita attiva su questo dispositivo."
      : "Licenza annuale attiva su questo dispositivo.",
  };
}

async function getLicenseByPiva(partitaIva: string): Promise<License | undefined> {
  const normalized = normalizePiva(partitaIva);
  if (!/^\d{11}$/.test(normalized)) return undefined;
  const [license] = await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.partitaIva, normalized))
    .limit(1);
  return license;
}

export async function getLicenseStatus(partitaIva: string, device: DeviceIdentity): Promise<LicenseStatus> {
  const license = await getLicenseByPiva(partitaIva);
  let deviceIsActive = false;
  if (license?.activeDeviceId === device.deviceId) {
    const [registeredDevice] = await db
      .select()
      .from(licensedDevicesTable)
      .where(and(
        eq(licensedDevicesTable.licenseId, license.id),
        eq(licensedDevicesTable.deviceId, device.deviceId),
      ))
      .limit(1);
    deviceIsActive =
      registeredDevice?.status === "active" &&
      registeredDevice.publicKey === device.publicKey &&
      verifyDeviceSignature(device);
  }
  if (license?.activeDeviceId === device.deviceId && deviceIsActive) {
    await db
      .update(licensedDevicesTable)
      .set({ lastSeenAt: new Date() })
      .where(and(
        eq(licensedDevicesTable.licenseId, license.id),
        eq(licensedDevicesTable.deviceId, device.deviceId),
      ));
  }
  return makeStatus(license, device.deviceId, deviceIsActive);
}

function decodeLicenseCode(code: string): LicenseCodePayload {
  const [encoded, signature] = code.trim().split(".");
  if (!encoded || !signature || code.trim().split(".").length !== 2) {
    throw new Error("Il codice licenza non è nel formato previsto.");
  }
  const expected = createHmac("sha256", codeSecret()).update(encoded).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    throw new Error("Il codice licenza non è valido.");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Il codice licenza non può essere letto.");
  }
  const p = payload as Partial<LicenseCodePayload>;
  const valid =
    p.v === 1 &&
    typeof p.id === "string" &&
    /^[a-zA-Z0-9_-]{8,80}$/.test(p.id) &&
    typeof p.piva === "string" &&
    /^\d{11}$/.test(normalizePiva(p.piva)) &&
    (p.plan === "annuale" || p.plan === "a_vita") &&
    (p.channel === "browser" || p.channel === "rest") &&
    (p.plan === "a_vita" ? p.expiresOn === null : typeof p.expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.expiresOn));
  if (!valid) throw new Error("Il codice licenza contiene dati non validi.");
  return {
    v: 1,
    id: p.id!,
    piva: normalizePiva(p.piva!),
    plan: p.plan!,
    expiresOn: p.expiresOn ?? null,
    channel: p.channel!,
  };
}

async function activateDevice(licenseId: string, device: DeviceIdentity): Promise<void> {
  await db
    .update(licensedDevicesTable)
    .set({ status: "transferred", revokedAt: new Date() })
    .where(and(
      eq(licensedDevicesTable.licenseId, licenseId),
      eq(licensedDevicesTable.status, "active"),
    ));

  const [existing] = await db
    .select()
    .from(licensedDevicesTable)
    .where(eq(licensedDevicesTable.deviceId, device.deviceId))
    .limit(1);

  if (existing) {
    await db
      .update(licensedDevicesTable)
      .set({
        licenseId,
        platform: device.platform,
        displayName: device.displayName,
        proofHash: "",
        publicKey: device.publicKey,
        status: "active",
        activatedAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null,
      })
      .where(eq(licensedDevicesTable.id, existing.id));
  } else {
    await db.insert(licensedDevicesTable).values({
      id: randomUUID(),
      licenseId,
      deviceId: device.deviceId,
      platform: device.platform,
      displayName: device.displayName,
      proofHash: "",
      publicKey: device.publicKey,
      status: "active",
    });
  }
}

export async function activateLicense(
  code: string,
  partitaIva: string,
  device: DeviceIdentity,
): Promise<LicenseStatus> {
  const payload = decodeLicenseCode(code);
  const normalizedPiva = normalizePiva(partitaIva);
  if (payload.piva !== normalizedPiva) {
    throw new Error("Questa licenza è intestata a una Partita IVA diversa.");
  }
  if (payload.plan === "annuale" && payload.expiresOn && daysUntil(payload.expiresOn) < 0) {
    throw new Error("Questa licenza è già scaduta.");
  }
  // REST remains a future, explicitly enabled channel. A code cannot accidentally
  // switch the working browser flow today.
  if (payload.channel === "rest") {
    throw new Error("Il canale API REST ADE non è ancora attivo per questa installazione.");
  }

  const current = await getLicenseByPiva(normalizedPiva);

  const values = {
    // A seller can issue a fresh signed annual code to renew an existing customer.
    // Keep the original license identity so the customer does not get a second
    // commercial record simply because their expiry date was extended.
    id: current?.id ?? payload.id,
    partitaIva: normalizedPiva,
    status: "active",
    plan: payload.plan,
    fiscalChannel: "browser",
    activatedAt: new Date(),
    expiresOn: payload.expiresOn,
    updatedAt: new Date(),
  } as const;

  const fingerprint = licenseCodeFingerprint(code);
  const [license] = await db
    .transaction(async tx => {
      const [upsertedLicense] = await tx
        .insert(licensesTable)
        .values({ ...values, activeDeviceId: current?.activeDeviceId ?? null })
        .onConflictDoUpdate({
          target: licensesTable.partitaIva,
          set: {
            status: values.status,
            plan: values.plan,
            fiscalChannel: values.fiscalChannel,
            activatedAt: values.activatedAt,
            expiresOn: values.expiresOn,
            updatedAt: values.updatedAt,
          },
        })
        .returning();
      const [redeemed] = await tx
        .insert(licenseCodeRedemptionsTable)
        .values({ codeFingerprint: fingerprint, licenseId: upsertedLicense.id, partitaIva: normalizedPiva })
        .onConflictDoNothing()
        .returning();
      if (!redeemed) throw new Error("Questo codice licenza è già stato utilizzato.");
      return [upsertedLicense];
    })

  await activateDevice(license.id, device);
  const [activated] = await db
    .update(licensesTable)
    .set({ activeDeviceId: device.deviceId, updatedAt: new Date() })
    .where(eq(licensesTable.id, license.id))
    .returning();
  return makeStatus(activated, device.deviceId, true);
}

export async function createTransfer(
  partitaIva: string,
  device: DeviceIdentity,
): Promise<{ token: string; pin: string; expiresAt: string }> {
  const license = await getLicenseByPiva(partitaIva);
  const status = await getLicenseStatus(partitaIva, device);
  if (!license || !status.canEmit || license.activeDeviceId !== device.deviceId) {
    throw new Error("Il trasferimento può essere iniziato solo dal dispositivo con licenza attiva.");
  }
  const token = randomUUID();
  const pin = String(randomInt(10000)).padStart(4, "0");
  await db.insert(licenseTransfersTable).values({
    id: randomUUID(),
    licenseId: license.id,
    sourceDeviceId: device.deviceId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    pinHash: createHash("sha256").update(pin).digest("hex"),
    expiresAt: new Date(Date.now() + TRANSFER_TOKEN_TTL_MS),
  });
  return {
    token,
    pin,
    expiresAt: new Date(Date.now() + TRANSFER_TOKEN_TTL_MS).toISOString(),
  };
}

export async function consumeTransfer(
  token: string,
  pin: string,
  partitaIva: string,
  targetDevice: DeviceIdentity,
): Promise<LicenseStatus> {
  const [entry] = await db
    .select()
    .from(licenseTransfersTable)
    .where(eq(licenseTransfersTable.tokenHash, createHash("sha256").update(token).digest("hex")))
    .limit(1);
  if (!entry || entry.consumedAt || entry.expiresAt < new Date()) throw new Error("QR di trasferimento non valido o scaduto.");
  if (entry.pinHash !== createHash("sha256").update(pin).digest("hex")) {
    const attempts = Number(entry.failedAttempts) + 1;
    await db
      .update(licenseTransfersTable)
      .set({ failedAttempts: String(attempts), consumedAt: attempts >= MAX_TRANSFER_PIN_ATTEMPTS ? new Date() : null })
      .where(eq(licenseTransfersTable.id, entry.id));
    throw new Error("PIN di trasferimento non corretto.");
  }
  const normalizedPiva = normalizePiva(partitaIva);
  const licenseForTransfer = await getLicenseByPiva(normalizedPiva);
  if (!licenseForTransfer || licenseForTransfer.id !== entry.licenseId) {
    throw new Error("Il QR appartiene a un’azienda diversa.");
  }

  const [license] = await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.id, entry.licenseId))
    .limit(1);
  if (!license || license.activeDeviceId !== entry.sourceDeviceId) {
    throw new Error("Il dispositivo di origine non è più autorizzato al trasferimento.");
  }

  await activateDevice(license.id, targetDevice);
  const [updated] = await db
    .update(licensesTable)
    .set({ activeDeviceId: targetDevice.deviceId, updatedAt: new Date() })
    .where(eq(licensesTable.id, license.id))
    .returning();
  await db
    .update(licenseTransfersTable)
    .set({ consumedAt: new Date() })
    .where(eq(licenseTransfersTable.id, entry.id));
  return makeStatus(updated, targetDevice.deviceId, true);
}

export async function createLicenseRequest(
  partitaIva: string,
  type: "activation" | "renewal" | "recovery",
  note: string,
): Promise<string> {
  const license = await getLicenseByPiva(partitaIva);
  const id = randomUUID();
  await db.insert(licenseRequestsTable).values({
    id,
    licenseId: license?.id ?? null,
    partitaIva: normalizePiva(partitaIva),
    type,
    note: note.trim().slice(0, 500),
  });
  return id;
}

export function makeDeviceIdentity(input: {
  deviceId: string | undefined;
  platform: string | undefined;
  displayName: string | undefined;
  publicKey: string | undefined;
  issuedAt: string | undefined;
  nonce: string | undefined;
  signature: string | undefined;
}): DeviceIdentity | null {
  if (
    !input.deviceId ||
    !input.publicKey ||
    !input.issuedAt ||
    !input.nonce ||
    !input.signature ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(input.deviceId) ||
    !/^[A-Za-z0-9_-]{100,1200}$/.test(input.publicKey) ||
    !/^\d{13}$/.test(input.issuedAt) ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(input.nonce) ||
    !/^[A-Za-z0-9_-]{80,160}$/.test(input.signature)
  ) return null;
  const platform: DevicePlatform = input.platform === "mobile" ? "mobile" : "desktop";
  const fallback = platform === "mobile" ? "POS Android" : "Laptop / Desktop";
  return {
    deviceId: input.deviceId,
    platform,
    displayName: (input.displayName?.trim() || fallback).slice(0, 80),
    publicKey: input.publicKey,
    issuedAt: input.issuedAt,
    nonce: input.nonce,
    signature: input.signature,
  };
}

export function licenseCodeFingerprint(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 12);
}