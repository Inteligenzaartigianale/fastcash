import { createHmac, randomUUID } from "node:crypto";

type Plan = "annuale" | "a_vita";

function usage(): never {
  console.error("Uso: pnpm --filter @workspace/scripts license:issue -- <PIVA> <annuale|a_vita> [YYYY-MM-DD]");
  process.exit(1);
}

const [rawPiva, rawPlan, rawExpiry] = process.argv.slice(2);
const piva = rawPiva?.trim().replace(/^IT/i, "").replace(/\s/g, "");
const plan = rawPlan as Plan | undefined;
const secret = process.env.SESSION_SECRET;

if (!piva || !/^\d{11}$/.test(piva) || (plan !== "annuale" && plan !== "a_vita") || !secret) usage();

let expiresOn: string | null = null;
if (plan === "annuale") {
  if (rawExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(rawExpiry)) usage();
  if (rawExpiry) {
    expiresOn = rawExpiry;
  } else {
    const date = new Date();
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    expiresOn = date.toISOString().slice(0, 10);
  }
}

const payload = {
  v: 1,
  id: randomUUID().replace(/-/g, ""),
  piva,
  plan,
  expiresOn,
  channel: "browser",
};
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signature = createHmac("sha256", secret).update(encoded).digest("base64url");

console.log(`${encoded}.${signature}`);
console.error(`Licenza ${plan} per P.IVA ${piva}${expiresOn ? `, scadenza ${expiresOn}` : ""}.`);