import type { VisemeEvent } from '@/lib/visemes';
export type Role = 'client' | 'admin';
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  status: 'active' | 'blocked';
  created_at: string;
  updated_at: string;
};

export type PlanLimits = {
  projects: number;
  storage_gb: number;
  max_quality: number;
  export_4k: boolean;
  premium_library: boolean;
  tts_minutes: number;
  downloads_per_day: number;
  /** plano de uso livre (sem contagem de tempo/downloads) */
  unlimited?: boolean;
};

export type Plan = {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number;
  description: string | null;
  features: string[];
  limits: PlanLimits;
  trial_days: number;
  is_active: boolean;
  sort_order: number;
};

export type Subscription = {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  gateway: string | null;
  gateway_ref: string | null;
  plans?: Plan;
};

export type Payment = {
  id: string;
  user_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'refused' | 'refunded';
  gateway: 'stripe' | 'mercadopago' | 'demo' | 'manual';
  gateway_payment_id: string | null;
  risk_score: number;
  risk_flags: string[];
  metadata: Record<string, unknown>;
  paid_at: string | null;
  created_at: string;
  plans?: { name: string } | null;
  es_profiles?: { email: string; full_name: string | null } | null;
};

/* ------------------------- Editor timeline model ------------------------- */
export type ClipKind =
  | 'video'
  | 'image'
  | 'text'
  | 'audio'
  | 'sfx'
  | 'music'
  | 'object3d'
  | 'overlay'
  | 'sticker'
  | 'generator';

export type TransitionType = 'none' | 'fade' | 'slide' | 'zoom' | 'wipe' | 'glitch' | 'flash';

export type TextProps = {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  weight: number;
  align: 'left' | 'center' | 'right';
  shadow: boolean;
  stroke: number;
  strokeColor: string;
  background: string;
  letterSpacing: number;
  lineHeight: number;
  gradient: string;
  animation: 'none' | 'typewriter' | 'pop' | 'fade';
};

export type Transform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  rotationX: number;
  rotationY: number;
};

export type GeneratorProps = {
  /** fundo procedural animado (aurora, partículas, grid, …) */
  preset: string;
  colorA: string;
  colorB: string;
  speed: number;
  intensity: number;
};

export type ShadowProps = { blur: number; color: string; offsetY: number; offsetX: number };

export type Filters = {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  hue: number;
  grayscale: number;
};

export type KeyframeProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'rotationX' | 'rotationY';

export type Keyframe = { id: string; t: number; prop: KeyframeProp; value: number };

export type Clip = {
  id: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  src: string;
  start: number;
  duration: number;
  trimStart: number;
  sourceDuration?: number;
  volume: number;
  muted: boolean;
  opacity: number;
  speed: number;
  transform: Transform;
  filters: Filters;
  text?: TextProps;
  object3d?: { shape: string; color: string; metalness: number; spin: number };
  overlay?: { preset: string };
  sticker?: { preset: string; color: string };
  generator?: GeneratorProps;
  /**
   * Chroma key opcional (vídeo importado com fundo verde).
   * Ausente = comportamento antigo, sem filtro.
   */
  chroma?: { enabled: boolean; color?: 'verde' | 'azul'; tolerance?: number; softness?: number; spill?: number };
  shadow?: ShadowProps;
  transitionIn: { type: TransitionType; duration: number };
  transitionOut: { type: TransitionType; duration: number };
  fadeIn: number;
  fadeOut: number;
  keyframes: Keyframe[];
  locked?: boolean;
};

export type Track = {
  id: string;
  name: string;
  kind: 'visual' | 'audio';
  muted: boolean;
  hidden: boolean;
};

export type TimelineData = {
  tracks: Track[];
  clips: Clip[];
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  type: 'video' | 'image';
  status: 'draft' | 'editing' | 'published';
  thumb_url: string | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background?: string;
  timeline: TimelineData;
  created_at: string;
  updated_at: string;
};

export type AssetType =
  | 'video'
  | 'image'
  | 'audio'
  | 'sfx'
  | 'music'
  | 'transition'
  | 'font'
  | 'object3d'
  | 'overlay'
  | 'sticker'
  | 'generator';

export type Asset = {
  id: string;
  name: string;
  type: AssetType;
  category: string;
  url: string | null;
  preview_url: string | null;
  premium: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  is_active: boolean;
};

export type UserAsset = {
  id: string;
  user_id: string;
  name: string;
  type: 'video' | 'image' | 'audio' | 'document';
  url: string;
  storage_path: string | null;
  size_bytes: number;
  metadata: { duration?: number; width?: number; height?: number };
  created_at: string;
};

export type DownloadItem = { url: string; type: string; thumb?: string; name?: string };

export type DownloadRecord = {
  id: string;
  source_url: string;
  service: string | null;
  media_type: string | null;
  status: 'pending' | 'ready' | 'error';
  result: {
    status?: string;
    filename?: string;
    items?: DownloadItem[];
    error?: string;
    audio?: string;
  };
  created_at: string;
};
