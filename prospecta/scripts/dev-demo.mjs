// Painel em MODO DEMONSTRAÇÃO, mesmo com o .env.local preenchido.
//
//   npm run dev:demo           (http://localhost:3200)
//
// Esvazia Supabase, Apify e GOWA só para este processo: dados fictícios em memória, sem login, sem
// gastar crédito do Apify e sem chance de falar com o WhatsApp. Usa outra pasta de build
// (.next-demo) para poder rodar ao lado do `npm run dev`. O .env.local não é alterado.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const port = process.env.DEMO_PORT || "3200";
// vários números fictícios, para ver a tela Números e a escolha de número da Fila: npm run dev:demo -- --numeros=3
const numbers = process.argv.find((a) => a.startsWith("--numeros="))?.split("=")[1] ?? process.env.DEMO_NUMBERS ?? "";

const child = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", port], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_URL: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    APIFY_TOKEN: "",
    GOWA_URL: "",
    GOWA_BASIC_AUTH: "",
    GOWA_DEVICE_ID: "",
    WORKER_TOKEN: "",
    WA_WEBHOOK_SECRET: "",
    DEMO_NUMBERS: numbers,
    NEXT_DIST_DIR: ".next-demo",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
