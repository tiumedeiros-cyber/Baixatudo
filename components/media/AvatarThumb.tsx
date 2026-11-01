'use client';
import { useEffect, useRef } from 'react';
import { drawAvatar } from '@/components/studio/avatar';

/** Miniatura do avatar desenhado no canvas (mesmo desenho do editor). */
export function AvatarThumb({
  preset,
  className = '',
  mouth = 0.35,
  rounded = 'rounded-xl',
}: {
  preset: string;
  className?: string;
  mouth?: number;
  rounded?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const size = Math.max(120, Math.round(parent?.clientWidth || 220));
    const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const paint = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawAvatar(ctx, preset, 0, 0, size, size, mouth, 0.9);
    };
    paint();
    // repinta enquanto o fundo/retrato termina de carregar (e recortar)
    const timers = [450, 1100, 2200, 4000].map((ms) => setTimeout(paint, ms));
    return () => timers.forEach(clearTimeout);
  }, [preset, mouth]);

  return (
    <div className={`relative overflow-hidden ${rounded} ${className}`}>
      <canvas ref={ref} className="h-full w-full" style={{ aspectRatio: '1 / 1' }} />
    </div>
  );
}
