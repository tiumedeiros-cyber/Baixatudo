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

export type SceneId =
  | 'estudio'
  | 'escritorio'
  | 'praia'
  | 'cidade'
  | 'neon'
  | 'sala'
  | 'podcast'
  | 'floresta'
  | 'chroma'
  | 'transparente'
  | 'setup';

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
  /** enquadramento: só rosto, meio corpo (busto) ou corpo inteiro */
  framing?: FramingId;
  /** pose dos braços/mãos */
  pose?: PoseId;
  /** expressão facial base (a boca ainda abre com o áudio) */
  expression?: ExpressionId;
  /** tatuagens no braço e no rosto */
  tattoos?: boolean;
  /** headset de gamer */
  headphones?: boolean;
  /**
   * Retrato 3D (render estilo Pixar) com fundo branco removido em tempo real.
   * `base` = boca fechada, `talk` = boca aberta (mistura pelo áudio).
   */
  photo?: { base: string; mid?: string; talk: string };
  /**
   * Boca desenhada sobre uma FOTO enviada pelo usuário (avatar próprio).
   * Posições relativas ao retrato já sem fundo: `y` centro da boca (0..1),
   * `w` largura e `h` altura (fração da imagem).
   */
  photoMouth?: { y: number; w: number; h: number; lips?: string };
  /** corrente/cordão no pescoço */
  chain?: boolean;
  /** relógio no pulso */
  watch?: boolean;
  /** cor do cabelo das sobrancelhas (padrão: hairColor) */
  browColor?: string;
};

export type FramingId = 'rosto' | 'meio' | 'corpo';
export type PoseId = 'neutro' | 'joinha' | 'apontando' | 'acenando' | 'cruzado' | 'bolso';
export type ExpressionId = 'sorriso' | 'neutro' | 'serio' | 'surpreso';

export const FRAMINGS: { id: FramingId; label: string; hint: string }[] = [
  { id: 'rosto', label: 'Rosto', hint: 'só o rosto e os ombros' },
  { id: 'meio', label: 'Meio corpo', hint: 'busto: rosto, tronco e mãos' },
  { id: 'corpo', label: 'Corpo inteiro', hint: 'personagem completo em cena' },
];

export const POSES: { id: PoseId; label: string }[] = [
  { id: 'neutro', label: 'Natural' },
  { id: 'joinha', label: 'Joinha' },
  { id: 'apontando', label: 'Apontando' },
  { id: 'acenando', label: 'Acenando' },
  { id: 'cruzado', label: 'Braços cruzados' },
  { id: 'bolso', label: 'Mãos no bolso' },
];

export const EXPRESSIONS: { id: ExpressionId; label: string }[] = [
  { id: 'sorriso', label: 'Sorrindo' },
  { id: 'neutro', label: 'Neutro' },
  { id: 'serio', label: 'Sério' },
  { id: 'surpreso', label: 'Surpreso' },
];

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
  { id: 'transparente', label: 'Sem fundo', hint: 'overlay: aparece sobre o vídeo de baixo' },
  { id: 'setup', label: 'Setup gamer', hint: 'mesa com PC RGB, monitor e microfone' },
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
  {
    id: 'theo',
    name: 'Theo',
    role: 'Criador gamer · setup + reação',
    gender: 'm',
    skin: '#e8b892',
    skinShadow: '#c6936c',
    hair: 'curto',
    hairColor: '#241d1a',
    shirt: '#e8e2d4',
    bg: ['#0b1020', '#3b1d6e'],
    scene: 'setup',
    framing: 'meio',
    pose: 'joinha',
    expression: 'sorriso',
    glasses: true,
    beard: true,
    tattoos: true,
    headphones: true,
    chain: true,
    watch: true,
    earrings: true,
    fabric: 'algodao',
    photo: { base: '/avatars3d/theo.jpg', mid: '/avatars3d/theo-mid.jpg', talk: '/avatars3d/theo-talk.jpg' },
  },
  {
    id: 'lucas',
    name: 'Lucas',
    role: 'Apresentador · review de tech',
    gender: 'm',
    skin: '#c98a5f',
    skinShadow: '#a56c45',
    hair: 'cacheado',
    hairColor: '#1b1412',
    shirt: '#111827',
    bg: ['#0f172a', '#1d4ed8'],
    scene: 'setup',
    framing: 'corpo',
    pose: 'apontando',
    expression: 'sorriso',
    tattoos: true,
    chain: true,
    fabric: 'malha',
    photo: { base: '/avatars3d/lucas.jpg', mid: '/avatars3d/lucas-mid.jpg', talk: '/avatars3d/lucas-talk.jpg' },
  },
  {
    id: 'rafa',
    name: 'Rafa',
    role: 'Streamer · react e cortes',
    gender: 'm',
    skin: '#f0c8a4',
    skinShadow: '#cfa07c',
    hair: 'franja',
    hairColor: '#3a2a1e',
    shirt: '#7c3aed',
    bg: ['#0b1020', '#7c2d12'],
    scene: 'neon',
    framing: 'meio',
    pose: 'cruzado',
    expression: 'serio',
    headphones: true,
    tattoos: true,
    earrings: true,
    fabric: 'algodao',
    photo: { base: '/avatars3d/rafa.jpg', mid: '/avatars3d/rafa-mid.jpg', talk: '/avatars3d/rafa-talk.jpg' },
  },
  {
    id: 'bia',
    name: 'Bia',
    role: 'Criadora · lifestyle e dicas',
    gender: 'f',
    skin: '#e9b78f',
    skinShadow: '#c9926a',
    hair: 'rabo',
    hairColor: '#5b3a22',
    shirt: '#22d3ee',
    bg: ['#082f49', '#0e7490'],
    scene: 'setup',
    framing: 'meio',
    pose: 'acenando',
    expression: 'sorriso',
    lipstick: '#c2415c',
    earrings: true,
    freckles: true,
    fabric: 'malha',
    photo: { base: '/avatars3d/bia.jpg', mid: '/avatars3d/bia-mid.jpg', talk: '/avatars3d/bia-talk.jpg' },
  },
  {
    id: 'igor',
    name: 'Igor',
    role: 'Dev · tutoriais e código',
    gender: 'm',
    skin: '#8f5c3d',
    skinShadow: '#6e4429',
    hair: 'calvo',
    hairColor: '#171310',
    shirt: '#0f766e',
    bg: ['#052e2b', '#155e75'],
    scene: 'escritorio',
    framing: 'corpo',
    pose: 'bolso',
    expression: 'neutro',
    glasses: true,
    beard: true,
    watch: true,
    fabric: 'social',
    photo: { base: '/avatars3d/igor.jpg', mid: '/avatars3d/igor-mid.jpg', talk: '/avatars3d/igor-talk.jpg' },
  },
  {
    id: 'nara',
    name: 'Nara',
    role: 'Âncora · notícias e institucional',
    gender: 'f',
    skin: '#f6d2b4',
    skinShadow: '#d8ac8c',
    hair: 'coque',
    hairColor: '#2b1d15',
    shirt: '#1e293b',
    bg: ['#0b1220', '#1e3a8a'],
    scene: 'podcast',
    framing: 'meio',
    pose: 'neutro',
    expression: 'serio',
    lipstick: '#9f1239',
    earrings: true,
    chain: true,
    fabric: 'social',
    photo: { base: '/avatars3d/nara.jpg', mid: '/avatars3d/nara-mid.jpg', talk: '/avatars3d/nara-talk.jpg' },
  },
];

/**
 * Elenco oficial: só os retratos 3D (render estilo Pixar). Os desenhos antigos
 * de canvas saíram da galeria — o desenho procedural continua no arquivo apenas
 * como fallback de emergência (ex.: imagem ainda carregando).
 */
const CAST_3D = AVATARS.filter((a) => a.photo);
AVATARS.length = 0;
AVATARS.push(...CAST_3D);

export const DEFAULT_AVATAR = AVATARS[0];

/** Campos que o usuário pode editar sem sair do sistema. */
export type AvatarEdit = {
  base?: string;
  /** foto do usuário (URL já hospedada no sistema) usada como avatar */
  photo?: string;
  photoMouth?: { y: number; w: number; h: number; lips?: string };
  name?: string;
  skin?: string;
  hairColor?: string;
  shirt?: string;
  hair?: HairStyle;
  scene?: SceneId;
  glasses?: boolean;
  beard?: boolean;
  lipstick?: string;
  framing?: FramingId;
  pose?: PoseId;
  expression?: ExpressionId;
  tattoos?: boolean;
  headphones?: boolean;
  chain?: boolean;
  watch?: boolean;
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
  if (edit.framing && edit.framing !== 'rosto') payload.f = edit.framing;
  if (edit.pose && edit.pose !== 'neutro') payload.p = edit.pose;
  if (edit.expression && edit.expression !== 'sorriso') payload.e = edit.expression;
  if (edit.tattoos !== undefined) payload.k = edit.tattoos ? 1 : 0;
  if (edit.headphones !== undefined) payload.x = edit.headphones ? 1 : 0;
  if (edit.chain !== undefined) payload.y = edit.chain ? 1 : 0;
  if (edit.watch !== undefined) payload.z = edit.watch ? 1 : 0;
  if (edit.photo) payload.pu = edit.photo.slice(0, 400);
  if (edit.photoMouth) {
    const { y, w, h, lips } = edit.photoMouth;
    payload.pm = [y, w, h].map((n) => Number(Number(n).toFixed(3))).join(',');
    if (lips) payload.pl = lips;
  }
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
      framing: FRAMINGS.some((f) => f.id === raw.f) ? (raw.f as FramingId) : undefined,
      pose: POSES.some((p) => p.id === raw.p) ? (raw.p as PoseId) : undefined,
      expression: EXPRESSIONS.some((e) => e.id === raw.e) ? (raw.e as ExpressionId) : undefined,
      tattoos: typeof raw.k === 'number' ? Boolean(raw.k) : undefined,
      headphones: typeof raw.x === 'number' ? Boolean(raw.x) : undefined,
      chain: typeof raw.y === 'number' ? Boolean(raw.y) : undefined,
      watch: typeof raw.z === 'number' ? Boolean(raw.z) : undefined,
      photo: typeof raw.pu === 'string' && /^https?:|^\/|^data:image/.test(raw.pu) ? raw.pu : undefined,
      photoMouth: typeof raw.pm === 'string' ? parsePhotoMouth(raw.pm, raw.pl) ?? undefined : undefined,
    };
  } catch {
    return null;
  }
}

function parsePhotoMouth(value: string, lips?: unknown): { y: number; w: number; h: number; lips?: string } | null {
  const parts = value.split(',').map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  return {
    y: clamp(parts[0], 0.05, 0.95),
    w: clamp(parts[1], 0.05, 0.9),
    h: clamp(parts[2], 0.01, 0.4),
    lips: typeof lips === 'string' ? lips.slice(0, 20) : undefined,
  };
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
    // avatar feito com a foto do próprio usuário: a imagem vem no preset
    const userPhoto = custom.photo
      ? {
          photo: { base: custom.photo, talk: custom.photo },
          photoMouth: custom.photoMouth ?? { y: 0.66, w: 0.3, h: 0.07 },
        }
      : {};
    return {
      ...base,
      ...userPhoto,
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
      framing: custom.framing ?? base.framing,
      pose: custom.pose ?? base.pose,
      expression: custom.expression ?? base.expression,
      tattoos: custom.tattoos ?? base.tattoos,
      headphones: custom.headphones ?? base.headphones,
      chain: custom.chain ?? base.chain,
      watch: custom.watch ?? base.watch,
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
