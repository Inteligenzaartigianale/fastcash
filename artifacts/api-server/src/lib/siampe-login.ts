/**
 * SIAMPE login automation using Puppeteer.
 *
 * The AE "Documenti Commerciali Online" portal uses SIAMPE SSO.
 * Login flow:
 *   1. Navigate to DCO portal → redirected to SIAMPE login
 *   2. Enter codice fiscale + password
 *   3. Enter PIN
 *   4. Wait for redirect back to AE portal
 *   5. Extract session cookies
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import { execSync } from "node:child_process";
import { logger } from "./logger.js";

function findSystemChromium(): string | undefined {
  try {
    return execSync("which chromium || which chromium-browser || which google-chrome", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim().split("\n")[0];
  } catch {
    return undefined;
  }
}

const DCO_URL =
  "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/?v=1729523483132#/generazione/wizard2";

export interface LoginCredentials {
  codiceFiscale: string;
  password: string;
  pin: string;
}

export interface LoginCookies {
  cookieHeader: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    const executablePath = findSystemChromium();
    logger.info({ executablePath }, "Launching Puppeteer browser");
    browserInstance = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
      ],
    });
  }
  return browserInstance;
}

export async function loginWithSiampe(
  credentials: LoginCredentials,
): Promise<LoginCookies> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    );

    logger.info("Navigating to AE DCO portal");
    await page.goto(DCO_URL, { waitUntil: "networkidle2", timeout: 30000 });

    const currentUrl = page.url();
    logger.info({ url: currentUrl }, "After initial navigation");

    // Already on AE (e.g. session cached) — extract cookies
    if (currentUrl.includes("ivaservizi.agenziaentrate.gov.it")) {
      const cookies = await extractCookiesAndInfo(page, credentials);
      if (cookies) {
        logger.info("Reused cached SIAMPE session");
        await page.close();
        return cookies;
      }
    }

    // Step 1: Fill codice fiscale
    logger.info("Filling codice fiscale");
    await fillInput(page, credentials.codiceFiscale, [
      'input[name="codiceFiscale"]',
      'input[id="codiceFiscale"]',
      'input[autocomplete="username"]',
      'input[type="text"]:first-of-type',
    ]);

    // Step 2: Fill password
    logger.info("Filling password");
    await fillInput(page, credentials.password, [
      'input[name="password"]',
      'input[id="password"]',
      'input[type="password"]:first-of-type',
    ]);

    // Step 3: Submit first form
    logger.info("Submitting login form step 1");
    await clickAndWait(page, [
      'button[type="submit"]',
      'input[type="submit"]',
    ]);

    // Step 4: Fill PIN
    logger.info("Waiting for PIN input");
    await page.waitForSelector(
      'input[name="pin"], input[id="pin"], input[placeholder*="PIN" i], input[type="password"]',
      { timeout: 15000 },
    );
    logger.info("Filling PIN");
    await fillInput(page, credentials.pin, [
      'input[name="pin"]',
      'input[id="pin"]',
      'input[placeholder*="PIN" i]',
      'input[type="password"]',
    ]);

    // Step 5: Submit PIN form
    logger.info("Submitting PIN form");
    await clickAndWait(page, [
      'button[type="submit"]',
      'input[type="submit"]',
    ]);

    // Step 6: Wait to land back on AE portal (use string-based predicate to avoid TS DOM errors)
    logger.info("Waiting for redirect back to AE");
    await page.waitForFunction(
      "window.location.hostname.includes('ivaservizi.agenziaentrate.gov.it')",
      { timeout: 30000 },
    );

    const cookies = await extractCookiesAndInfo(page, credentials);
    if (!cookies) {
      throw new Error("Could not extract session cookies after login");
    }

    logger.info(
      { ragioneSociale: cookies.ragioneSociale },
      "SIAMPE login successful",
    );
    await page.close();
    return cookies;
  } catch (err) {
    logger.error({ err }, "SIAMPE login failed");
    await page.close().catch(() => {});
    throw err;
  }
}

async function extractCookiesAndInfo(
  page: Page,
  credentials: LoginCredentials,
): Promise<LoginCookies | null> {
  const cookies = await page.cookies();
  const aeCookies = cookies.filter(
    (c) =>
      c.domain.includes("agenziaentrate.gov.it") ||
      c.domain.includes("ivaservizi"),
  );

  if (aeCookies.length === 0) return null;

  const cookieHeader = aeCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // Try to read company name from page (string-based to avoid DOM type errors)
  let ragioneSociale = "";
  try {
    const text = await page.evaluate(
      "document.querySelector('.utente, .user-info, [class*=\"utente\"], [class*=\"user\"]')?.textContent?.trim() || ''",
    ) as string;
    if (text) ragioneSociale = text.split("\n")[0]?.trim() ?? "";
  } catch {
    // ignore — will be filled later from /me
  }

  return {
    cookieHeader,
    ragioneSociale,
    partitaIva: credentials.codiceFiscale,
    codiceFiscale: credentials.codiceFiscale,
  };
}

async function fillInput(
  page: Page,
  value: string,
  selectors: string[],
): Promise<void> {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.evaluate(
        `(function() { var el = document.querySelector('${selector.replace(/'/g, "\\'")}'); if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); } })()`,
      );
      await page.type(selector, value, { delay: 30 });
      return;
    } catch {
      continue;
    }
  }
  throw new Error(
    `Could not find input with selectors: ${selectors.join(", ")}`,
  );
}

async function clickAndWait(
  page: Page,
  selectors: string[],
): Promise<void> {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
        page.click(selector),
      ]);
      return;
    } catch {
      continue;
    }
  }
  throw new Error(
    `Could not find button with selectors: ${selectors.join(", ")}`,
  );
}
