export const brl = (cents = 0, currency = 'BRL', locale = 'pt-BR') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format((cents || 0) / 100);

export const compactBrl = (cents = 0) => {
  const value = (cents || 0) / 100;
  if (Math.abs(value) >= 1000000) return `R$ ${(value / 1000000).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(value) >= 1000) return `R$ ${(value / 1000).toFixed(1).replace('.', ',')}k`;
  return brl(cents);
};

export const parseLocalDate = (value: string) => {
  if (!value) return new Date();
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.slice(0, 5).split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

export const dateStr = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const timeStr = (value: string) => (value || '').slice(11, 16);

export const fmtDate = (value: string, opts: Intl.DateTimeFormatOptions = {}) => {
  const date = value?.includes('T') ? parseLocalDate(value) : parseLocalDate(`${value}T12:00`);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', ...opts }).format(date);
};

export const fmtShort = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(parseLocalDate(value));

export const fmtWeekday = (value: string, short = true) =>
  new Intl.DateTimeFormat('pt-BR', { weekday: short ? 'short' : 'long' }).format(
    value?.includes('T') ? parseLocalDate(value) : parseLocalDate(`${value}T12:00`)
  );

export const fmtDateTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    parseLocalDate(value)
  );

export const relative = (value: string) => {
  const diff = parseLocalDate(value).getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
};

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export const durationLabel = (min = 0) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

export const statusStyle: Record<string, string> = {
  pendente: 'bg-brass-400/15 text-brass-200 border-brass-400/30',
  confirmado: 'bg-moss-400/15 text-moss-400 border-moss-400/30',
  em_atendimento: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
  concluido: 'bg-white/10 text-cream-200 border-white/20',
  cancelado: 'bg-rose-400/15 text-rose-400 border-rose-400/30',
  no_show: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
};

export const statusLabel: Record<string, string> = {
  pendente: 'Aguardando',
  confirmado: 'Confirmado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  no_show: 'Não compareceu',
};

export const paymentLabel: Record<string, string> = {
  card: 'Cartão',
  pix: 'Pix',
  boleto: 'Boleto',
  onsite: 'No local',
  preauth: 'Pré-autorização',
};

export const paymentStatusLabel: Record<string, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  autorizado: 'Pré-autorizado',
  reembolsado: 'Reembolsado',
  cancelado: 'Cancelado',
  falhou: 'Falhou',
};

export const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const startOfWeek = (date: Date, weekStartsOn = 1) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const monthMatrix = (month: Date) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first, 0);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};
