'use client';

/**
 * TransformHandles — controles visuais (molduras) sobre o preview.
 *
 * Módulo 1 · item 2. Camada DOM **por cima** do canvas: não altera o player nem
 * o render (o core continua intocado). Lê a posição real do canvas com
 * ResizeObserver e desenha:
 *
 *   • a moldura do clipe selecionado (arrastar = mover, como já era pelo canvas);
 *   • 4 alças nos cantos → escala proporcional;
 *   • alça giratória em cima → rotação livre.
 *
 * Tudo grava em `transform` do clipe pelo store (mesmo caminho que o inspetor e
 * o arrasto do canvas usam), então preview e exportação ficam iguais.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw, Maximize2 } from 'lucide-react';
import { useStudio } from './store';
import type { Clip } from '@/lib/types';

type Rect = { left: number; top: number; width: number; height: number };

/** Proporção aproximada da área desenhada, por tipo de clipe. */
function frameOf(kind: Clip['kind']) {
  if (kind === 'text') return { w: 0.78, h: 0.28 };
  if (kind === 'object3d' || kind === 'sticker') return { w: 0.5, h: 0.5 };
  return { w: 1, h: 1 };
}

export function TransformHandles({
  canvasRef,
  clip,
  projectWidth,
  projectHeight,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  clip?: Clip;
  projectWidth: number;
  projectHeight: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<
    | { mode: 'scale'; startScale: number; startDist: number }
    | { mode: 'rotate'; startRotation: number; startAngle: number }
    | null
  >(null);

  const playhead = useStudio((s) => s.playhead);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const c = canvas.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    setRect({ left: c.left - h.left, top: c.top - h.top, width: c.width, height: c.height });
  }, [canvasRef]);

  useEffect(() => {
    measure();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [canvasRef, measure]);

  // remede só quando o clipe/tamanho do canvas muda (não a cada frame do play)
  useEffect(() => {
    measure();
  }, [measure, clip?.id]);

  const visible =
    Boolean(clip) &&
    Boolean(rect) &&
    !['audio', 'sfx', 'music', 'overlay'].includes(clip!.kind) &&
    playhead >= clip!.start - 0.001 &&
    playhead < clip!.start + clip!.duration;

  if (!visible || !rect || !clip) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  const factor = rect.width / projectWidth;
  const frame = frameOf(clip.kind);
  const boxW = Math.max(24, projectWidth * frame.w * clip.transform.scale * factor);
  const boxH = Math.max(24, projectHeight * frame.h * clip.transform.scale * factor);
  const cx = rect.left + rect.width / 2 + clip.transform.x * factor;
  const cy = rect.top + rect.height / 2 + clip.transform.y * factor;

  function patch(patchValue: Partial<Clip['transform']>) {
    const id = clip!.id;
    useStudio.setState((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, transform: { ...c.transform, ...patchValue } } : c)),
      dirty: true,
    }));
  }

  function pointerDown(event: React.PointerEvent, mode: 'scale' | 'rotate') {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const local = hostRef.current?.getBoundingClientRect();
    if (!local) return;
    const px = event.clientX - local.left;
    const py = event.clientY - local.top;
    if (mode === 'scale') {
      drag.current = { mode, startScale: clip!.transform.scale, startDist: Math.max(6, Math.hypot(px - cx, py - cy)) };
    } else {
      drag.current = {
        mode,
        startRotation: clip!.transform.rotation,
        startAngle: (Math.atan2(py - cy, px - cx) * 180) / Math.PI,
      };
    }
  }

  function pointerMove(event: React.PointerEvent) {
    const state = drag.current;
    const local = hostRef.current?.getBoundingClientRect();
    if (!state || !local) return;
    event.preventDefault();
    const px = event.clientX - local.left;
    const py = event.clientY - local.top;

    if (state.mode === 'scale') {
      const dist = Math.max(6, Math.hypot(px - cx, py - cy));
      const next = Math.min(8, Math.max(0.05, state.startScale * (dist / state.startDist)));
      patch({ scale: Math.round(next * 100) / 100 });
      return;
    }

    const angle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
    let next = state.startRotation + (angle - state.startAngle);
    // encaixe em ângulos retos quando estiver perto (5°)
    const snapped = Math.round(next / 90) * 90;
    if (Math.abs(next - snapped) < 5) next = snapped;
    patch({ rotation: Math.round(next) });
  }

  function pointerUp() {
    drag.current = null;
  }

  const handleClass =
    'pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500/90 shadow-[0_2px_8px_rgba(0,0,0,0.6)] active:bg-brand-400';

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 select-none" aria-hidden={false}>
      <div
        className="pointer-events-none absolute border-2 border-dashed border-brand-300/90"
        style={{
          left: cx,
          top: cy,
          width: boxW,
          height: boxH,
          transform: `translate(-50%, -50%) rotate(${clip.transform.rotation}deg)`,
        }}
      >
        {/* alças de escala nos 4 cantos */}
        {[
          { x: 0, y: 0, cursor: 'nwse-resize' },
          { x: 1, y: 0, cursor: 'nesw-resize' },
          { x: 0, y: 1, cursor: 'nesw-resize' },
          { x: 1, y: 1, cursor: 'nwse-resize' },
        ].map((corner) => (
          <span
            key={`${corner.x}-${corner.y}`}
            role="button"
            aria-label="Redimensionar camada"
            onPointerDown={(event) => pointerDown(event, 'scale')}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            className={handleClass}
            style={{
              left: `${corner.x * 100}%`,
              top: `${corner.y * 100}%`,
              cursor: corner.cursor,
              touchAction: 'none',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <Maximize2 className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 text-white" />
          </span>
        ))}

        {/* alça de rotação (acima do centro) */}
        <span className="absolute left-1/2 top-0 h-7 w-px -translate-x-1/2 -translate-y-full bg-brand-300/80" />
        <span
          role="button"
          aria-label="Rotacionar camada"
          onPointerDown={(event) => pointerDown(event, 'rotate')}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          className={handleClass}
          style={{ left: '50%', top: 0, cursor: 'grab', touchAction: 'none', transform: 'translate(-50%, -260%)' }}
        >
          <RotateCw className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 text-white" />
        </span>
      </div>
    </div>
  );
}
