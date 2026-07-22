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

// ─── Browser lifecycle (per-request, no singleton) ───────────────────────────
// Each login spawns a fresh Chrome and kills it when done (success or failure).
// This avoids port conflicts when consecutive logins happen.

const DEBUG_PORT = 19333;

/** Kill any existing process on the debug port before spawning a new Chrome. */
function killStaleChromeOnPort(): void {
  try {
    execSync(`fuser -k ${DEBUG_PORT}/tcp 2>/dev/null || true`, { stdio: "ignore", timeout: 3000 });
  } catch { /* ignore */ }
}

/** Spawn Chrome and return the DevTools WebSocket URL. */
function spawnChrome(executablePath: string): Promise<{ wsUrl: string; proc: ReturnType<typeof spawn> }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(executablePath, [
      "--headless",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      `--remote-debugging-port=${DEBUG_PORT}`,
    ], { stdio: ["ignore", "ignore", "pipe"] });

    let wsUrl = "";
    const timer = setTimeout(() => {
      if (!wsUrl) {
        proc.kill("SIGKILL");
        reject(new Error("Chrome did not emit DevTools URL within 15s"));
      }
    }, 15000);

    proc.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match && !wsUrl) {
        wsUrl = match[1]!;
        clearTimeout(timer);
        resolve({ wsUrl, proc });
      }
    });

    proc.on("exit", (code) => {
      if (!wsUrl) reject(new Error(`Chrome exited (code ${code}) before emitting DevTools URL`));
    });
  });
}

/** Spawn Chrome, connect Puppeteer, return browser + cleanup function. */
async function startBrowser(): Promise<{ browser: Browser; cleanup: () => void }> {
  killStaleChromeOnPort();
  await new Promise((r) => setTimeout(r, 500)); // brief pause so port is free

  const nixChromium = resolveNixChromium();
  logger.info({ executablePath: nixChromium }, "Spawning Chrome and connecting via WebSocket");

  const { wsUrl, proc } = await spawnChrome(nixChromium);
  logger.info({ wsUrl }, "Chrome ready, connecting Puppeteer");

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    protocolTimeout: 180000,
  });
  logger.info("Puppeteer connected to Chrome successfully");

  const cleanup = () => {
    try { browser.disconnect(); } catch { /* ignore */ }
    try { proc.kill("SIGKILL"); } catch { /* ignore */ }
  };

  return { browser, cleanup };
}

// ─── Login flow ───────────────────────────────────────────────────────────────

export async function loginWithSiampe(
  credentials: LoginCredentials,
): Promise<LoginCookies> {
  const { browser, cleanup } = await startBrowser();
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

    // The SIAMPE login page opens on the SPID tab — switch to Fisconline/Entratel.
    // IMPORTANT: synthetic .click() doesn't trigger React event handlers on this SPA.
    // We must use real mouse coordinates (page.mouse.click) so React updates the tab state.
    logger.info("Clicking Fisconline/Entratel tab");
    await new Promise((r) => setTimeout(r, 2000)); // let React fully initialize

    // Get the element's center coordinates
    const tabCoords = await page.evaluate(`(function(){
      var els = Array.from(document.querySelectorAll('[role="tab"], button, li, a, span'));
      var tab = els.find(function(el){
        var t = el.textContent && el.textContent.trim();
        return t && t.includes('Fisconline');
      });
      if (!tab) return null;
      tab.scrollIntoView({ block: 'center' });
      var r = tab.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`) as { x: number; y: number } | null;

    if (tabCoords) {
      logger.info({ tabCoords }, "Found Fisconline tab, clicking via mouse");
      await page.mouse.click(tabCoords.x, tabCoords.y);
    } else {
      logger.warn("Fisconline tab not found via coordinates — falling back to evaluate click");
      await page.evaluate(`
        var els = Array.from(document.querySelectorAll('[role="tab"], button, li, a, span'));
        var tab = els.find(function(el){ return el.textContent && el.textContent.trim().includes('Fisconline'); });
        if (tab) tab.click();
      `);
    }

    // Wait for the tab content to switch (CF input must become visible)
    let cfVisible = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      cfVisible = await page.evaluate(`(function(){
        var inputs = Array.from(document.querySelectorAll('input'));
        return inputs.some(function(inp){
          if (!inp.placeholder) return false;
          var s = inp.getBoundingClientRect();
          return s.width > 0 && s.height > 0 && inp.placeholder.toLowerCase().includes('codice');
        });
      })()`) as boolean;
      if (cfVisible) break;
    }
    logger.info({ cfVisible }, "After tab click — CF input visible");

    await page.screenshot({ path: "/tmp/siampe-step-tab.png", fullPage: false }).catch(() => {});

    // Step 1: Fill codice fiscale — only match visible inputs (tab must be active)
    logger.info("Waiting for visible codice fiscale input");
    const cfSelector = await waitForVisibleInput(page, [
      'input[name="codiceFiscale"]',
      'input[id="codiceFiscale"]',
      'input[autocomplete="username"]',
      'input[placeholder*="codice fiscale" i]',
      'input[placeholder*="Codice Fiscale" i]',
    ], 15000);
    logger.info({ cfSelector }, "Filling codice fiscale");
    await clearAndType(page, cfSelector, credentials.codiceFiscale);

    // Step 2: Fill password — the form has CF + Password + PIN all on ONE page
    logger.info("Filling password");
    const pwdSelector = await waitForVisibleInput(page, [
      'input[name="password"]',
      'input[id="password"]',
      'input[type="password"]',
    ], 10000);
    await clearAndType(page, pwdSelector, credentials.password);

    // Step 3: Fill PIN — same page, third field next to password
    logger.info("Filling PIN");
    // The SIAMPE Fisconline form shows Password and PIN side by side on the same page.
    // We need the SECOND password-type input (PIN), or any input matching PIN label.
    const pinSelector = await waitForVisibleInput(page, [
      'input[placeholder*="PIN" i]',
      'input[placeholder*="pin" i]',
      'input[name*="pin" i]',
      'input[id*="pin" i]',
    ], 5000).catch(async () => {
      // Fallback: get the second visible input[type=password] (PIN is right of password)
      const secondPwd = await page.evaluate(`(function(){
        var inputs = Array.from(document.querySelectorAll('input[type="password"], input[type="text"]'));
        var visible = inputs.filter(function(inp){
          var r = inp.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        // Return selector for the second visible input (PIN comes after Password)
        return visible.length >= 2 ? null : null;
      })()`);
      void secondPwd;
      // Use evaluate-based fill for the second password input
      return "__second_password__";
    });

    if (pinSelector === "__second_password__") {
      // Fill PIN by targeting the second visible password-like input
      await page.evaluate(`(function(pin){
        var inputs = Array.from(document.querySelectorAll('input[type="password"], input[type="text"]'));
        var visible = inputs.filter(function(inp){
          var r = inp.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        var pinInput = visible[1]; // second visible input = PIN
        if (pinInput) {
          pinInput.focus();
          pinInput.value = pin;
          pinInput.dispatchEvent(new Event('input', {bubbles:true}));
          pinInput.dispatchEvent(new Event('change', {bubbles:true}));
        }
      })('${credentials.pin.replace(/'/g, "\\'")}')`) ;
      logger.info("Filled PIN via second-password fallback");
    } else {
      await clearAndType(page, pinSelector, credentials.pin);
      logger.info({ pinSelector }, "Filled PIN via selector");
    }

    await page.screenshot({ path: "/tmp/siampe-step2-filled.png", fullPage: false }).catch(() => {});

    // Step 4: Submit the Fisconline form (CF + password + PIN → single "Accedi" click)
    logger.info("Submitting Fisconline form");
    await clickButton(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Accedi")',
      'button:has-text("Entra")',
      'button:has-text("Conferma")',
    ]);

    await page.screenshot({ path: "/tmp/siampe-step3-after-submit.png", fullPage: false }).catch(() => {});
    const urlAfterSubmit = page.url();
    logger.info({ url: urlAfterSubmit }, "After form submit");

    // Check for SIAMPE error messages immediately after submit (before waiting for redirect)
    const pageText = await page.evaluate("document.body?.innerText || ''").catch(() => "") as string;
    logger.info({ pageText: pageText.substring(0, 200) }, "Page text after submit");

    const credErr =
      pageText.includes("Credenziali errate") ||
      pageText.includes("Autenticazione fallita") ||
      pageText.includes("credenziali non corrette") ||
      pageText.includes("dati inseriti non sono corretti") ||
      urlAfterSubmit.includes("www.agenziaentrate.gov.it/portale") ||
      urlAfterSubmit.includes("/portale/web/guest");

    if (credErr) {
      throw new Error("Credenziali non valide: codice fiscale, password o PIN errati");
    }

    // Wait for redirect back to AE (success path)
    logger.info("Waiting for redirect back to AE");
    await page.waitForFunction(
      "window.location.hostname.includes('agenziaentrate.gov.it') && !window.location.hostname.includes('iampe')",
      { timeout: 60000 },
    );

    await page.screenshot({ path: "/tmp/siampe-step5-after-login.png", fullPage: false }).catch(() => {});
    logger.info({ url: page.url() }, "Landed on AE after login");

    // Navigate to DCO to complete SSO and collect ivaservizi-specific cookies
    logger.info("Navigating to DCO portal to get DCO cookies");
    await page.goto(DCO_URL, { waitUntil: "networkidle2", timeout: 45000 }).catch(async () => {
      // networkidle2 may timeout on slow connections — wait for domcontentloaded + extra time
      await page.goto(DCO_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 5000));
    });
    // Extra wait to allow any subsequent XHR/fetch auth calls to complete
    await new Promise((r) => setTimeout(r, 3000));
    logger.info({ url: page.url() }, "DCO navigation complete");

    const allCookies = await page.cookies();
    logger.info(
      { count: allCookies.length, names: allCookies.map((c) => `${c.domain}:${c.name}`) },
      "Cookies after DCO navigation",
    );

    const cookies = await extractCookiesAndInfo(page, credentials);
    if (!cookies) {
      throw new Error("Could not extract session cookies after login");
    }

    logger.info({ ragioneSociale: cookies.ragioneSociale, cookieCount: allCookies.length }, "SIAMPE login successful");
    return cookies;
  } catch (err) {
    logger.error({ err, url: page.url() }, "SIAMPE login failed");
    await page.screenshot({ path: "/tmp/siampe-error.png", fullPage: false }).catch(() => {});
    const html = await page.evaluate(
      "document.body?.innerHTML?.substring(0,2000)||''",
    ).catch(() => "") as string;
    logger.error({ html }, "Page HTML at failure");
    throw err;
  } finally {
    await page.close().catch(() => {});
    cleanup();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wait for the first VISIBLE input matching one of the selectors */
async function waitForVisibleInput(
  page: Page,
  selectors: string[],
  timeout: number,
): Promise<string> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        const visible = await page.evaluate(`(function(){
          var el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return false;
          var r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })()`);
        if (visible) return selector;
      } catch { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No visible input found within ${timeout}ms: ${selectors.join(", ")}`);
}

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
  // First try: selector-based click with short nav wait (wrong creds → no nav, correct → redirects)
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {}),
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
  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {});
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

