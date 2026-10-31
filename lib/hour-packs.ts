/** Pacotes do plano por hora — constantes puras (podem ser importadas no cliente). */

export type HourPack = {
  slug: string;
  label: string;
  hours: number;
  price: number;
  perHour: number;
  highlight?: boolean;
  note: string;
};

export const HOUR_PACKS: HourPack[] = [
  { slug: 'hora-1', label: '1 hora', hours: 1, price: 19.9, perHour: 19.9, note: 'Para um projeto pontual.' },
  { slug: 'hora-5', label: '5 horas', hours: 5, price: 79.9, perHour: 15.98, highlight: true, note: 'Melhor custo por hora.' },
  { slug: 'hora-10', label: '10 horas', hours: 10, price: 139.9, perHour: 13.99, note: 'Para quem edita toda semana.' },
];

export function findHourPack(slug: string) {
  return HOUR_PACKS.find((p) => p.slug === slug) ?? null;
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
