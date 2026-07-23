---
name: AE Portale → ivaservizi auth flow
description: How the AE portale establishes an ivaservizi session — what cookies are needed and how to get them.
---

## What cookies ivaservizi needs
The ivaservizi API (`/ser/api/documenti/v1/doc/documenti/?v=TIMESTAMP`) requires three domain-specific cookies **in addition to** the SIAMPE/LtpaToken2 cookies:
- `FATSC` — ivaservizi session cookie (long encrypted value)
- `B2BCookie` — B2B auth cookie (long encrypted value)
- `JSESSIONID` — IBM WebSphere J2EE session (format: `0000XXXX:YYYY`)

Without these three, the POST returns 405 (Method Not Allowed). `/common/testata/v1/info/me` returns 401.

## How they are set
These cookies are **only set by the ivaservizi server** when the user arrives via the portale redirect. They are NOT set by direct navigation to ivaservizi with LtpaToken2 alone (browser lands on nonauth.html instead).

The portale uses a JavaScript-driven redirect from the "Fattura e Corrispettivi" service card on `/PortaleWeb/servizi`. LtpaToken2 is NOT enough to cross-domain authenticate to ivaservizi on its own.

## Portal structure (confirmed by Puppeteer screenshots)
- `portale.agenziaentrate.gov.it/PortaleWeb/home` — renders correctly in Chrome 92 with IBM WebSphere portal, shows "Area riservata" + logged-in user + "Servizi" section
- `portale.agenziaentrate.gov.it/PortaleWeb/servizi` — renders with 61 service results, search box "Cerca nei servizi" + "Cerca" button, category "Trasmissioni telematiche", toggle "Mostra anche i servizi per i soggetti titolari di Partita IVA" (must be ENABLED for DCO to appear)
- `portale.agenziaentrate.gov.it/portale/web/guest/schede/comunicazioni/documenti-commerciali-online` — BLOCKED by Akamai CDN (403) — do NOT navigate here

## API endpoint (confirmed working from real browser capture)
- POST `https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/?v=TIMESTAMP` → 200 OK
- GET `https://ivaservizi.agenziaentrate.gov.it/common/testata/v1/info/me` → user info
- GET `https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/totale?v=TIMESTAMP` → `{"totaleDaLeggere":0,"anteprime":[]}`
- All require Cookie header with FATSC + B2BCookie + JSESSIONID

## Chrome 92 status
Chrome 92 (Nix path `/nix/store/ia69plrrvn7czdhn3flq1ll39i92ixab-chromium-92.0.4515.159/bin/chromium`) CAN render the AE portale correctly. The portale is IBM WebSphere Portal with standard JS. Chrome 92 executes it fine.

**Why:** pageText was empty in early logs because we checked it immediately after form submit before JS ran. With 5-6s wait, the full portal renders including service lists.
