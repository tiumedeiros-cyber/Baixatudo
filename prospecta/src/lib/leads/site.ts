import type { WebsiteKind } from "./types";

/**
 * Hosts que NÃO são site próprio: rede social, agregador de links, perfil do Google.
 * Para o Jonathan, "só Instagram" conta como "sem site" (e é o melhor lead).
 */
const SOCIAL_HOSTS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "m.me",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "pinterest.com",
  "linktr.ee",
  "linktree.com",
  "bio.link",
  "beacons.ai",
  "linkin.bio",
  "taplink.cc",
  "campsite.bio",
  "lnk.bio",
  "wa.me",
  "whatsapp.com",
  "api.whatsapp.com",
  "bit.ly",
  "tinyurl.com",
  "g.page",
  "goo.gl",
  "maps.app.goo.gl",
  "google.com",
  "ifood.com.br",
  "booksy.com",
  "trinks.com",
  "olx.com.br",
];

/** Subdomínios gratuitos de construtores: existe página, mas é amadora. */
const BUILDER_HOSTS = [
  "wixsite.com",
  "wix.com",
  "weebly.com",
  "blogspot.com",
  "wordpress.com",
  "webnode.com",
  "webnode.page",
  "jimdosite.com",
  "business.site",
  "negocio.site",
  "canva.site",
  "carrd.co",
  "mystrikingly.com",
  "godaddysites.com",
  "site123.me",
  "yolasite.com",
  "000webhostapp.com",
  "sites.google.com",
  "lojaintegrada.com.br",
  "mercadoshops.com.br",
];

export function hostMatches(host: string, list: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return list.some((d) => h === d || h.endsWith(`.${d}`));
}

export interface WebsiteClass {
  kind: WebsiteKind;
  host: string | null;
  url: string | null;
}

/** Normaliza o texto do campo "site" do Maps para uma URL http(s) válida, ou null. */
export function toUrl(raw: string | null | undefined): URL | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // "https://oi" ou "https://abc" não é domínio.
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

export function classifyWebsite(raw: string | null | undefined): WebsiteClass {
  const url = toUrl(raw);
  if (!url) return { kind: "none", host: null, url: null };
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  // Construtor vem antes de rede social: sites.google.com é "weak", não perfil.
  if (hostMatches(host, BUILDER_HOSTS)) {
    return { kind: "weak", host, url: url.toString() };
  }
  if (hostMatches(host, SOCIAL_HOSTS)) {
    return { kind: "social", host, url: url.toString() };
  }
  return { kind: "real", host, url: url.toString() };
}

export function isBuilderHost(host: string): boolean {
  return hostMatches(host, BUILDER_HOSTS);
}
