import type { CSSProperties } from "react";
import type { DemoPalette, DemoTemplate } from "@/lib/deals/types";

/** Cores de cada paleta da prévia. Texto sempre com contraste AA contra o fundo. */
export interface PaletteTokens {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
  soft: string;
  line: string;
  /** Cor do navegador no celular (barra de endereço). */
  themeColor: string;
  dark: boolean;
}

export const PALETTES: Record<DemoPalette, PaletteTokens> = {
  rose: {
    bg: "#fbf4f1",
    surface: "#fffaf8",
    ink: "#2b1d1d",
    muted: "#6e5a56",
    accent: "#a94560",
    accentInk: "#ffffff",
    soft: "#f4e1e1",
    line: "rgba(43, 29, 29, 0.14)",
    themeColor: "#fbf4f1",
    dark: false,
  },
  sage: {
    bg: "#f3f5ef",
    surface: "#fbfcf8",
    ink: "#1f2a22",
    muted: "#55645a",
    accent: "#3f6e4d",
    accentInk: "#ffffff",
    soft: "#dfe9dc",
    line: "rgba(31, 42, 34, 0.14)",
    themeColor: "#f3f5ef",
    dark: false,
  },
  noir: {
    bg: "#0e0e0e",
    surface: "#171717",
    ink: "#f4efe6",
    muted: "#a8a091",
    accent: "#c9a24d",
    accentInk: "#141414",
    soft: "#1f1c16",
    line: "rgba(244, 239, 230, 0.16)",
    themeColor: "#0e0e0e",
    dark: true,
  },
  ocean: {
    bg: "#f2f7fa",
    surface: "#fbfdfe",
    ink: "#14232e",
    muted: "#4f6372",
    accent: "#1b6694",
    accentInk: "#ffffff",
    soft: "#dcebf4",
    line: "rgba(20, 35, 46, 0.14)",
    themeColor: "#f2f7fa",
    dark: false,
  },
};

interface TemplateTokens {
  /** Fonte dos títulos. */
  headFont: string;
  headWeight: number;
  headTransform: "none" | "uppercase";
  headTracking: string;
  radiusButton: string;
  radiusCard: string;
}

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const SANS = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";

export const TEMPLATES: Record<DemoTemplate, TemplateTokens> = {
  estetica: { headFont: SERIF, headWeight: 500, headTransform: "none", headTracking: "-0.01em", radiusButton: "999px", radiusCard: "28px" },
  barbearia: { headFont: SANS, headWeight: 800, headTransform: "uppercase", headTracking: "0.04em", radiusButton: "2px", radiusCard: "2px" },
  clinica: { headFont: SANS, headWeight: 600, headTransform: "none", headTracking: "-0.02em", radiusButton: "14px", radiusCard: "20px" },
  generico: { headFont: SANS, headWeight: 650, headTransform: "none", headTracking: "-0.02em", radiusButton: "12px", radiusCard: "18px" },
};

/** Variáveis CSS da prévia. Ficam num wrapper, então nada vaza para o resto do painel. */
export function themeVars(template: DemoTemplate, palette: DemoPalette): CSSProperties {
  const p = PALETTES[palette];
  const t = TEMPLATES[template];
  return {
    "--d-bg": p.bg,
    "--d-surface": p.surface,
    "--d-ink": p.ink,
    "--d-muted": p.muted,
    "--d-accent": p.accent,
    "--d-accent-ink": p.accentInk,
    "--d-soft": p.soft,
    "--d-line": p.line,
    "--d-head-font": t.headFont,
    "--d-head-weight": String(t.headWeight),
    "--d-head-transform": t.headTransform,
    "--d-head-tracking": t.headTracking,
    "--d-r-btn": t.radiusButton,
    "--d-r-card": t.radiusCard,
    colorScheme: p.dark ? "dark" : "light",
  } as CSSProperties;
}
