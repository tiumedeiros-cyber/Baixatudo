'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CloudUpload,
  Loader2,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import { useStudio } from './store';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { Library } from './Library';
import { ExportButton } from './Exporter';
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
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950">
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
          className="ml-1 w-40 min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-white outline-none hover:border-white/10 focus:border-brand-400/50 sm:w-64"
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
          'grid min-h-0 flex-1 gap-2 p-2',
          showLeft && showRight
            ? 'lg:grid-cols-[264px_minmax(0,1fr)_292px]'
            : showLeft
              ? 'lg:grid-cols-[264px_minmax(0,1fr)]'
              : showRight
                ? 'lg:grid-cols-[minmax(0,1fr)_292px]'
                : 'lg:grid-cols-1',
        )}
      >
        <div className={cn('hidden min-h-0 lg:block', !showLeft && 'lg:hidden')}>
          <Library assets={assets} userAssets={userAssets} premiumAllowed={premiumAllowed} projectId={project.id} />
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <div className="min-h-0 flex-1">
            <Preview />
          </div>
          <div className="h-[38vh] min-h-[200px] shrink-0 lg:h-[34vh]">
            <Timeline />
          </div>
        </div>

        <div className={cn('hidden min-h-0 lg:block', !showRight && 'lg:hidden')}>
          <Inspector />
        </div>
      </div>

      {/* mobile panels */}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/8 bg-ink-900/95 p-2 lg:hidden">
        <button onClick={() => setMobilePanel('library')} className="flex-1 rounded-lg border border-white/10 py-2 text-[11px] font-semibold text-slate-300">
          Biblioteca
        </button>
        <button onClick={() => setMobilePanel('inspector')} className="flex-1 rounded-lg border border-white/10 py-2 text-[11px] font-semibold text-slate-300">
          Propriedades
        </button>
      </div>
      {mobilePanel ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-ink-950/95 p-3 lg:hidden" onClick={() => setMobilePanel(null)}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-white">{mobilePanel === 'library' ? 'Biblioteca' : 'Propriedades'}</span>
            <button className="rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white">Fechar</button>
          </div>
          <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
            {mobilePanel === 'library' ? (
              <Library assets={assets} userAssets={userAssets} premiumAllowed={premiumAllowed} projectId={project.id} />
            ) : (
              <Inspector />
            )}
          </div>
        </div>
      ) : null}

      <footer className="hidden shrink-0 items-center gap-3 border-t border-white/5 px-3 py-1 text-[9px] text-slate-600 sm:flex">
        <span className="flex items-center gap-1"><Save className="h-2.5 w-2.5" /> autosave 2s</span>
        <span>Espaço play/pause</span>
        <span>C/S dividir</span>
        <span>Del excluir</span>
        <span>← → frame</span>
        <span className="ml-auto">{project.width}×{project.height} · {project.fps}fps</span>
      </footer>
    </div>
  );
}
