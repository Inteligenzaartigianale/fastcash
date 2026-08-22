import { getApiBase } from "./capacitor";
import { getAuthHeaders } from "./auth-token";

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

interface ApiError {
  error?: string;
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}/api${path}`, {
    method,
    headers: {
      ...(await getAuthHeaders()),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as ApiError;
    throw new Error(data.error ?? `Errore licenza (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const fetchLicenseStatus = () => request<LicenseStatus>("/license/status");
export const activateLicense = (code: string) =>
  request<LicenseStatus>("/license/activate", "POST", { code });
export const generateLicenseTransfer = () =>
  request<{ token: string; pin: string; expiresAt: string }>("/license/transfer/generate", "POST");
export const consumeLicenseTransfer = (token: string, pin: string) =>
  request<LicenseStatus>("/license/transfer/consume", "POST", { token, pin });
export const requestLicenseSupport = (type: "activation" | "renewal" | "recovery", note = "") =>
  request<{ requestId: string }>("/license/request", "POST", { type, note });