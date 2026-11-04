import { cache } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DemoSite } from "@/components/demo/demo-site";
import { PALETTES } from "@/components/demo/theme";
import { isDemoSlug, type PublicDemo } from "@/lib/deals/types";
import { getPublicRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Página PÚBLICA: quem recebeu o link abre sem login. O que protege é o endereço (token longo e
 * aleatório) e o fato de o visitante só conseguir ler o conteúdo de uma prévia publicada.
 * Robôs de pré-visualização (o WhatsApp abre o link quando a mensagem sai) e o dono, com `?interno=1`,
 * não contam como visita.
 */
const ROBOT = /bot|crawl|spider|preview|whatsapp|facebookexternalhit|telegram|slack|discord|curl|wget|headless|python|node-fetch|go-http/i;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Lê sem contar visita (usado só para título e cores, uma vez por pedido). */
const peek = cache(async (slug: string): Promise<PublicDemo | null> => {
  if (!isDemoSlug(slug)) return null;
  try {
    return await (await getPublicRepo()).viewDemo(slug, false);
  } catch (error) {
    console.error("prévia (leitura):", error);
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const demo = await peek(slug);
  const robots = { index: false, follow: false };
  if (!demo) return { title: "Prévia", robots };
  const name = demo.content.businessName;
  const title = `Prévia do site da ${name}`;
  const description = `Um primeiro desenho de como o site da ${name} poderia ficar, criado por ${demo.content.madeBy.brand}.`;
  return { title: { absolute: title }, description, robots, openGraph: { title, description, type: "website", locale: "pt_BR" } };
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { slug } = await params;
  const demo = await peek(slug);
  const tokens = demo ? PALETTES[demo.palette] : null;
  return { themeColor: tokens?.themeColor ?? "#ffffff", colorScheme: tokens?.dark ? "dark" : "light" };
}

export default async function PreviewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!isDemoSlug(slug)) notFound();

  const sp = await searchParams;
  const agent = (await headers()).get("user-agent") ?? "";
  const count = !ROBOT.test(agent) && sp.interno !== "1";

  let demo: PublicDemo | null = null;
  try {
    demo = await (await getPublicRepo()).viewDemo(slug, count);
  } catch (error) {
    console.error("prévia:", error);
  }
  if (!demo) notFound();

  return <DemoSite template={demo.template} palette={demo.palette} content={demo.content} />;
}
