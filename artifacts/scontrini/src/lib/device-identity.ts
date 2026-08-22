import { isCapacitor } from "./capacitor";

const DEVICE_ID_KEY = "scontrini_device_id";
const KEY_DB = "scontrini-device-key-store";
const KEY_STORE = "keys";
const KEY_ID = "signing-key";

type StoredKeyPair = CryptoKeyPair;

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(KEY_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getSigningKey(): Promise<StoredKeyPair> {
  const database = await openKeyDb();
  const existing = await new Promise<StoredKeyPair | undefined>((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE, "readonly");
    const request = transaction.objectStore(KEY_STORE).get(KEY_ID);
    request.onsuccess = () => resolve(request.result as StoredKeyPair | undefined);
    request.onerror = () => reject(request.error);
  });
  if (existing) return existing;

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE, "readwrite");
    transaction.objectStore(KEY_STORE).put(keyPair, KEY_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  return keyPair;
}

function base64Url(bytes: ArrayBuffer): string {
  const text = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A stable, non-secret identifier used to find the registered device record. */
export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && /^[a-zA-Z0-9_-]{16,100}$/.test(existing)) return existing;
  const id = createDeviceId();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

/**
 * Produces an installation-bound signature. The private key is non-extractable
 * and stored in IndexedDB, so copying localStorage alone cannot clone a license.
 */
export async function getDeviceHeaders(): Promise<Record<string, string>> {
  const platform = isCapacitor ? "mobile" : "desktop";
  const displayName = isCapacitor
    ? "POS Android"
    : `Laptop / ${navigator.platform || "Desktop"}`;
  const deviceId = getDeviceId();
  const issuedAt = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signingInput = `${deviceId}.${issuedAt}.${nonce}`;
  const keys = await getSigningKey();
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    new TextEncoder().encode(signingInput),
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return {
    "X-Scontrini-Device-Id": deviceId,
    "X-Scontrini-Device-Platform": platform,
    "X-Scontrini-Device-Name": displayName.slice(0, 80),
    "X-Scontrini-Device-Key": btoa(JSON.stringify(publicKey)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    "X-Scontrini-Device-Issued-At": issuedAt,
    "X-Scontrini-Device-Nonce": nonce,
    "X-Scontrini-Device-Signature": base64Url(signature),
  };
}