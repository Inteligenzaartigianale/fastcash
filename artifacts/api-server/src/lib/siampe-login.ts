/**
 * SIAMPE login automation using Puppeteer + Chromium.
 *
 * On Replit (NixOS), Chrome's bundled binary needs LD_LIBRARY_PATH pointing
 * at nix-store library paths. We compute these at startup and pass them via
 * the `env` option in puppeteer.launch().
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import { execSync, spawn } from "node:child_process";
import { logger } from "./logger.js";

// Navigate directly to SIAMPE login — more reliable than going through the DCO SPA
// which sometimes serves nonauth.html when Chrome 92 has stale cookies.
const SIAMPE_LOGIN_URL =
  "https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate&goto=" +
  encodeURIComponent("https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/");

// After login, hit this URL to ensure DCO-specific session cookies are set
const DCO_URL =
  "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/";

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

// ─── Chrome environment setup for Replit NixOS ───────────────────────────────
// Chrome 150 (Puppeteer's bundled binary) needs LD_LIBRARY_PATH pointing to
// nix-store paths. These are resolved once via nix-instantiate at startup.

function resolveNixLibPaths(): string {
  // Try one-shot batch nix-instantiate (fast: ~1s)
  try {
    const expr = [
      'let pkgs = import <nixpkgs> {};',
      'in builtins.concatStringsSep ":" (map builtins.toString [',
      '  (pkgs.glib.out + "/lib")',
      '  (pkgs.nss.out + "/lib")',
      '  (pkgs.nspr.out + "/lib")',
      '  (pkgs.atk.out + "/lib")',
      '  (pkgs.cups.lib + "/lib")',
      '  (pkgs.libdrm.out + "/lib")',
      '  (pkgs.dbus.lib + "/lib")',
      '  (pkgs.gtk3.out + "/lib")',
      '  (pkgs.mesa.out + "/lib")',
      '  (pkgs.expat.out + "/lib")',
      '  (pkgs.libxkbcommon.out + "/lib")',
      '  (pkgs.alsa-lib.out + "/lib")',
      '  (pkgs.cairo.out + "/lib")',
      '  (pkgs.pango.out + "/lib")',
      '  (pkgs.at-spi2-atk.out + "/lib")',
      '  (pkgs.at-spi2-core.out + "/lib")',
      '  (pkgs.gdk-pixbuf.out + "/lib")',
      '  (pkgs.xorg.libX11.out + "/lib")',
      '  (pkgs.xorg.libXcomposite.out + "/lib")',
      '  (pkgs.xorg.libXdamage.out + "/lib")',
      '  (pkgs.xorg.libXext.out + "/lib")',
      '  (pkgs.xorg.libXfixes.out + "/lib")',
      '  (pkgs.xorg.libXrandr.out + "/lib")',
      '  (pkgs.xorg.libXrender.out + "/lib")',
      '  (pkgs.xorg.libxcb.out + "/lib")',
      '])',
    ].join(" ");
    const result = execSync(`nix-instantiate --eval -E '${expr}'`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 20000,
    }).trim().replace(/^"|"$/g, "");
    if (result) return result;
  } catch { /* fallback below */ }

  // Fallback: hardcoded paths known to work on this Replit container
  return [
    "/nix/store/3jz43ya7j65mh53nj262rilsk1j2jb68-glib-2.68.3/lib",
    "/nix/store/31y3w7j78rcmlsrhkk37bmcj3aksbcqw-nss-3.68/lib",
    "/nix/store/na5x54qp12infkfbiw6ldbzlyidxkzzf-nspr-4.32/lib",
    "/nix/store/1bmhxjz5bjpdsn68hwkbr8rscmi68j3w-atk-2.36.0/lib",
    "/nix/store/kbz3s60sndry87c2csg4svbbld3224q8-cups-2.3.3-lib/lib",
    "/nix/store/ygm0c17302w6d07gk3sfm0fvkgk50bx4-libdrm-2.4.107/lib",
    "/nix/store/xwjr0d6pjmn39gxykd2pq6bv1d18bqkh-dbus-1.12.20-lib/lib",
    "/nix/store/qvmdkg2f09pvlsdr4bqasyiy5g0mbvrd-gtk+3-3.24.30/lib",
    "/nix/store/c5gsjk32f9dwgyhxp6pdq4sh9wbswsf3-mesa-21.1.7/lib",
    "/nix/store/irsmdyfvxkh67f2c1r7gm8r7b3lirv63-expat-2.4.1/lib",
    "/nix/store/jj3qn3wbzjqvwnz5cmhkc949r5iv783s-libxkbcommon-1.3.0/lib",
    "/nix/store/39bjnqk8l13bn1xnq1bc1baf3z957rkh-alsa-lib-1.2.5.1/lib",
    "/nix/store/0bdcnb6wnd9dg4wj4aqjwkizzz7lldps-cairo-1.16.0/lib",
    "/nix/store/jkm1fny0xscalpqh3pl0fclx8pjz62dc-pango-1.48.5/lib",
    "/nix/store/4knwrajbbpnfzqgqw54s8zlv5sncm5dp-at-spi2-atk-2.38.0/lib",
    "/nix/store/wscs407qx95rqj553gmw00jkwdhfc2pq-at-spi2-core-2.40.3/lib",
    "/nix/store/0zwn0axi6bmzkf6vsqf6w85pfam7r6is-gdk-pixbuf-2.42.6/lib",
    "/nix/store/k4n7c5m82dvh51ym88n6f2aws8m90g0m-libX11-1.7.2/lib",
    "/nix/store/8arzrsr4smih7l52hmvmxsjwrvkcrsgp-libXcomposite-0.4.5/lib",
    "/nix/store/hg241r4rpf8djryryxj6ylfngl6zaxsh-libXdamage-1.1.5/lib",
    "/nix/store/pqbf78jqja4i0804d8f810nkic9y9ahx-libXext-1.3.4/lib",
    "/nix/store/drg97qy1sqw4zk2zbvn2f398vzrm5f8x-libXfixes-6.0.0/lib",
    "/nix/store/6hfav2jxqfj9m0i9gz17yndpd5ws10bn-libXrandr-1.5.2/lib",
    "/nix/store/zl7vv0i5gfb433wq27r022jgrp307rbz-libXrender-0.9.10/lib",
    "/nix/store/vh35dr1f33gxn05y50vqzc5zqgjfpn07-libxcb-1.14/lib",
  ].join(":");
}

// Resolve the nix-managed Chromium binary (avoids glibc conflicts)
function resolveNixChromium(): string {
  // Hardcoded fallback — verified present on this container
  const hardcoded = "/nix/store/ia69plrrvn7czdhn3flq1ll39i92ixab-chromium-92.0.4515.159/bin/chromium";
  try {
    const result = execSync(
      `nix-instantiate --eval -E 'builtins.toString (import <nixpkgs> {}).chromium + "/bin/chromium"'`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15000 },
    ).trim().replace(/^"|"$/g, "");
    return result || hardcoded;
  } catch {
    return hardcoded;
  }
}

// ─── Browser singleton ────────────────────────────────────────────────────────
// We spawn Chrome 92 manually and connect via puppeteer.connect() to avoid
// puppeteer.launch() timeout issues (Puppeteer 25 CDP init incompatible with Chrome 92).

let browserInstance: Browser | null = null;
let chromeProcess: ReturnType<typeof spawn> | null = null;

function spawnChrome(executablePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const debugPort = 19333;
    const proc = spawn(executablePath, [
      "--headless",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      `--remote-debugging-port=${debugPort}`,
    ], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    chromeProcess = proc;

    let wsUrl = "";
    const timer = setTimeout(() => {
      if (!wsUrl) reject(new Error("Chrome did not emit DevTools URL within 15s"));
    }, 15000);

    proc.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match && !wsUrl) {
        wsUrl = match[1]!;
        clearTimeout(timer);
        resolve(wsUrl);
      }
    });

    proc.on("exit", (code) => {
      if (!wsUrl) reject(new Error(`Chrome exited with code ${code} before emitting DevTools URL`));
      browserInstance = null;
    });
  });
}

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    const nixChromium = resolveNixChromium();
    logger.info({ executablePath: nixChromium }, "Spawning Chrome and connecting via WebSocket");

    const wsUrl = await spawnChrome(nixChromium);
    logger.info({ wsUrl }, "Chrome ready, connecting Puppeteer");

    browserInstance = await puppeteer.connect({
      browserWSEndpoint: wsUrl,
      protocolTimeout: 180000,
    });
    logger.info("Puppeteer connected to Chrome successfully");
  }
  return browserInstance;
}

// ─── Login flow ───────────────────────────────────────────────────────────────

export async function loginWithSiampe(
  credentials: LoginCredentials,
): Promise<LoginCookies> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);

    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    // Clear all cookies before each attempt to avoid stale session state
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    logger.info("Cleared browser cookies");

    // Navigate directly to SIAMPE login page (more reliable than going through DCO SPA)
    logger.info("Navigating to SIAMPE login");
    await page.goto(SIAMPE_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await new Promise((r) => setTimeout(r, 2000));

    await page.screenshot({ path: "/tmp/siampe-step1.png", fullPage: false }).catch(() => {});
    logger.info({ url: page.url() }, "After SIAMPE navigation");

    // The SIAMPE login page opens on the SPID tab — switch to Fisconline/Entratel via text match
    logger.info("Clicking Fisconline/Entratel tab");
    // Wait for any tab to render, then click the one containing "Fisconline"
    await waitForAnySelector(page, ['button, [role="tab"], li, a'], 10000).catch(() => {});
    await page.evaluate(`
      var els = Array.from(document.querySelectorAll('button, [role="tab"], li, a, span'));
      var tab = els.find(function(el){ return el.textContent && el.textContent.trim().includes('Fisconline'); });
      if (tab) tab.click();
    `);
    await new Promise((r) => setTimeout(r, 1500));

    await page.screenshot({ path: "/tmp/siampe-step-tab.png", fullPage: false }).catch(() => {});
    logger.info({ url: page.url() }, "After tab click");

    // Step 1: Fill codice fiscale
    logger.info("Waiting for codice fiscale input");
    const cfSelector = await waitForAnySelector(page, [
      'input[name="codiceFiscale"]',
      'input[id="codiceFiscale"]',
      'input[autocomplete="username"]',
      'input[placeholder*="codice fiscale" i]',
      'input[placeholder*="Codice Fiscale" i]',
    ], 15000);
    logger.info({ cfSelector }, "Filling codice fiscale");
    await clearAndType(page, cfSelector, credentials.codiceFiscale);

    // Step 2: Fill password
    logger.info("Filling password");
    const pwdSelector = await waitForAnySelector(page, [
      'input[name="password"]',
      'input[id="password"]',
      'input[type="password"]',
    ], 10000);
    await clearAndType(page, pwdSelector, credentials.password);

    await page.screenshot({ path: "/tmp/siampe-step2-filled.png", fullPage: false }).catch(() => {});

    // Step 3: Submit credentials — try multiple button strategies
    logger.info("Submitting login form step 1");
    await clickButton(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Entra")',
      'button:has-text("Accedi")',
      'button:has-text("Conferma")',
    ]);

    await page.screenshot({ path: "/tmp/siampe-step3-after-submit.png", fullPage: false }).catch(() => {});
    const urlAfterStep1 = page.url();
    logger.info({ url: urlAfterStep1 }, "After step 1 submit");

    // Detect wrong credentials: SIAMPE redirects to public portale on failure
    if (
      urlAfterStep1.includes("www.agenziaentrate.gov.it/portale") ||
      urlAfterStep1.includes("/portale/web/guest")
    ) {
      throw new Error("Credenziali non valide: codice fiscale o password errati");
    }

    // Also check for explicit error message on SIAMPE page
    const siampeError = await page.evaluate(
      "document.querySelector('.alert-danger, .error-message, [class*=\"error\"], [class*=\"alert\"]')?.textContent?.trim() || ''",
    ).catch(() => "") as string;
    if (siampeError && (siampeError.toLowerCase().includes("errat") || siampeError.toLowerCase().includes("non valid"))) {
      throw new Error(`Credenziali non valide: ${siampeError}`);
    }

    // Step 4: Fill PIN (second factor) — only if still on SIAMPE domain
    logger.info({ url: urlAfterStep1 }, "Waiting for PIN input");
    const pinSelector = await waitForAnySelector(page, [
      'input[name="pin"]',
      'input[id="pin"]',
      'input[placeholder*="PIN" i]',
      'input[placeholder*="pin" i]',
      'input[name*="otp" i]',
      'input[placeholder*="codice" i]',
      'input[type="password"]',
      'input[type="text"]',
    ], 20000);
    logger.info({ pinSelector }, "Filling PIN");
    await clearAndType(page, pinSelector, credentials.pin);

    await page.screenshot({ path: "/tmp/siampe-step4-pin.png", fullPage: false }).catch(() => {});

    // Step 5: Submit PIN form
    logger.info("Submitting PIN form");
    await clickButton(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Entra")',
      'button:has-text("Conferma")',
      'button:has-text("Accedi")',
    ]);

    // Step 6: Wait for redirect back to AE (ivaservizi or portale)
    logger.info("Waiting for redirect back to AE");
    await page.waitForFunction(
      "window.location.hostname.includes('agenziaentrate.gov.it') && !window.location.hostname.includes('iampe')",
      { timeout: 60000 },
    );

    await page.screenshot({ path: "/tmp/siampe-step5-after-login.png", fullPage: false }).catch(() => {});
    logger.info({ url: page.url() }, "Landed on AE after login");

    // If landed on portale (not ivaservizi), navigate to DCO to get DCO-specific cookies
    if (!page.url().includes("ivaservizi.agenziaentrate.gov.it")) {
      logger.info("Navigating to DCO portal to get DCO cookies");
      await page.goto(DCO_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 2000));
    }

    const cookies = await extractCookiesAndInfo(page, credentials);
    if (!cookies) {
      throw new Error("Could not extract session cookies after login");
    }

    logger.info({ ragioneSociale: cookies.ragioneSociale }, "SIAMPE login successful");
    await page.close();
    return cookies;
  } catch (err) {
    logger.error({ err, url: page.url() }, "SIAMPE login failed");
    await page.screenshot({ path: "/tmp/siampe-error.png", fullPage: false }).catch(() => {});
    const html = await page.evaluate(
      "document.body?.innerHTML?.substring(0,2000)||''",
    ).catch(() => "") as string;
    logger.error({ html }, "Page HTML at failure");
    await page.close().catch(() => {});
    // Reset browser so next attempt starts fresh
    browserInstance = null;
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wait for the first matching selector and return which one matched */
async function waitForAnySelector(
  page: Page,
  selectors: string[],
  timeout: number,
): Promise<string> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        const el = await page.$(selector);
        if (el) return selector;
      } catch { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`None of these selectors appeared within ${timeout}ms: ${selectors.join(", ")}`);
}

/** Clear an input and type value */
async function clearAndType(page: Page, selector: string, value: string): Promise<void> {
  const escaped = selector.replace(/'/g, "\\'");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(`(function(){var el=document.querySelector('${escaped}');if(el){el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}})()`) as any;
  await page.type(selector, value, { delay: 30 });
}

/** Click a button matching one of the selectors, wait for navigation */
async function clickButton(page: Page, selectors: string[]): Promise<void> {
  // First try: selector-based click with nav wait
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
          el.click(),
        ]);
        return;
      }
    } catch { continue; }
  }
  // Fallback: click by visible text
  const texts = selectors
    .map((s) => s.match(/:has-text\("(.+?)"\)/)?.[1])
    .filter((t): t is string => Boolean(t));
  const clicked = await page.evaluate(`(function(){
    var texts = ${JSON.stringify(texts)};
    var buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
    for (var i=0;i<texts.length;i++){
      var btn = buttons.find(function(b){return b.textContent&&b.textContent.trim().indexOf(texts[i])>=0;});
      if(btn){btn.click();return true;}
    }
    return false;
  })()`) as boolean;
  if (!clicked) throw new Error(`Could not find button: ${selectors.join(", ")}`);
  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
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

  let ragioneSociale = "";
  try {
    const text = await page.evaluate(
      "document.querySelector('.utente, .user-info, [class*=\"utente\"], [class*=\"user\"]')?.textContent?.trim() || ''",
    ) as string;
    if (text) ragioneSociale = text.split("\n")[0]?.trim() ?? "";
  } catch { /* ignore */ }

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
    } catch { continue; }
  }
  throw new Error(`Could not find input: ${selectors.join(", ")}`);
}

async function clickAndWait(
  page: Page,
  selectors: string[],
): Promise<void> {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
        page.click(selector),
      ]);
      return;
    } catch { continue; }
  }
  throw new Error(`Could not find button: ${selectors.join(", ")}`);
}
