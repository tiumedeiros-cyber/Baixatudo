'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CloudUpload,
  Loader2,
  Menu,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Settings2,
  Undo2,
} from 'lucide-react';
import { useStudio } from './store';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { Library } from './Library';
import { Drawer } from './Drawer';
import { ExportButton } from './Exporter';
// Módulo Premium (isolado): contexto global + modal de upgrade
import { SubscriptionProvider } from '@/components/billing/SubscriptionContext';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Asset, Project, UserAsset } from '@/lib/types';

export function Studio({
  project,
  assets,
  userAssets,
  maxQuality,
  premiumAllowed,
}: {
  project: Project;
  assets: Asset[];
  userAssets: UserAsset[];
  maxQuality: number;
  premiumAllowed: boolean;
}) {
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<'library' | 'inspector' | null>(null);
  const loadedRef = useRef(false);
  const name = useStudio((s) => s.name);
  const dirty = useStudio((s) => s.dirty);
  const clips = useStudio((s) => s.clips);
  const tracks = useStudio((s) => s.tracks);
  const duration = useStudio((s) => s.duration);
  const background = useStudio((s) => s.background);

  // garante que as fontes da biblioteca estejam prontas para o canvas
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    const families = ['Inter', 'Poppins', 'Montserrat', 'Bebas Neue', 'Anton', 'Playfair Display'];
    families.forEach((family) => {
      void document.fonts.load(`900 64px "${family}"`).catch(() => undefined);
      void document.fonts.load(`400 16px "${family}"`).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    useStudio.getState().load({
      id: project.id,
      name: project.name,
      width: project.width,
      height: project.height,
      fps: project.fps,
      duration: project.duration,
      background: project.background,
      timeline: project.timeline,
    });
  }, [project]);

  // autosave a cada mudança (debounce 2s)
  useEffect(() => {
    if (!loadedRef.current || !dirty) return;
    setStatus('dirty');
    const timer = setTimeout(async () => {
      setStatus('saving');
      const supabase = createClient();
      const s = useStudio.getState();
      const max = s.clips.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0);
      const { error } = await supabase
        .from('es_projects')
        .update({
          name: s.name,
          duration: Math.max(s.duration, Math.ceil(max)),
          background: s.background,
          width: s.width,
          height: s.height,
          timeline: { tracks: s.tracks, clips: s.clips },
        })
        .eq('id', project.id);
      if (!error) {
        useStudio.getState().markSaved();
        setStatus('saved');
      } else {
        setStatus('dirty');
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [dirty, clips, tracks, name, duration, background, project.id]);

  // aviso ao sair com alterações pendentes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useStudio.getState().dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // atalhos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      const s = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (e.code === 'Space') {
        e.preventDefault();
        s.setPlaying(!s.playing);
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (s.selectedId) s.duplicateClip(s.selectedId);
        return;
      }
      if (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 's') {
        if (mod) return;
        e.preventDefault();
        s.splitAtPlayhead();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedId) {
          e.preventDefault();
          s.removeClip(s.selectedId);
        }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / s.fps;
        s.setPlayhead(Math.max(0, Math.min(s.duration, s.playhead + (e.key === 'ArrowRight' ? step : -step))));
        return;
      }
      if (e.key === 'Home') {
        s.setPlayhead(0);
        return;
      }
      if (e.key === 'End') {
        s.setPlayhead(s.duration);
        return;
      }
      if (e.key === 'Escape') s.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <SubscriptionProvider>
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-ink-950">
      {/* topbar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/8 bg-ink-900/90 px-2">
        <Link href="/dashboard/projetos" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" title="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="hidden text-[10px] font-bold uppercase tracking-wider text-brand-300 sm:block">Editor Studio</span>
        </div>
        <input
          value={name}
          onChange={(e) => useStudio.getState().setName(e.target.value)}
          className="ml-1 w-full min-w-0 max-w-[9rem] rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-white outline-none hover:border-white/10 focus:border-brand-400/50 sm:max-w-none sm:w-64"
        />
        <span
          className={cn(
            'hidden items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:flex',
            status === 'saved' ? 'bg-emerald-500/12 text-emerald-300' : status === 'saving' ? 'bg-amber-500/12 text-amber-300' : 'bg-white/8 text-slate-400',
          )}
        >
          {status === 'saved' ? <Check className="h-2.5 w-2.5" /> : status === 'saving' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CloudUpload className="h-2.5 w-2.5" />}
          {status === 'saved' ? 'salvo' : status === 'saving' ? 'salvando' : 'alterado'}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => useStudio.getState().undo()} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" title="Desfazer (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </button>
          <button onClick={() => useStudio.getState().redo()} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" title="Refazer (Ctrl+Shift+Z)">
            <Redo2 className="h-4 w-4" />
          </button>
          {/* celular: hambúrguer abre a biblioteca; engrenagem abre os ajustes */}
          <button
            onClick={() => setMobilePanel((v) => (v === 'library' ? null : 'library'))}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
            title="Elementos"
            aria-label="Abrir biblioteca de elementos"
            aria-expanded={mobilePanel === 'library'}
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            onClick={() => setMobilePanel((v) => (v === 'inspector' ? null : 'inspector'))}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
            title="Ajustes"
            aria-label="Abrir ajustes do elemento"
            aria-expanded={mobilePanel === 'inspector'}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button onClick={() => setShowLeft((v) => !v)} className="hidden h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:grid" title="Biblioteca">
            <PanelLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setShowRight((v) => !v)} className="hidden h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:grid" title="Propriedades">
            <PanelRight className="h-4 w-4" />
          </button>
          <ExportButton maxQuality={maxQuality} />
        </div>
      </header>

      <div
        className={cn(
          'grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-2 overflow-hidden p-2',
          showLeft && showRight
            ? 'lg:grid-cols-[264px_minmax(0,1fr)_292px]'
            : showLeft
              ? 'lg:grid-cols-[264px_minmax(0,1fr)]'
              : showRight
                ? 'lg:grid-cols-[minmax(0,1fr)_292px]'
                : 'lg:grid-cols-1',
        )}
      >
        <div className={cn('hidden min-h-0 min-w-0 lg:block', !showLeft && 'lg:hidden')}>
          <Library assets={assets} userAssets={userAssets} premiumAllowed={premiumAllowed} projectId={project.id} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <Preview />
          </div>
          <div className="h-[40dvh] max-h-[46dvh] min-h-[150px] shrink-0 lg:h-[34vh] lg:max-h-none">
            <Timeline />
          </div>
        </div>

        <div className={cn('hidden min-h-0 min-w-0 lg:block', !showRight && 'lg:hidden')}>
          <Inspector />
        </div>
      </div>

      {/* barra inferior (celular) */}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/8 bg-ink-900 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
        <button
          onClick={() => setMobilePanel('library')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-2.5 text-[11px] font-semibold text-slate-200"
        >
          <PanelLeft className="h-3.5 w-3.5" /> Elementos
        </button>
        <button
          onClick={() => setMobilePanel('inspector')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-2.5 text-[11px] font-semibold text-slate-200"
        >
          <PanelRight className="h-3.5 w-3.5" /> Ajustes
        </button>
      </div>

      {/* gaveta offcanvas (celular / tablet) — animada, não espreme o editor */}
      <Drawer
        open={mobilePanel !== null}
        onClose={() => setMobilePanel(null)}
        title={mobilePanel === 'inspector' ? 'Ajustes do elemento' : 'Biblioteca de elementos'}
        icon={mobilePanel === 'inspector' ? <Settings2 className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => setMobilePanel('library')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-semibold transition',
                mobilePanel === 'library' ? 'border-brand-400/60 bg-brand-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300',
              )}
            >
              <PanelLeft className="h-3.5 w-3.5" /> Elementos
            </button>
            <button
              onClick={() => setMobilePanel('inspector')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-semibold transition',
                mobilePanel === 'inspector' ? 'border-brand-400/60 bg-brand-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300',
              )}
            >
              <PanelRight className="h-3.5 w-3.5" /> Ajustes
            </button>
          </div>
        }
      >
        {mobilePanel === 'inspector' ? (
          <Inspector />
        ) : (
          <Library assets={assets} userAssets={userAssets} premiumAllowed={premiumAllowed} projectId={project.id} />
        )}
      </Drawer>

      <footer className="hidden shrink-0 items-center gap-3 border-t border-white/5 px-3 py-1 text-[9px] text-slate-600 sm:flex">
        <span className="flex items-center gap-1"><Save className="h-2.5 w-2.5" /> autosave 2s</span>
        <span>Espaço play/pause</span>
        <span>C/S dividir</span>
        <span>Del excluir</span>
        <span>← → frame</span>
        <span className="ml-auto">{project.width}×{project.height} · {project.fps}fps</span>
      </footer>
    </div>
    <UpgradeModal />
    </SubscriptionProvider>
  );
}
