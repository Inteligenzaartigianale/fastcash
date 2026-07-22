---
name: Chromium on Replit NixOS
description: How to run headless Chrome/Puppeteer on Replit's NixOS container without library conflicts
---

## The Problem
Puppeteer's bundled Chrome (v150) fails on Replit NixOS:
```
libglib-2.0.so.0: cannot open shared object file: No such file or directory
```
The nix glibc (2.33) also conflicts with the system glibc when mixing LD_LIBRARY_PATH.

## The Solution: spawn Chromium 92 + puppeteer.connect()
Use the nix-managed Chromium 92 (self-contained, no library conflicts), but bypass `puppeteer.launch()` which times out due to CDP protocol incompatibility between Chrome 92 and Puppeteer 25.

**Exact approach:**
1. Spawn Chrome 92 manually with `child_process.spawn()` and `--remote-debugging-port=19333`
2. Parse the `DevTools listening on ws://...` URL from stderr
3. Connect via `puppeteer.connect({ browserWSEndpoint: wsUrl, protocolTimeout: 180000 })`

**Why:**
- `puppeteer.launch()` with Chrome 92 hangs indefinitely (30s internal timeout) because Puppeteer 25 sends CDP commands that Chrome 92 doesn't respond to correctly
- Spawning manually and using `connect()` bypasses the protocol initialization that causes the hang
- Chrome 92 from nix is at `/nix/store/ia69plrrvn7czdhn3flq1ll39i92ixab-chromium-92.0.4515.159/bin/chromium`
- Find it at runtime via: `nix-instantiate --eval -E 'builtins.toString (import <nixpkgs> {}).chromium + "/bin/chromium"'`

**How to apply:**
Any time headless browser automation is needed in this Replit project. See `artifacts/api-server/src/lib/siampe-login.ts` for the full implementation.

## SIAMPE Login Flow (AE Portal)
The SIAMPE login page at `iampe.agenziaentrate.gov.it/sam/UI/Login` is a React SPA:
1. Opens on SPID tab by default — must click Fisconline/Entratel tab via `document.querySelectorAll` evaluate (`:has-text` pseudo-selector not supported in Chrome 92/Puppeteer)
2. CF input has `placeholder*="codice fiscale"` (case-insensitive)
3. After wrong credentials → redirected to `www.agenziaentrate.gov.it/portale/` (detect this URL to fail fast)
4. After correct credentials → PIN input page appears (still on `iampe.agenziaentrate.gov.it`)
5. Navigate directly to `iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate&goto=...` to avoid the DCO SPA's `nonauth.html` redirect
6. Clear browser cookies before each login attempt (`Network.clearBrowserCookies` via CDP session)
