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
  { id: 'g:sl-SI', label: 'Mojca', lang: 'sl-SI', locale: 'Esloveno', accent: 'Eslovênia', hint: 'esloveno' },
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
  { id: 'g:fa-IR', label: 'Parisa', lang: 'fa-IR', locale: 'Persa', accent: 'Irã', hint: 'persa' },
  { id: 'g:az-AZ', label: 'Leyla', lang: 'az-AZ', locale: 'Azerbaijano', accent: 'Azerbaijão', hint: 'azerbaijano' },
  { id: 'g:kk-KZ', label: 'Aigerim', lang: 'kk-KZ', locale: 'Cazaque', accent: 'Cazaquistão', hint: 'cazaque' },
  { id: 'g:uz-UZ', label: 'Dilnoza', lang: 'uz-UZ', locale: 'Uzbeque', accent: 'Uzbequistão', hint: 'uzbeque' },
  { id: 'g:sw', label: 'Nia', lang: 'sw', locale: 'Suaíli (Tanzânia)', accent: 'Tanzânia', hint: 'suaíli padrão' },
  { id: 'g:yo-NG', label: 'Adaeze', lang: 'yo', locale: 'Iorubá', accent: 'Nigéria', hint: 'iorubá' },
  { id: 'g:ig-NG', label: 'Chidi', lang: 'ig', locale: 'Ibo', accent: 'Nigéria', hint: 'ibo' },
  { id: 'g:zu-ZA', label: 'Thandi', lang: 'zu', locale: 'Zulu', accent: 'África do Sul', hint: 'zulu' },
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
