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
  { id: 'g:bg-BG', label: 'Daria', lang: 'bg-BG', locale: 'Búlgaro', accent: 'Bulgária', hint: 'búlgaro padrão' },
  { id: 'g:ca-ES', label: 'Montserrat', lang: 'ca-ES', locale: 'Catalão', accent: 'Catalunha', hint: 'catalão' },
  { id: 'g:hr-HR', label: 'Ivana', lang: 'hr-HR', locale: 'Croata', accent: 'Croácia', hint: 'croata' },
  { id: 'g:hu-HU', label: 'Réka', lang: 'hu-HU', locale: 'Húngaro', accent: 'Hungria', hint: 'húngaro' },
  { id: 'g:no-NO', label: 'Ingrid', lang: 'no-NO', locale: 'Norueguês', accent: 'Noruega', hint: 'norueguês' },
  { id: 'g:sk-SK', label: 'Zuzana', lang: 'sk-SK', locale: 'Eslovaco', accent: 'Eslováquia', hint: 'eslovaco' },
  { id: 'g:sr-RS', label: 'Milica', lang: 'sr-RS', locale: 'Sérvio', accent: 'Sérvia', hint: 'sérvio' },
  { id: 'g:lt-LT', label: 'Egle', lang: 'lt-LT', locale: 'Lituano', accent: 'Lituânia', hint: 'lituano' },
  { id: 'g:lv-LV', label: 'Laima', lang: 'lv-LV', locale: 'Letão', accent: 'Letônia', hint: 'letão' },
  { id: 'g:et-EE', label: 'Kadi', lang: 'et-EE', locale: 'Estoniano', accent: 'Estônia', hint: 'estoniano' },
  { id: 'g:bs-BA', label: 'Semira', lang: 'bs', locale: 'Bósnio', accent: 'Bósnia', hint: 'bósnio' },
  { id: 'g:ms-MY', label: 'Siti', lang: 'ms-MY', locale: 'Malaio', accent: 'Malásia', hint: 'malaio' },
  { id: 'g:fil-PH', label: 'Marisol', lang: 'fil-PH', locale: 'Filipino', accent: 'Filipinas', hint: 'tagalo' },
  { id: 'g:sw-KE', label: 'Amani', lang: 'sw-KE', locale: 'Suaíli', accent: 'Quênia', hint: 'suaíli' },
  { id: 'g:af-ZA', label: 'Annelie', lang: 'af-ZA', locale: 'Africâner', accent: 'África do Sul', hint: 'africâner' },
  { id: 'g:bn-IN', label: 'Tripti', lang: 'bn-IN', locale: 'Bengali', accent: 'Índia/Bangladesh', hint: 'bengali' },
  { id: 'g:ta-IN', label: 'Kavya', lang: 'ta-IN', locale: 'Tâmil', accent: 'Índia', hint: 'tâmil' },
  { id: 'g:te-IN', label: 'Sravani', lang: 'te-IN', locale: 'Telugu', accent: 'Índia', hint: 'telugu' },
  { id: 'g:mr-IN', label: 'Snehal', lang: 'mr-IN', locale: 'Marathi', accent: 'Índia', hint: 'marathi' },
  { id: 'g:gu-IN', label: 'Hetal', lang: 'gu-IN', locale: 'Gujarati', accent: 'Índia', hint: 'gujarati' },
  { id: 'g:kn-IN', label: 'Deepa', lang: 'kn-IN', locale: 'Kannada', accent: 'Índia', hint: 'kannada' },
  { id: 'g:ml-IN', label: 'Anjali', lang: 'ml-IN', locale: 'Malaiala', accent: 'Índia', hint: 'malaiala' },
  { id: 'g:ur-PK', label: 'Ayesha', lang: 'ur-PK', locale: 'Urdu', accent: 'Paquistão', hint: 'urdu' },
  { id: 'g:sw', label: 'Nia', lang: 'sw', locale: 'Suaíli (Tanzânia)', accent: 'Tanzânia', hint: 'suaíli padrão' },
  { id: 'g:en-CA', label: 'Maya', lang: 'en-CA', locale: 'Inglês (Canadá)', accent: 'Canadá', hint: 'sotaque canadense' },
  { id: 'g:en-ZA', label: 'Thandi', lang: 'en-ZA', locale: 'Inglês (África do Sul)', accent: 'África do Sul', hint: 'sotaque sul-africano' },
  { id: 'g:en-NG', label: 'Chidi', lang: 'en-NG', locale: 'Inglês (Nigéria)', accent: 'Nigéria', hint: 'sotaque nigeriano' },
  { id: 'g:es-MX', label: 'Ximena', lang: 'es-MX', locale: 'Espanhol (México)', accent: 'México', hint: 'sotaque mexicano' },
  { id: 'g:es-AR', label: 'Sofía', lang: 'es-AR', locale: 'Espanhol (Argentina)', accent: 'Argentina', hint: 'sotaque portenho' },
  { id: 'g:es-CO', label: 'Valentina', lang: 'es-CO', locale: 'Espanhol (Colômbia)', accent: 'Colômbia', hint: 'sotaque colombiano' },
  { id: 'g:es-CL', label: 'Antonia', lang: 'es-CL', locale: 'Espanhol (Chile)', accent: 'Chile', hint: 'sotaque chileno' },
  { id: 'g:pt-AO', label: 'Nzinga', lang: 'pt-AO', locale: 'Português (Angola)', accent: 'Angola', hint: 'sotaque angolano' },
  { id: 'g:fr-BE', label: 'Manon', lang: 'fr-BE', locale: 'Francês (Bélgica)', accent: 'Bélgica', hint: 'sotaque belga' },
  { id: 'g:de-AT', label: 'Marlene', lang: 'de-AT', locale: 'Alemão (Áustria)', accent: 'Áustria', hint: 'sotaque austríaco' },
  { id: 'g:de-CH', label: 'Hanna', lang: 'de-CH', locale: 'Alemão (Suíça)', accent: 'Suíça', hint: 'sotaque suíço' },
  { id: 'g:nl-BE', label: 'Lotte', lang: 'nl-BE', locale: 'Holandês (Bélgica)', accent: 'Bélgica', hint: 'flamengo' },
  { id: 'g:it-CH', label: 'Chiara', lang: 'it-CH', locale: 'Italiano (Suíça)', accent: 'Suíça', hint: 'sotaque ticino' },
  { id: 'g:zh-TW', label: 'Ya-Ting', lang: 'zh-TW', locale: 'Mandarim (Taiwan)', accent: 'Taiwan', hint: 'mandarim tradicional' },
  { id: 'g:zh-HK', label: 'Wing', lang: 'zh-HK', locale: 'Cantonês', accent: 'Hong Kong', hint: 'cantonês' },
  { id: 'g:ar-EG', label: 'Salma', lang: 'ar-EG', locale: 'Árabe (Egito)', accent: 'Egito', hint: 'árabe egípcio' },
  { id: 'g:ar-AE', label: 'Mariam', lang: 'ar-AE', locale: 'Árabe (Golfo)', accent: 'Emirados Árabes', hint: 'árabe do golfo' },
  { id: 'g:is-IS', label: 'Elín', lang: 'is-IS', locale: 'Islandês', accent: 'Islândia', hint: 'islandês' },
  { id: 'g:sq-AL', label: 'Elira', lang: 'sq-AL', locale: 'Albanês', accent: 'Albânia', hint: 'albanês' },
  { id: 'g:su-ID', label: 'Nyi', lang: 'su-ID', locale: 'Sundanês', accent: 'Indonésia', hint: 'sundanês' },
  { id: 'g:si-LK', label: 'Dilini', lang: 'si-LK', locale: 'Cingalês', accent: 'Sri Lanka', hint: 'cingalês' },
  { id: 'g:km-KH', label: 'Sophea', lang: 'km-KH', locale: 'Khmer', accent: 'Camboja', hint: 'khmer' },
  { id: 'g:my-MM', label: 'Thiri', lang: 'my-MM', locale: 'Birmanês', accent: 'Mianmar', hint: 'birmanês' },
  { id: 'g:ne-NP', label: 'Sunita', lang: 'ne-NP', locale: 'Nepalês', accent: 'Nepal', hint: 'nepalês' },
  { id: 'g:pa-IN', label: 'Simran', lang: 'pa-IN', locale: 'Punjabi', accent: 'Índia', hint: 'punjabi' },
  { id: 'g:ha-NG', label: 'Amina', lang: 'ha-NG', locale: 'Hauçá', accent: 'Nigéria', hint: 'hauçá' },
  { id: 'g:am-ET', label: 'Selam', lang: 'am-ET', locale: 'Amárico', accent: 'Etiópia', hint: 'amárico' },
  { id: 'g:la', label: 'Clara', lang: 'la', locale: 'Latim', accent: 'Vaticano', hint: 'latim clássico' },
];

// Voz neural brasileira com timbre próprio (ver lib/voice-presets.ts)
export const DEFAULT_VOICE = 'br-francisca-clara';

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
