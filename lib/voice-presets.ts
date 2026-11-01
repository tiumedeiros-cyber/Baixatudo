/**
 * Vozes em português com timbre próprio.
 *
 * O serviço neural oferece 3 vozes brasileiras (Francisca, Antônio e Thalita).
 * Para ter mais opções de verdade — e cada uma soar diferente da outra — aqui
 * a mesma voz recebe altura e ritmo próprios, combinações que o serviço aplica
 * no áudio final (não é efeito de navegador nem simulação).
 */

export type VoicePreset = {
  id: string;
  label: string;
  lang: string;
  voice: string;
  pitch: string;
  rate: string;
};

export const VOICE_PRESETS: VoicePreset[] = [
  // Português (Brasil) — femininas
  { id: 'br-francisca-clara', label: 'Francisca clara · feminina (Brasil)', lang: 'pt-BR', voice: 'pt-BR-FranciscaNeural', pitch: '+0Hz', rate: '+0%' },
  { id: 'br-francisca-grave', label: 'Francisca grave · feminina (Brasil)', lang: 'pt-BR', voice: 'pt-BR-FranciscaNeural', pitch: '-22Hz', rate: '-6%' },
  { id: 'br-francisca-jovem', label: 'Francisca jovem · feminina (Brasil)', lang: 'pt-BR', voice: 'pt-BR-FranciscaNeural', pitch: '+14Hz', rate: '+8%' },
  { id: 'br-thalita-neutra', label: 'Thalita neutra · feminina (Brasil)', lang: 'pt-BR', voice: 'pt-BR-ThalitaMultilingualNeural', pitch: '+0Hz', rate: '+0%' },
  { id: 'br-thalita-animada', label: 'Thalita animada · feminina (Brasil)', lang: 'pt-BR', voice: 'pt-BR-ThalitaMultilingualNeural', pitch: '+16Hz', rate: '+10%' },
  { id: 'br-thalita-calma', label: 'Thalita calma · feminina (Brasil)', lang: 'pt-BR', voice: 'pt-BR-ThalitaMultilingualNeural', pitch: '-12Hz', rate: '-12%' },
  // Português (Brasil) — masculinas
  { id: 'br-antonio-narrador', label: 'Antônio narrador · masculina (Brasil)', lang: 'pt-BR', voice: 'pt-BR-AntonioNeural', pitch: '+0Hz', rate: '+0%' },
  { id: 'br-antonio-grave', label: 'Antônio grave · masculina (Brasil)', lang: 'pt-BR', voice: 'pt-BR-AntonioNeural', pitch: '-20Hz', rate: '-8%' },
  { id: 'br-antonio-jovem', label: 'Antônio jovem · masculina (Brasil)', lang: 'pt-BR', voice: 'pt-BR-AntonioNeural', pitch: '+18Hz', rate: '+10%' },
  // Inglês
  { id: 'en-ava-clara', label: 'Ava clara · feminina (inglês)', lang: 'en-US', voice: 'en-US-AvaNeural', pitch: '+0Hz', rate: '+0%' },
  { id: 'en-ava-grave', label: 'Ava grave · feminina (inglês)', lang: 'en-US', voice: 'en-US-AvaNeural', pitch: '-20Hz', rate: '-6%' },
  { id: 'en-andrew-narrador', label: 'Andrew narrador · masculina (inglês)', lang: 'en-US', voice: 'en-US-AndrewNeural', pitch: '+0Hz', rate: '+0%' },
  { id: 'en-andrew-profunda', label: 'Andrew profunda · masculina (inglês)', lang: 'en-US', voice: 'en-US-AndrewNeural', pitch: '-24Hz', rate: '-8%' },
  { id: 'en-emma-jovem', label: 'Emma jovem · feminina (inglês)', lang: 'en-US', voice: 'en-US-EmmaNeural', pitch: '+12Hz', rate: '+6%' },
  { id: 'en-brian-firme', label: 'Brian firme · masculina (inglês)', lang: 'en-US', voice: 'en-US-BrianNeural', pitch: '+6Hz', rate: '+4%' },
];

const byId = new Map(VOICE_PRESETS.map((preset) => [preset.id, preset]));

export function voicePreset(id?: string) {
  return id ? byId.get(id) : undefined;
}
