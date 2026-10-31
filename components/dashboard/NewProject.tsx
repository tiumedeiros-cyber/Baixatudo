'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clapperboard, Image as ImageIcon, Loader2, Plus, X } from 'lucide-react';
import { createProject } from '@/app/dashboard/actions';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export function NewProjectButton({ label = 'Novo projeto' }: { label?: string }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get('novo') === '1');
  const [pending, setPending] = useState(false);
  const [type, setType] = useState<'video' | 'image'>('video');
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="h-4 w-4" /> {label}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-md p-6" >
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">Criar projeto</h3>
                  <p className="text-xs text-slate-400">Escolha o formato inicial — dá para trocar depois.</p>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                action={async (fd) => {
                  setPending(true);
                  try {
                    await createProject(fd);
                  } finally {
                    setPending(false);
                    router.refresh();
                  }
                }}
                className="mt-5 space-y-4"
              >
                <input type="hidden" name="type" value={type} />
                <Field label="Nome do projeto">
                  <Input name="name" placeholder="Ex: Reels lançamento" autoFocus required />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'video', label: 'Vídeo', icon: Clapperboard },
                    { v: 'image', label: 'Imagem', icon: ImageIcon },
                  ].map((opt) => (
                    <button
                      type="button"
                      key={opt.v}
                      onClick={() => setType(opt.v as 'video' | 'image')}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                        type === opt.v ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 text-slate-400 hover:bg-white/5'
                      }`}
                    >
                      <opt.icon className="h-4 w-4" /> {opt.label}
                    </button>
                  ))}
                </div>
                <Field label="Proporção">
                  <Select name="ratio" defaultValue="16:9">
                    <option value="16:9">16:9 · YouTube (1920×1080)</option>
                    <option value="9:16">9:16 · Reels/TikTok (1080×1920)</option>
                    <option value="1:1">1:1 · Feed (1080×1080)</option>
                    <option value="4:5">4:5 · Instagram (1080×1350)</option>
                    <option value="4:3">4:3 · Clássico (1440×1080)</option>
                  </Select>
                </Field>
                <Button type="submit" className="w-full" size="lg" disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar e abrir editor
                </Button>
              </form>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
