import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card, Input, Select } from '@/components/ui';
import { saveAsset, uploadCatalogMedia, importCatalogUrl } from '@/app/admin/actions';
import { AssetDelete } from '@/components/admin/ActionButtons';
import { StorageCleanup } from '@/components/admin/StorageCleanup';
import type { Asset } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TYPES = ['video', 'image', 'audio', 'sfx', 'music', 'transition', 'font', 'object3d', 'overlay', 'sticker'];

export default async function AdminLibrary() {
  await requireAdmin();
  const db = createAdminClient();
  const { data } = await db.from('es_assets').select('*').order('created_at', { ascending: false }).limit(300);
  const assets = (data ?? []) as unknown as Asset[];

  // uso real de storage (contador mantido por trigger) e nº de arquivos dos clientes
  const [{ data: usage }, { count: files }] = await Promise.all([
    db.from('es_profiles').select('storage_used_bytes').limit(5000),
    db.from('es_user_assets').select('id', { count: 'exact', head: true }),
  ]);
  const usedBytes = (usage ?? []).reduce((acc, row) => acc + Number((row as { storage_used_bytes: number }).storage_used_bytes || 0), 0);
  const usersWithFiles = (usage ?? []).filter((row) => Number((row as { storage_used_bytes: number }).storage_used_bytes || 0) > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Biblioteca de assets</h1>
        <p className="mt-1 text-sm text-slate-400">{assets.length} itens. Use URLs públicas (MP4, JPG, MP3) ou presets <code>builtin:*</code>.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white">Enviar arquivo do dispositivo</h3>
          <p className="mt-1 text-[11px] text-slate-500">Vídeo, imagem ou áudio — vai direto para o storage e entra na biblioteca.</p>
          <form action={uploadCatalogMedia} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              type="file"
              name="file"
              required
              accept="video/*,image/*,audio/*"
              className="sm:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
            />
            <Input name="category" placeholder="Categoria" defaultValue="geral" />
            <Input name="tags" placeholder="tags, separadas, virgula" />
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" name="premium" className="accent-brand-500" /> Premium</label>
            <button className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-2 text-xs font-semibold text-white">Enviar para a biblioteca</button>
          </form>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white">Importar por link (Drive, Dropbox…)</h3>
          <p className="mt-1 text-[11px] text-slate-500">Aceita arquivo público do Google Drive, pasta pública (até 25 arquivos) e link direto.</p>
          <form action={importCatalogUrl} className="mt-3 grid gap-2 sm:grid-cols-2">
            <Input name="url" placeholder="https://drive.google.com/file/d/…" required className="sm:col-span-2" />
            <Input name="category" placeholder="Categoria" defaultValue="geral" />
            <Input name="tags" placeholder="tags, separadas, virgula" />
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" name="premium" className="accent-brand-500" /> Premium</label>
            <button className="rounded-xl border border-white/15 bg-white/5 py-2 text-xs font-semibold text-white">Importar agora</button>
          </form>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-white">Armazenamento</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          O catálogo do sistema não ocupa storage (vive no código). Aqui aparece só o que os clientes enviaram.
        </p>
        <div className="mt-3">
          <StorageCleanup usedBytes={usedBytes} files={files ?? 0} users={usersWithFiles} />
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-white">Adicionar item manualmente</h3>
        <form action={saveAsset} className="mt-3 grid gap-2 sm:grid-cols-3">
          <Input name="name" placeholder="Nome" required />
          <Select name="type" defaultValue="image">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input name="category" placeholder="Categoria" defaultValue="geral" />
          <Input name="url" placeholder="https://… ou builtin:preset" className="sm:col-span-2" />
          <Input name="tags" placeholder="tags, separadas, virgula" />
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" name="premium" className="accent-brand-500" /> Premium</label>
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" name="is_active" defaultChecked className="accent-brand-500" /> Ativo</label>
          <button className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-2 text-xs font-semibold text-white">Adicionar</button>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">URL</th><th className="px-4 py-3">Premium</th><th className="px-4 py-3">Ativo</th><th className="px-4 py-3">Ações</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {assets.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2 text-xs font-medium text-white">{a.name}</td>
                <td className="px-4 py-2 text-xs text-slate-400">{a.type}</td>
                <td className="max-w-[220px] truncate px-4 py-2 text-[11px] text-slate-500">{a.url}</td>
                <td className="px-4 py-2">{a.premium ? <Badge tone="warning">premium</Badge> : <Badge>free</Badge>}</td>
                <td className="px-4 py-2">{a.is_active ? <Badge tone="success">sim</Badge> : <Badge tone="danger">não</Badge>}</td>
                <td className="px-4 py-2"><AssetDelete id={a.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
