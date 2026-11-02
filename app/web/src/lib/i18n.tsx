import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'pt-BR' | 'en' | 'es';

type Dict = Record<string, string>;

const pt: Dict = {
  'nav.services': 'Serviços',
  'nav.professionals': 'Barbeiros',
  'nav.plans': 'Clube',
  'nav.reviews': 'Avaliações',
  'nav.book': 'Agendar',
  'nav.login': 'Entrar',
  'nav.account': 'Minha conta',
  'nav.panel': 'Painel',
  'hero.eyebrow': 'Barbearia · desde 2014',
  'hero.title': 'Corte impecável, agenda sem atrito.',
  'hero.subtitle':
    'Reserve em três toques, escolha seu barbeiro, pague como quiser e acompanhe sua fila em tempo real. Feito para quem valoriza tempo.',
  'hero.cta': 'Agendar agora',
  'hero.secondary': 'Conhecer o clube',
  'hero.stat1': 'clientes atendidos',
  'hero.stat2': 'avaliação média',
  'hero.stat3': 'unidades',
  'services.title': 'Serviços',
  'services.subtitle': 'Do clássico ao contemporâneo — preços e duração transparentes.',
  'pro.title': 'Quem cuida do seu visual',
  'pro.subtitle': 'Barbeiros com especialidade, agenda própria e avaliação real.',
  'plans.title': 'Clube Navalha',
  'plans.subtitle': 'Assinatura mensal com créditos, descontos e prioridade na agenda.',
  'reviews.title': 'Quem senta na cadeira, volta',
  'faq.title': 'Dúvidas frequentes',
  'booking.title': 'Agende seu horário',
  'booking.step1': 'Serviços',
  'booking.step2': 'Data e barbeiro',
  'booking.step3': 'Confirmação',
  'booking.any': 'Qualquer barbeiro disponível',
  'booking.pickSlot': 'Escolha um horário',
  'booking.summary': 'Resumo',
  'booking.confirm': 'Confirmar agendamento',
  'booking.success': 'Agendamento confirmado!',
  'common.loading': 'Carregando…',
  'common.empty': 'Nada por aqui ainda.',
  'common.save': 'Salvar',
  'common.cancel': 'Cancelar',
  'common.back': 'Voltar',
  'common.next': 'Continuar',
  'common.search': 'Buscar',
  'footer.rights': 'Todos os direitos reservados.',
};

const en: Dict = {
  'nav.services': 'Services',
  'nav.professionals': 'Barbers',
  'nav.plans': 'Club',
  'nav.reviews': 'Reviews',
  'nav.book': 'Book now',
  'nav.login': 'Sign in',
  'nav.account': 'My account',
  'nav.panel': 'Dashboard',
  'hero.eyebrow': 'Barbershop · since 2014',
  'hero.title': 'A sharp cut, a frictionless calendar.',
  'hero.subtitle':
    'Book in three taps, pick your barber, pay however you like and follow the live queue. Built for people who value time.',
  'hero.cta': 'Book now',
  'hero.secondary': 'Explore the club',
  'hero.stat1': 'clients served',
  'hero.stat2': 'average rating',
  'hero.stat3': 'locations',
  'services.title': 'Services',
  'services.subtitle': 'From classic to contemporary — transparent prices and durations.',
  'pro.title': 'The people behind the chair',
  'pro.subtitle': 'Specialists with their own calendar and real reviews.',
  'plans.title': 'Navalha Club',
  'plans.subtitle': 'Monthly membership with credits, discounts and booking priority.',
  'reviews.title': 'They always come back',
  'faq.title': 'Frequently asked',
  'booking.title': 'Book your slot',
  'booking.step1': 'Services',
  'booking.step2': 'Date & barber',
  'booking.step3': 'Confirm',
  'booking.any': 'Any available barber',
  'booking.pickSlot': 'Pick a time',
  'booking.summary': 'Summary',
  'booking.confirm': 'Confirm booking',
  'booking.success': 'Booking confirmed!',
  'common.loading': 'Loading…',
  'common.empty': 'Nothing here yet.',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.back': 'Back',
  'common.next': 'Continue',
  'common.search': 'Search',
  'footer.rights': 'All rights reserved.',
};

const es: Dict = {
  'nav.services': 'Servicios',
  'nav.professionals': 'Barberos',
  'nav.plans': 'Club',
  'nav.reviews': 'Reseñas',
  'nav.book': 'Reservar',
  'nav.login': 'Entrar',
  'nav.account': 'Mi cuenta',
  'nav.panel': 'Panel',
  'hero.eyebrow': 'Barbería · desde 2014',
  'hero.title': 'Corte impecable, agenda sin fricción.',
  'hero.subtitle':
    'Reserva en tres toques, elige tu barbero, paga como prefieras y sigue la fila en tiempo real. Hecho para quienes valoran su tiempo.',
  'hero.cta': 'Reservar ahora',
  'hero.secondary': 'Conocer el club',
  'hero.stat1': 'clientes atendidos',
  'hero.stat2': 'valoración media',
  'hero.stat3': 'unidades',
  'services.title': 'Servicios',
  'services.subtitle': 'De lo clásico a lo contemporáneo — precios y duración transparentes.',
  'pro.title': 'Quienes cuidan tu estilo',
  'pro.subtitle': 'Barberos especialistas con agenda propia y reseñas reales.',
  'plans.title': 'Club Navalha',
  'plans.subtitle': 'Suscripción mensual con créditos, descuentos y prioridad.',
  'reviews.title': 'Siempre vuelven',
  'faq.title': 'Preguntas frecuentes',
  'booking.title': 'Reserva tu horario',
  'booking.step1': 'Servicios',
  'booking.step2': 'Fecha y barbero',
  'booking.step3': 'Confirmar',
  'booking.any': 'Cualquier barbero disponible',
  'booking.pickSlot': 'Elegí un horario',
  'booking.summary': 'Resumen',
  'booking.confirm': 'Confirmar reserva',
  'booking.success': '¡Reserva confirmada!',
  'common.loading': 'Cargando…',
  'common.empty': 'Nada por aquí todavía.',
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.back': 'Volver',
  'common.next': 'Continuar',
  'common.search': 'Buscar',
  'footer.rights': 'Todos los derechos reservados.',
};

const dicts: Record<Locale, Dict> = { 'pt-BR': pt, en, es };

const locales = [
  { code: 'pt-BR' as Locale, flag: '🇧🇷', label: 'Português' },
  { code: 'en' as Locale, flag: '🇺🇸', label: 'English' },
  { code: 'es' as Locale, flag: '🇪🇸', label: 'Español' },
];

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  locales: typeof locales;
};

const I18nContext = createContext<I18nContextValue>({
  locale: 'pt-BR',
  setLocale: () => {},
  t: (key) => key,
  locales,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => (localStorage.getItem('navalha.locale') as Locale) || 'pt-BR');

  useEffect(() => {
    localStorage.setItem('navalha.locale', locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale: (next: Locale) => setLocaleState(next),
      t: (key: string) => dicts[locale][key] ?? dicts['pt-BR'][key] ?? key,
      locales,
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
