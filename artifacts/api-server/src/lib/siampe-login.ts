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

    // Pre-set Liferay portal bootstrap cookies for .agenziaentrate.gov.it.
    // The real browser sends these on every request including to ivaservizi
    // because they are scoped to the parent domain. Without them the WAS/Liferay
    // SSO handshake may refuse to create a new ivaservizi session.
    await page.setCookie(
      { name: "COOKIE_SUPPORT", value: "true",  domain: ".agenziaentrate.gov.it", path: "/" },
      { name: "GUEST_LANGUAGE_ID", value: "it_IT", domain: ".agenziaentrate.gov.it", path: "/" },
    );
    logger.info("Pre-set COOKIE_SUPPORT + GUEST_LANGUAGE_ID for .agenziaentrate.gov.it");

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

    // Wait for portale home to fully render
    await new Promise((r) => setTimeout(r, 5000));
    await page.screenshot({ path: "/tmp/portale-home.png", fullPage: false }).catch(() => {});

    // ── Intercept Set-Cookie headers from both portale and ivaservizi ────────
    page.on("response", (res) => {
      const url = res.url();
      if (url.includes("ivaservizi.agenziaentrate.gov.it") || url.includes("accessoFatturazione")) {
        const sc = res.headers()["set-cookie"];
        const loc = res.headers()["location"] ?? "";
        if (sc) logger.info({ url: url.substring(0, 100), setCookie: sc.substring(0, 400) }, "Set-Cookie received");
        else logger.info({ url: url.substring(0, 100), status: res.status(), location: loc.substring(0, 100) }, "Response (no Set-Cookie)");
      }
    });

    // ── Strategy 1 (primary): portale accessoFatturazione → SSO → ivaservizi ──
    // This is the REAL entry point the user's browser uses. It goes through the
    // portale's SSO gatekeeper which sets FATSC + B2BCookie + JSESSIONID before
    // redirecting to ivaservizi.
    logger.info("Strategy 1: navigate to portale accessoFatturazione (SSO entry for Fatture/Corrispettivi)");
    await page.goto("https://portale.agenziaentrate.gov.it/PortaleWeb/servizi/accessoFatturazione", {
      waitUntil: "networkidle0", timeout: 45000,
    }).catch((e) => { logger.warn({ err: String(e) }, "accessoFatturazione nav error (continuing)"); });
    await new Promise((r) => setTimeout(r, 5000));

    const afterAccUrl = page.url();
    await page.screenshot({ path: "/tmp/ivaservizi-direct.png", fullPage: false }).catch(() => {});

    // Collect cookies from ALL relevant domains — page.cookies() alone only returns
    // the current page's domain cookies; we must explicitly request each domain.
    const cookiesPortale = await page.cookies("https://portale.agenziaentrate.gov.it").catch(() => []);
    const cookiesIva = await page.cookies("https://ivaservizi.agenziaentrate.gov.it").catch(() => []);
    const cookiesAe = await page.cookies("https://www.agenziaentrate.gov.it").catch(() => []);
    const allAfterAcc = [...cookiesPortale, ...cookiesIva, ...cookiesAe];
    const hasIvaserviziSession = allAfterAcc.some((c) => c.name === "FATSC" || c.name === "JSESSIONID" || c.name === "B2BCookie");
    logger.info(
      { url: afterAccUrl, hasIvaserviziSession, cookies: allAfterAcc.map((c) => `${c.domain}:${c.name}`) },
      "After accessoFatturazione navigation",
    );

    // ── Strategy 2: portale /PortaleWeb/servizi → find DCO card by HEADING ────
    // The Servizi page has 61+ cards; all "Vai al servizio" links, but the CARD
    // HEADING contains "Fattura" or "Corrispettivi". Find the card heading, then
    // get the link within that card container.
    if (!hasIvaserviziSession) {
      logger.info("Strategy 2: portale servizi page → find DCO card by heading text");

      await page.goto("https://portale.agenziaentrate.gov.it/PortaleWeb/servizi", {
        waitUntil: "networkidle0", timeout: 30000,
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 5000));
      await page.screenshot({ path: "/tmp/portale-servizi.png", fullPage: false }).catch(() => {});

      // Enable the "titolari di Partita IVA" toggle — DCO is only visible when ON
      const ivaToggle = await page.evaluate(`(function() {
        var all = Array.from(document.querySelectorAll('*'));
        for (var i = 0; i < all.length; i++) {
          var txt = (all[i].textContent||'').trim();
          if (txt.toLowerCase().includes('partita iva') && all[i].children.length < 5) {
            var r = all[i].getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.height < 60) {
              return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), txt: txt.substring(0,50) };
            }
          }
        }
        return null;
      })()`).catch(() => null) as { x: number; y: number; txt: string } | null;

      if (ivaToggle) {
        logger.info({ ivaToggle }, "Enabling IVA toggle");
        await page.mouse.click(ivaToggle.x, ivaToggle.y);
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Find DCO card by its heading text (card titles contain "Fattura"/"Corrispettivi")
      // All "Vai al servizio" link texts are identical — search by PARENT CARD heading instead.
      const dcoCardLink = await page.evaluate(`(function() {
        var keywords = ['fattura', 'corrispettivi', 'documenti commerciali'];
        // Search headings, then walk up to the card container and find the first <a> inside it
        var headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,div'));
        for (var i = 0; i < headings.length; i++) {
          var el = headings[i];
          var children = el.querySelectorAll('*').length;
          if (children > 3) continue; // skip containers with many children
          var txt = (el.textContent||'').toLowerCase().trim();
          var match = keywords.some(function(k){ return txt.includes(k); });
          if (!match) continue;
          if (txt.length > 100) continue; // skip large blocks
          // Walk up to find the card container with a link
          var card = el.closest('li, article, [class*="card"], [class*="service"], [class*="item"]') || el.parentElement;
          for (var j = 0; j < 5 && card; j++) {
            var link = card.querySelector('a[href]');
            if (link) {
              var r = link.getBoundingClientRect();
              return { href: link.href, x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), heading: txt.substring(0,60), cardTag: card.tagName };
            }
            card = card.parentElement;
          }
        }
        return null;
      })()`).catch(() => null) as { href: string; x: number; y: number; heading: string; cardTag: string } | null;

      logger.info({ dcoCardLink }, "DCO card search result");

      if (dcoCardLink?.href) {
        logger.info({ href: dcoCardLink.href, heading: dcoCardLink.heading }, "Found DCO card — navigating");
        await page.goto(dcoCardLink.href, { waitUntil: "networkidle0", timeout: 45000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        // Strategy 2b: try the known accessoFatturazione path directly but with a
        // different waitUntil — sometimes the redirect chain takes longer
        logger.info("DCO card not found — retrying accessoFatturazione with longer wait");
        await page.goto("https://portale.agenziaentrate.gov.it/PortaleWeb/servizi/accessoFatturazione", {
          waitUntil: "domcontentloaded", timeout: 60000,
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 8000));
      }

      await page.screenshot({ path: "/tmp/after-dco-click.png", fullPage: false }).catch(() => {});
      logger.info({ url: page.url() }, "After strategy 2 navigation");
    }

    const finalUrl = page.url();
    // Collect cookies from all relevant domains after final navigation
    const finalCookiesPortale = await page.cookies("https://portale.agenziaentrate.gov.it").catch(() => []);
    const finalCookiesIva    = await page.cookies("https://ivaservizi.agenziaentrate.gov.it").catch(() => []);
    const finalCookiesAe     = await page.cookies("https://www.agenziaentrate.gov.it").catch(() => []);
    const allCookiesAfter = [...finalCookiesPortale, ...finalCookiesIva, ...finalCookiesAe];
    const hasFinalSession = allCookiesAfter.some((c) => c.name === "FATSC" || c.name === "JSESSIONID" || c.name === "B2BCookie");
    logger.info(
      { url: finalUrl, hasFinalSession, onIvaservizi: finalUrl.includes("ivaservizi") && !finalUrl.includes("nonauth") },
      "Final URL after DCO navigation",
    );
    await page.screenshot({ path: "/tmp/dco-final.png", fullPage: false }).catch(() => {});

    // Build cookie header merging all domains (dedup by name — last wins)
    const cookieMap = new Map<string, string>();
    for (const c of allCookiesAfter) {
      cookieMap.set(c.name, c.value);
    }
    // Also add any cookies captured during page navigation for the current URL
    const currentPageCookies = await page.cookies().catch(() => []);
    for (const c of currentPageCookies) {
      if (c.domain.includes("agenziaentrate.gov.it")) cookieMap.set(c.name, c.value);
    }
    logger.info(
      { count: cookieMap.size, names: Array.from(cookieMap.keys()) },
      "All cookies collected (merged domains)",
    );

    const siampeCookieHeader = Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    // Additionally try Node.js fetch SSO chain to pick up any remaining
    // ivaservizi-specific session cookies not available in Puppeteer
    const enrichedCookies = await followPortaleSSOToIvaservizi(siampeCookieHeader);

    // Merge: Node.js fetch cookies take precedence for ivaservizi cookies
    const finalCookieHeader = enrichedCookies || siampeCookieHeader;

    if (!finalCookieHeader) {
      throw new Error("Could not extract session cookies after login");
    }

    const ragioneSociale = await page.evaluate(
      "document.querySelector('.utente, .user-info, [class*=\"utente\"], [class*=\"user\"]')?.textContent?.trim() || ''",
    ).catch(() => "") as string;

    logger.info({ ragioneSociale, cookieLen: finalCookieHeader.length, cookieCount: Object.keys(parseCookieHeader(finalCookieHeader)).length }, "SIAMPE login successful");

    return {
      cookieHeader: finalCookieHeader,
      ragioneSociale: ragioneSociale.split("\n")[0]?.trim() ?? "",
      partitaIva: credentials.codiceFiscale,
      codiceFiscale: credentials.codiceFiscale,
    };
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

/** Parse a cookie header string into a name→value map */
function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const pair of cookieHeader.split(";").map((s) => s.trim())) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      jar[pair.substring(0, eqIdx).trim()] = pair.substring(eqIdx + 1).trim();
    }
  }
  return jar;
}

/**
 * Follow the portale → ivaservizi SSO redirect chain using plain Node.js fetch.
 *
 * Chrome 92 cannot render the Liferay portale SPA, but the IBM WebSphere
 * LtpaToken2 SSO mechanism works at the HTTP level: navigating from portale
 * to ivaservizi triggers a series of 302 redirects that set the ivaservizi
 * session cookie.  We replicate that chain here without a browser.
 *
 * URLs tried (in order):
 *  1. Portale DCO deep-link (Liferay path for DCO service)
 *  2. Portale home (causes portale to redirect to ivaservizi after entity ctx)
 *  3. Direct ivaservizi DCO URL (works if LtpaToken2 already covers ivaservizi)
 */
async function followPortaleSSOToIvaservizi(siampeCookies: string): Promise<string> {
  const BROWSER_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const ENTRY_URLS = [
    // Liferay deep-link for DCO — navigating here while authenticated on portale
    // triggers the portale→ivaservizi SSO flow automatically
    "https://portale.agenziaentrate.gov.it/portale/web/guest/schede/comunicazioni/documenti-commerciali-online",
    // Fallback: direct ivaservizi URL — if LtpaToken2 covers ivaservizi, this
    // triggers a SAML/token exchange that sets the session cookie
    "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/",
  ];

  // Start with SIAMPE cookies in the jar
  const cookieJar: Record<string, string> = parseCookieHeader(siampeCookies);

  function buildHeader(): string {
    return Object.entries(cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  function absUrl(location: string, base: string): string {
    if (location.startsWith("http")) return location;
    try { return new URL(location, base).toString(); } catch { return location; }
  }

  function ingestSetCookie(headers: Headers): void {
    // Node 18+ fetch exposes getSetCookie() returning string[]
    const setCookies: string[] =
      typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
        ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : [];

    for (const sc of setCookies) {
      // Each value looks like: "name=val; Path=/; Domain=.foo.it; HttpOnly"
      const nameVal = sc.split(";")[0]?.trim() ?? "";
      const eqIdx = nameVal.indexOf("=");
      if (eqIdx > 0) {
        const name = nameVal.substring(0, eqIdx).trim();
        const val = nameVal.substring(eqIdx + 1).trim();
        if (name) cookieJar[name] = val;
      }
    }
  }

  let reachedIvaservizi = false;

  for (const entryUrl of ENTRY_URLS) {
    if (reachedIvaservizi) break;
    let currentUrl = entryUrl;

    for (let hop = 0; hop < 20; hop++) {
      let res: Response;
      try {
        res = await fetch(currentUrl, {
          method: "GET",
          headers: {
            Cookie: buildHeader(),
            "User-Agent": BROWSER_UA,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8",
            Referer: "https://portale.agenziaentrate.gov.it/",
          },
          redirect: "manual",
        });
      } catch (err) {
        logger.warn({ hop, currentUrl, err }, "SSO chain fetch error");
        break;
      }

      ingestSetCookie(res.headers);

      const location = res.headers.get("location") ?? "";
      const cookieNames = Object.keys(cookieJar).join(",");

      logger.info(
        { hop, url: currentUrl, status: res.status, location: location.substring(0, 120), cookies: cookieNames },
        "SSO redirect hop",
      );

      if (res.status >= 300 && res.status < 400 && location) {
        const next = absUrl(location, currentUrl);

        // If the chain reaches ivaservizi, make one final GET to settle the session
        if (next.includes("ivaservizi.agenziaentrate.gov.it") && !next.includes("nonauth")) {
          try {
            const final = await fetch(next, {
              method: "GET",
              headers: { Cookie: buildHeader(), "User-Agent": BROWSER_UA },
              redirect: "manual",
            });
            ingestSetCookie(final.headers);
            const finalLoc = final.headers.get("location") ?? "";
            logger.info({ finalUrl: next, status: final.status, finalLoc }, "ivaservizi final hop");
            // Follow one more hop if still redirecting within ivaservizi
            if (final.status >= 300 && final.status < 400 && finalLoc) {
              const final2 = await fetch(absUrl(finalLoc, next), {
                method: "GET",
                headers: { Cookie: buildHeader(), "User-Agent": BROWSER_UA },
                redirect: "manual",
              });
              ingestSetCookie(final2.headers);
              logger.info({ status: final2.status, url: absUrl(finalLoc, next) }, "ivaservizi hop 2");
            }
          } catch (err) {
            logger.warn({ err }, "Error on final ivaservizi hop");
          }
          reachedIvaservizi = true;
          break;
        }

        currentUrl = next;
      } else {
        // 200 or error — end of chain for this entry URL
        if (currentUrl.includes("ivaservizi.agenziaentrate.gov.it") && !currentUrl.includes("nonauth")) {
          reachedIvaservizi = true;
        }
        break;
      }
    }
  }

  const finalCookies = buildHeader();
  logger.info(
    { reachedIvaservizi, cookieCount: Object.keys(cookieJar).length, cookieNames: Object.keys(cookieJar).join(",") },
    "SSO chain complete",
  );
  return finalCookies;
}

