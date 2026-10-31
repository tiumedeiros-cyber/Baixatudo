/**
 * Avatares falantes — catálogo estático (sem banco, sem storage, sem licença).
 *
 * Cada avatar é desenhado no canvas (preview, miniatura, linha do tempo e
 * exportação usam o MESMO desenho), então a boca anima junto com o áudio sem
 * depender de vídeo externo nem de marca d'água.
 *
 * O `id` de um avatar pode ser:
 *   • `ana`            → preset do catálogo
 *   • `ana@praia`      → preset + cenário
 *   • `c:<base64url>`  → preset editado pelo usuário (pele, cabelo, roupa…)
 *
 * Assim o avatar personalizado viaja dentro do projeto, sem gravar nada novo
 * no banco e sem inflar o storage.
 */
export type HairStyle = 'curto' | 'longo' | 'coque' | 'cacheado' | 'calvo' | 'franja' | 'rabo' | 'tranca';

export type SceneId = 'estudio' | 'escritorio' | 'praia' | 'cidade' | 'neon' | 'sala' | 'podcast' | 'floresta' | 'chroma';

export type AvatarPreset = {
  id: string;
  name: string;
  role: string;
  /** pronome usado só para ajustar maquiagem/sobrancelha por padrão */
  gender: 'f' | 'm';
  skin: string;
  skinShadow: string;
  hair: HairStyle;
  hairColor: string;
  shirt: string;
  bg: [string, string];
  scene?: SceneId;
  glasses?: boolean;
  beard?: boolean;
  earrings?: boolean;
  lipstick?: string;
  freckles?: boolean;
  /** textura da camisa */
  fabric?: 'seda' | 'algodao' | 'social' | 'malha' | 'couro';
};

export const SCENES: { id: SceneId; label: string; hint: string }[] = [
  { id: 'estudio', label: 'Estúdio', hint: 'luz de recorte + fundo limpo' },
  { id: 'escritorio', label: 'Escritório', hint: 'janela com cidade ao fundo' },
  { id: 'praia', label: 'Praia', hint: 'fim de tarde no mar' },
  { id: 'cidade', label: 'Cidade à noite', hint: 'skyline com luzes' },
  { id: 'neon', label: 'Neon', hint: 'estúdio gamer/criador' },
  { id: 'sala', label: 'Sala de casa', hint: 'ambiente quente e aconchegante' },
  { id: 'podcast', label: 'Podcast', hint: 'painel acústico + microfone' },
  { id: 'floresta', label: 'Floresta', hint: 'bokeh verde, externa' },
  { id: 'chroma', label: 'Fundo verde', hint: 'chroma key para trocar depois' },
];

export const AVATARS: AvatarPreset[] = [
  {
    id: 'ana',
    name: 'Ana',
    role: 'Apresentadora · criadora de conteúdo',
    gender: 'f',
    skin: '#f1c6a6',
    skinShadow: '#d29a78',
    hair: 'longo',
    hairColor: '#3b2418',
    shirt: '#6366f1',
    bg: ['#1e1b4b', '#4c1d95'],
    lipstick: '#be3d5b',
    earrings: true,
    fabric: 'seda',
  },
  {
    id: 'bruno',
    name: 'Bruno',
    role: 'Locutor · VSL e anúncios',
    gender: 'm',
    skin: '#dba37a',
    skinShadow: '#b8804f',
    hair: 'curto',
    hairColor: '#1f1611',
    shirt: '#0f766e',
    bg: ['#0b1220', '#0e7490'],
    beard: true,
    fabric: 'algodao',
  },
  {
    id: 'camila',
    name: 'Camila',
    role: 'Social media · reels',
    gender: 'f',
    skin: '#8f5c3d',
    skinShadow: '#6e4429',
    hair: 'cacheado',
    hairColor: '#221410',
    shirt: '#db2777',
    bg: ['#3b0764', '#9d174d'],
    lipstick: '#9f1239',
    earrings: true,
    fabric: 'malha',
  },
  {
    id: 'diego',
    name: 'Diego',
    role: 'Professor · tutoriais',
    gender: 'm',
    skin: '#c88c60',
    skinShadow: '#a26c45',
    hair: 'curto',
    hairColor: '#4b3524',
    shirt: '#1d4ed8',
    bg: ['#0b1a2b', '#1e3a8a'],
    glasses: true,
    beard: true,
    fabric: 'social',
  },
  {
    id: 'elisa',
    name: 'Elisa',
    role: 'Narração suave · institucional',
    gender: 'f',
    skin: '#f8dcc8',
    skinShadow: '#e2b79c',
    hair: 'coque',
    hairColor: '#c78a3c',
    shirt: '#0ea5e9',
    bg: ['#072a3f', '#0369a1'],
    lipstick: '#b4536a',
    freckles: true,
    fabric: 'seda',
  },
  {
    id: 'felipe',
    name: 'Felipe',
    role: 'Especialista · review',
    gender: 'm',
    skin: '#b27c53',
    skinShadow: '#8d5e3a',
    hair: 'calvo',
    hairColor: '#2b2118',
    shirt: '#b45309',
    bg: ['#1c1917', '#7c2d12'],
    beard: true,
    fabric: 'algodao',
  },
  {
    id: 'gabi',
    name: 'Gabi',
    role: 'Jovem criadora · trends',
    gender: 'f',
    skin: '#edb78f',
    skinShadow: '#cd9370',
    hair: 'franja',
    hairColor: '#111827',
    shirt: '#22c55e',
    bg: ['#04240f', '#15803d'],
    earrings: true,
    lipstick: '#be123c',
    freckles: true,
    fabric: 'malha',
  },
  {
    id: 'hugo',
    name: 'Hugo',
    role: 'Executivo · apresentações',
    gender: 'm',
    skin: '#ecc6a9',
    skinShadow: '#c9a084',
    hair: 'curto',
    hairColor: '#6b7280',
    shirt: '#334155',
    bg: ['#0f172a', '#334155'],
    glasses: true,
    fabric: 'social',
  },
  {
    id: 'iris',
    name: 'Íris',
    role: 'Podcast · entrevistas',
    gender: 'f',
    skin: '#6d4529',
    skinShadow: '#4f2f1b',
    hair: 'tranca',
    hairColor: '#1a0e09',
    shirt: '#7c3aed',
    bg: ['#1e1b4b', '#5b21b6'],
    lipstick: '#831843',
    earrings: true,
    fabric: 'seda',
  },
  {
    id: 'joao',
    name: 'João',
    role: 'Comercial · ofertas',
    gender: 'm',
    skin: '#f4c9a6',
    skinShadow: '#d5a682',
    hair: 'franja',
    hairColor: '#3f2a1d',
    shirt: '#dc2626',
    bg: ['#3f0a0a', '#b91c1c'],
    fabric: 'malha',
  },
  {
    id: 'karen',
    name: 'Karen',
    role: 'Suporte · onboarding',
    gender: 'f',
    skin: '#fadcc6',
    skinShadow: '#dcb39a',
    hair: 'rabo',
    hairColor: '#8b5e34',
    shirt: '#0891b2',
    bg: ['#06293a', '#0891b2'],
    lipstick: '#a21caf',
    fabric: 'algodao',
  },
  {
    id: 'luis',
    name: 'Luís',
    role: 'Tech · demonstrações',
    gender: 'm',
    skin: '#a9714b',
    skinShadow: '#855238',
    hair: 'cacheado',
    hairColor: '#161312',
    shirt: '#4f46e5',
    bg: ['#0b1020', '#4338ca'],
    glasses: true,
    beard: true,
    fabric: 'malha',
  },
  {
    id: 'nina',
    name: 'Nina',
    role: 'Apresentadora infantil · educação',
    gender: 'f',
    skin: '#f6d2b4',
    skinShadow: '#d8ac8c',
    hair: 'rabo',
    hairColor: '#7c2d12',
    shirt: '#f59e0b',
    bg: ['#1e1b4b', '#f59e0b'],
    lipstick: '#d94a6a',
    freckles: true,
    fabric: 'algodao',
  },
  {
    id: 'paulo',
    name: 'Paulo',
    role: 'Âncora · notícias',
    gender: 'm',
    skin: '#c9926a',
    skinShadow: '#a4714b',
    hair: 'curto',
    hairColor: '#26201c',
    shirt: '#0f172a',
    bg: ['#04121f', '#155e75'],
    fabric: 'social',
  },
  {
    id: 'rita',
    name: 'Rita',
    role: 'Consultora · lives e mentorias',
    gender: 'f',
    skin: '#e8b894',
    skinShadow: '#c4936f',
    hair: 'tranca',
    hairColor: '#3f2a1d',
    shirt: '#14b8a6',
    bg: ['#042f2e', '#0f766e'],
    lipstick: '#b91c1c',
    earrings: true,
    fabric: 'seda',
  },
  {
    id: 'samuel',
    name: 'Samuel',
    role: 'Narrador · documentário',
    gender: 'm',
    skin: '#7a4a2f',
    skinShadow: '#583322',
    hair: 'calvo',
    hairColor: '#171310',
    shirt: '#475569',
    bg: ['#111827', '#1f2937'],
    beard: true,
    fabric: 'algodao',
  },
];

export const DEFAULT_AVATAR = AVATARS[0];

/** Campos que o usuário pode editar sem sair do sistema. */
export type AvatarEdit = {
  base?: string;
  name?: string;
  skin?: string;
  hairColor?: string;
  shirt?: string;
  hair?: HairStyle;
  scene?: SceneId;
  glasses?: boolean;
  beard?: boolean;
  lipstick?: string;
};

const HAIRS: HairStyle[] = ['curto', 'longo', 'coque', 'cacheado', 'calvo', 'franja', 'rabo', 'tranca'];
const SCENE_IDS = SCENES.map((s) => s.id);

function b64encode(value: string) {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'utf8').toString('base64url');
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(value: string) {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'base64url').toString('utf8');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(normalized)));
}

/** Monta um id portátil com as edições do usuário. */
export function encodeAvatar(edit: AvatarEdit): string {
  const payload: Record<string, unknown> = {};
  if (edit.base) payload.b = edit.base;
  if (edit.name) payload.n = edit.name.slice(0, 40);
  if (edit.skin) payload.s = edit.skin;
  if (edit.hairColor) payload.h = edit.hairColor;
  if (edit.shirt) payload.t = edit.shirt;
  if (edit.hair) payload.r = edit.hair;
  if (edit.scene) payload.c = edit.scene;
  if (edit.glasses !== undefined) payload.g = edit.glasses ? 1 : 0;
  if (edit.beard !== undefined) payload.d = edit.beard ? 1 : 0;
  if (edit.lipstick) payload.l = edit.lipstick;
  return `c:${b64encode(JSON.stringify(payload))}`;
}

export function decodeAvatar(id: string): AvatarEdit | null {
  if (!id.startsWith('c:')) return null;
  try {
    const raw = JSON.parse(b64decode(id.slice(2))) as Record<string, unknown>;
    return {
      base: typeof raw.b === 'string' ? raw.b : undefined,
      name: typeof raw.n === 'string' ? raw.n : undefined,
      skin: typeof raw.s === 'string' ? raw.s : undefined,
      hairColor: typeof raw.h === 'string' ? raw.h : undefined,
      shirt: typeof raw.t === 'string' ? raw.t : undefined,
      hair: HAIRS.includes(raw.r as HairStyle) ? (raw.r as HairStyle) : undefined,
      scene: SCENE_IDS.includes(raw.c as SceneId) ? (raw.c as SceneId) : undefined,
      glasses: typeof raw.g === 'number' ? Boolean(raw.g) : undefined,
      beard: typeof raw.d === 'number' ? Boolean(raw.d) : undefined,
      lipstick: typeof raw.l === 'string' ? raw.l : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve um id em preset final. Aceita catálogo, `id@cenário` e ids
 * personalizados (`c:...`). É a única porta de entrada usada pelo desenho.
 */
export function avatarById(id?: string | null): AvatarPreset {
  if (!id) return DEFAULT_AVATAR;
  const custom = decodeAvatar(id);
  if (custom) {
    const base = AVATARS.find((a) => a.id === custom.base) ?? DEFAULT_AVATAR;
    return {
      ...base,
      name: custom.name || base.name,
      skin: custom.skin || base.skin,
      skinShadow: custom.skin ? shade(custom.skin, -0.18) : base.skinShadow,
      hairColor: custom.hairColor || base.hairColor,
      shirt: custom.shirt || base.shirt,
      hair: custom.hair || base.hair,
      scene: custom.scene || base.scene,
      glasses: custom.glasses ?? base.glasses,
      beard: custom.beard ?? base.beard,
      lipstick: custom.lipstick ?? base.lipstick,
    };
  }
  const [baseId, scene] = id.split('@');
  const found = AVATARS.find((a) => a.id === baseId) ?? AVATARS.find((a) => a.id === id);
  if (found) {
    return SCENE_IDS.includes(scene as SceneId) ? { ...found, scene: scene as SceneId } : found;
  }
  return AVATARS.find((a) => a.id === id) ?? DEFAULT_AVATAR;
}

/** Id de catálogo com cenário (não polui o banco: é só string). */
export function withScene(avatarId: string, scene: SceneId) {
  const custom = decodeAvatar(avatarId);
  if (custom) return encodeAvatar({ ...custom, scene });
  const base = avatarId.split('@')[0];
  return `${base}@${scene}`;
}

export function sceneOf(id?: string | null): SceneId {
  return avatarById(id).scene ?? 'estudio';
}

/** Clareia/escurece uma cor hex (para sombras e brilhos). */
export function shade(hex: string, amount: number) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full || '888888', 16);
  const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 255) * (1 + amount))));
  const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 255) * (1 + amount))));
  const b = Math.max(0, Math.min(255, Math.round((num & 255) * (1 + amount))));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
