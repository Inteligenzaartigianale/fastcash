# Build APK Android — Scontrini Fiscali

## Opzione A — GitHub Actions (consigliata, nessun tool locale richiesto)

1. **Crea un repository GitHub** e carica il codice (o collega Replit a GitHub)
2. Vai su **Actions → Build Android APK → Run workflow**
3. Scegli `debug` o `release` e avvia
4. Dopo ~5 minuti scarica l'APK dalla sezione **Artifacts**
5. Trasferisci l'APK sul Reno 13 Pro via ADB, email o Google Drive e installalo

> La prima build crea la directory `android/` nel workflow; commit questa directory per velocizzare i build successivi.

---

## Opzione B — Build locale (Android Studio)

### Prerequisiti
- Node.js ≥ 20 + pnpm
- Android Studio (include SDK e JDK 17)

### Passi

```bash
# 1. Installa dipendenze
pnpm install

# 2. Build web app per Android (base path = /)
cd artifacts/scontrini
BASE_PATH=/ PORT=3000 pnpm vite build

# 3. Prima volta: aggiungi piattaforma Android
npx cap add android

# 4. Sincronizza Capacitor
npx cap sync android

# 5. Apri in Android Studio
npx cap open android
```

In Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**

L'APK debug si trova in:
```
artifacts/scontrini/android/app/build/outputs/apk/debug/app-debug.apk
```

### Installa sul Reno 13 Pro via ADB

```bash
# Abilita "Opzioni sviluppatore" + "Debug USB" sul telefono
adb devices           # deve comparire il dispositivo
adb install app-debug.apk
```

---

## Configurazione server nell'app

Al primo avvio su Android, l'app mostra la schermata di login con la fotocamera.
**Scansiona il QR generato dal desktop** (pulsante "QR mobile" in alto) —
questo configura automaticamente l'URL del server E autentica la sessione in un solo gesto.

In alternativa, tocca **"Inserisci URL"** e digita manualmente:
```
https://tuo-server.replit.app/fiscale
```

---

## Note

- L'APK debug è firmato con chiave di test Android (sufficiente per test su dispositivi personali)
- Per pubblicare su Play Store serve una chiave di firma release
- Il Reno 13 Pro (Android 14+) richiede di abilitare "Installa app da fonti sconosciute" nelle impostazioni di sicurezza
- La sessione ADE dura 4 ore; usa il QR per rinnovarla senza toccare l'app
