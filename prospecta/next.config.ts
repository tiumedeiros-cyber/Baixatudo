import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Há um package-lock.json na pasta de usuário que confunde a detecção da raiz.
const root = path.dirname(fileURLToPath(import.meta.url));

// Painel privado e 100% dinâmico: Cache Components não traz ganho aqui, então
// fica desligado (o scaffold ligava por padrão).
const nextConfig: NextConfig = {
  // Permite subir uma segunda instância (ex.: modo demonstração para testes) sem pisar no .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // O indicador do Next em desenvolvimento cobre o rodapé da barra lateral.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // Importar o JSON de uma busca do Apify passa de 1 MB com facilidade.
    serverActions: { bodySizeLimit: "12mb" },
  },
  turbopack: {
    root,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
