/**
 * Avatares falantes — catálogo estático (sem banco, sem storage).
 *
 * Cada avatar é desenhado no canvas (preview, exportação e miniatura usam o
 * mesmo desenho), então a boca anima junto com o áudio sem depender de vídeo
 * externo, marca d'água ou licença.
 */
export type AvatarPreset = {
  id: string;
  name: string;
  role: string;
  skin: string;
  skinShadow: string;
  hair: 'curto' | 'longo' | 'coque' | 'cacheado' | 'calvo' | 'franja';
  hairColor: string;
  shirt: string;
  bg: [string, string];
  glasses?: boolean;
  beard?: boolean;
  earrings?: boolean;
  lipstick?: string;
};

export const AVATARS: AvatarPreset[] = [
  {
    id: 'ana',
    name: 'Ana',
    role: 'Apresentadora · criadora de conteúdo',
    skin: '#f0c3a3',
    skinShadow: '#d9a281',
    hair: 'longo',
    hairColor: '#3a2318',
    shirt: '#6366f1',
    bg: ['#1e1b4b', '#4c1d95'],
    lipstick: '#c2415c',
    earrings: true,
  },
  {
    id: 'bruno',
    name: 'Bruno',
    role: 'Locutor · VSL e anúncios',
    skin: '#d9a077',
    skinShadow: '#bd8259',
    hair: 'curto',
    hairColor: '#1f1611',
    shirt: '#0f766e',
    bg: ['#0f172a', '#0e7490'],
    beard: true,
  },
  {
    id: 'camila',
    name: 'Camila',
    role: 'Social media · reels',
    skin: '#8d5a3b',
    skinShadow: '#6f452c',
    hair: 'cacheado',
    hairColor: '#231510',
    shirt: '#db2777',
    bg: ['#3b0764', '#9d174d'],
    lipstick: '#9f1239',
    earrings: true,
  },
  {
    id: 'diego',
    name: 'Diego',
    role: 'Professor · tutoriais',
    skin: '#c68a5e',
    skinShadow: '#a56f47',
    hair: 'curto',
    hairColor: '#4b3524',
    shirt: '#1d4ed8',
    bg: ['#0c1a2b', '#1e3a8a'],
    glasses: true,
  },
  {
    id: 'elisa',
    name: 'Elisa',
    role: 'Narração suave · institucional',
    skin: '#f6d7c3',
    skinShadow: '#e0b7a0',
    hair: 'coque',
    hairColor: '#c98b3f',
    shirt: '#0ea5e9',
    bg: ['#082f49', '#0369a1'],
    lipstick: '#b4536a',
  },
  {
    id: 'felipe',
    name: 'Felipe',
    role: 'Especialista · review',
    skin: '#b07a52',
    skinShadow: '#8f5f3d',
    hair: 'calvo',
    hairColor: '#2b2118',
    shirt: '#b45309',
    bg: ['#1c1917', '#7c2d12'],
    beard: true,
  },
  {
    id: 'gabi',
    name: 'Gabi',
    role: 'Jovem criadora · trends',
    skin: '#e9b48c',
    skinShadow: '#cf9670',
    hair: 'franja',
    hairColor: '#111827',
    shirt: '#22c55e',
    bg: ['#052e16', '#15803d'],
    earrings: true,
    lipstick: '#be123c',
  },
  {
    id: 'hugo',
    name: 'Hugo',
    role: 'Executivo · apresentações',
    skin: '#e7c1a4',
    skinShadow: '#cca184',
    hair: 'curto',
    hairColor: '#6b7280',
    shirt: '#334155',
    bg: ['#0f172a', '#334155'],
    glasses: true,
  },
  {
    id: 'iris',
    name: 'Íris',
    role: 'Podcast · entrevistas',
    skin: '#6b4229',
    skinShadow: '#52311d',
    hair: 'longo',
    hairColor: '#1b100b',
    shirt: '#7c3aed',
    bg: ['#1e1b4b', '#5b21b6'],
    lipstick: '#831843',
    earrings: true,
  },
  {
    id: 'joao',
    name: 'João',
    role: 'Comercial · ofertas',
    skin: '#f2c7a5',
    skinShadow: '#d9aa88',
    hair: 'franja',
    hairColor: '#3f2a1d',
    shirt: '#dc2626',
    bg: ['#450a0a', '#b91c1c'],
  },
  {
    id: 'karen',
    name: 'Karen',
    role: 'Suporte · onboarding',
    skin: '#f7d9c4',
    skinShadow: '#e2bda6',
    hair: 'coque',
    hairColor: '#8b5e34',
    shirt: '#0891b2',
    bg: ['#083344', '#0891b2'],
    lipstick: '#a21caf',
  },
  {
    id: 'luis',
    name: 'Luís',
    role: 'Tech · demonstrações',
    skin: '#a9714b',
    skinShadow: '#8a5a39',
    hair: 'cacheado',
    hairColor: '#161312',
    shirt: '#4f46e5',
    bg: ['#111827', '#4338ca'],
    glasses: true,
    beard: true,
  },
];

export function avatarById(id?: string | null) {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
