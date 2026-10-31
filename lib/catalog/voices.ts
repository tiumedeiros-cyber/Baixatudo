/**
 * Banco de vozes do Editor Studio.
 *
 * Ficam no código (catálogo estático) para não gastar banco nem depender do
 * Supabase para carregar: todas são vozes reais do banco público do Google
 * Tradutor (translate_tts), que responde em ~120 ms e não exige chave.
 *
 * `lang` é o idioma/sotaque pedido ao motor; o `id` é o que trafega no sistema.
 */
export type CatalogVoice = {
  id: string;
  label: string;
  lang: string;
  locale: string;
  accent: string;
  hint: string;
};

export const VOICES: CatalogVoice[] = [
  { id: 'g:pt-BR', label: 'Ana', lang: 'pt-BR', locale: 'Português (Brasil)', accent: 'Brasil', hint: 'voz padrão, clara e jovem' },
  { id: 'g:pt-PT', label: 'Beatriz', lang: 'pt-PT', locale: 'Português (Portugal)', accent: 'Portugal', hint: 'sotaque europeu' },
  { id: 'g:en-US', label: 'Ava', lang: 'en-US', locale: 'Inglês (EUA)', accent: 'Estados Unidos', hint: 'neutra, ótima para VSL' },
  { id: 'g:en-GB', label: 'Sonia', lang: 'en-GB', locale: 'Inglês (Reino Unido)', accent: 'Reino Unido', hint: 'sotaque britânico' },
  { id: 'g:en-AU', label: 'Matilda', lang: 'en-AU', locale: 'Inglês (Austrália)', accent: 'Austrália', hint: 'sotaque australiano' },
  { id: 'g:en-IN', label: 'Priya', lang: 'en-IN', locale: 'Inglês (Índia)', accent: 'Índia', hint: 'sotaque indiano' },
  { id: 'g:es-ES', label: 'Lucía', lang: 'es-ES', locale: 'Espanhol (Espanha)', accent: 'Espanha', hint: 'castelhano' },
  { id: 'g:es-US', label: 'Valeria', lang: 'es-US', locale: 'Espanhol (LatAm)', accent: 'América Latina', hint: 'espanhol latino' },
  { id: 'g:fr-FR', label: 'Camille', lang: 'fr-FR', locale: 'Francês', accent: 'França', hint: 'francês padrão' },
  { id: 'g:fr-CA', label: 'Léa', lang: 'fr-CA', locale: 'Francês (Canadá)', accent: 'Canadá', hint: 'quebequês' },
  { id: 'g:it-IT', label: 'Giulia', lang: 'it-IT', locale: 'Italiano', accent: 'Itália', hint: 'italiano padrão' },
  { id: 'g:de-DE', label: 'Katrin', lang: 'de-DE', locale: 'Alemão', accent: 'Alemanha', hint: 'alemão padrão' },
  { id: 'g:nl-NL', label: 'Sanne', lang: 'nl-NL', locale: 'Holandês', accent: 'Holanda', hint: 'neerlandês' },
  { id: 'g:pl-PL', label: 'Zofia', lang: 'pl-PL', locale: 'Polonês', accent: 'Polônia', hint: 'polonês padrão' },
  { id: 'g:ru-RU', label: 'Anastasia', lang: 'ru-RU', locale: 'Russo', accent: 'Rússia', hint: 'russo padrão' },
  { id: 'g:tr-TR', label: 'Elif', lang: 'tr-TR', locale: 'Turco', accent: 'Turquia', hint: 'turco padrão' },
  { id: 'g:ja-JP', label: 'Sakura', lang: 'ja-JP', locale: 'Japonês', accent: 'Japão', hint: 'japonês padrão' },
  { id: 'g:ko-KR', label: 'Jiwon', lang: 'ko-KR', locale: 'Coreano', accent: 'Coreia', hint: 'coreano padrão' },
  { id: 'g:zh-CN', label: 'Mei', lang: 'zh-CN', locale: 'Mandarim', accent: 'China', hint: 'mandarim simplificado' },
  { id: 'g:hi-IN', label: 'Anika', lang: 'hi-IN', locale: 'Hindi', accent: 'Índia', hint: 'hindi padrão' },
  { id: 'g:ar-SA', label: 'Layla', lang: 'ar-SA', locale: 'Árabe', accent: 'Arábia Saudita', hint: 'árabe padrão' },
  { id: 'g:id-ID', label: 'Putri', lang: 'id-ID', locale: 'Indonésio', accent: 'Indonésia', hint: 'indonésio padrão' },
  { id: 'g:vi-VN', label: 'Linh', lang: 'vi-VN', locale: 'Vietnamita', accent: 'Vietnã', hint: 'vietnamita padrão' },
  { id: 'g:th-TH', label: 'Mali', lang: 'th-TH', locale: 'Tailandês', accent: 'Tailândia', hint: 'tailandês padrão' },
  { id: 'g:sv-SE', label: 'Elsa', lang: 'sv-SE', locale: 'Sueco', accent: 'Suécia', hint: 'sueco padrão' },
  { id: 'g:ro-RO', label: 'Ioana', lang: 'ro-RO', locale: 'Romeno', accent: 'Romênia', hint: 'romeno padrão' },
  { id: 'g:el-GR', label: 'Nefeli', lang: 'el-GR', locale: 'Grego', accent: 'Grécia', hint: 'grego padrão' },
  { id: 'g:da-DK', label: 'Freja', lang: 'da-DK', locale: 'Dinamarquês', accent: 'Dinamarca', hint: 'dinamarquês padrão' },
  { id: 'g:fi-FI', label: 'Aino', lang: 'fi-FI', locale: 'Finlandês', accent: 'Finlândia', hint: 'finlandês padrão' },
  { id: 'g:cs-CZ', label: 'Tereza', lang: 'cs-CZ', locale: 'Tcheco', accent: 'República Tcheca', hint: 'tcheco padrão' },
  { id: 'g:uk-UA', label: 'Oksana', lang: 'uk-UA', locale: 'Ucraniano', accent: 'Ucrânia', hint: 'ucraniano padrão' },
  { id: 'g:he-IL', label: 'Noa', lang: 'he-IL', locale: 'Hebraico', accent: 'Israel', hint: 'hebraico padrão' },
];

export const DEFAULT_VOICE = 'g:pt-BR';

export function voiceById(id?: string | null) {
  if (!id) return VOICES[0];
  return VOICES.find((v) => v.id === id) ?? VOICES.find((v) => v.lang === id) ?? VOICES[0];
}

/** Idiomas que aparecem primeiro na lista (pt-BR antes de tudo). */
export const VOICE_LOCALES = Array.from(new Set(VOICES.map((v) => v.locale)));

export const RATES = [
  { id: 'normal', label: 'Normal', speed: '1' },
  { id: 'lenta', label: 'Pausada', speed: '0.24' },
] as const;
