---
name: Chromium on Replit NixOS
description: How to run headless Chrome/Puppeteer on Replit's NixOS container without library conflicts, and SIAMPE login automation details
---

## The Problem
Puppeteer's bundled Chrome (v150) fails on Replit NixOS:
```
libglib-2.0.so.0: cannot open shared object file: No such file or directory
```

## The Solution: spawn Chromium 92 + puppeteer.connect()
Use the nix-managed Chromium 92 (self-contained, correct nix rpaths), bypass `puppeteer.launch()`.

**Exact approach:**
1. Kill any stale Chrome on port 19333: `fuser -k 19333/tcp`
2. Spawn Chrome 92 manually: `child_process.spawn()` with `--remote-debugging-port=19333`
3. Parse `DevTools listening on ws://...` from stderr
4. Connect: `puppeteer.connect({ browserWSEndpoint: wsUrl, protocolTimeout: 180000 })`
5. Kill Chrome in `finally` block: `proc.kill("SIGKILL")` — do NOT reuse across requests

**Why:**
- `puppeteer.launch()` with Chrome 92 hangs indefinitely (Puppeteer 25 CDP init incompatible with Chrome 92)
- Browser singleton across requests causes port 19333 conflicts on the second login attempt
- Each login must spawn a fresh Chrome and kill it in `finally`

**Chrome path:** `/nix/store/ia69plrrvn7czdhn3flq1ll39i92ixab-chromium-92.0.4515.159/bin/chromium`
Find at runtime: `nix-instantiate --eval -E 'builtins.toString (import <nixpkgs> {}).chromium + "/bin/chromium"'`

## SIAMPE Login Flow (Fisconline/Entratel)

Navigate directly to:
`https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate&goto=<encoded-return-url>`

### Tab click — CRITICAL
The page opens on SPID tab. The React tab component DOES NOT respond to synthetic `element.click()` via `page.evaluate()`. Must use real mouse coordinates:
1. Get bounding rect via `evaluate` → `getBoundingClientRect()`
2. Use `page.mouse.click(x, y)`
3. Wait for CF input to become visible (check `getBoundingClientRect().width > 0`) to confirm tab switched

### Form structure
All three fields are on ONE page (no separate PIN step):
- "Codice fiscale/Nome utente:" → `input[placeholder*="codice fiscale" i]`
- "Password:" → `input[type="password"]` (first visible)
- "PIN:" → `input[placeholder*="PIN" i]` (same page, same form)
- Submit: `button[type="submit"]` → "Accedi"

### Error detection after submit
Wrong credentials → SIAMPE shows "Credenziali errate" + "Autenticazione fallita." inline (same URL, no redirect).
Correct credentials → redirects to the `goto` URL (ivaservizi/portale).

Check `document.body.innerText` after submit:
```javascript
const credErr = pageText.includes("Credenziali errate") || pageText.includes("Autenticazione fallita");
```

Use short navigation timeout (8s) in `clickButton` so wrong-creds respond fast (total ~17s).

### Post-login success
After successful login, the page redirects to `ivaservizi.agenziaentrate.gov.it`. May need to navigate to the DCO URL to get DCO-specific session cookies before extracting them.

### Visibility check for inputs
Always use `getBoundingClientRect().width > 0 && height > 0` to check input visibility — hidden inputs from inactive tabs exist in DOM but have zero dimensions.
