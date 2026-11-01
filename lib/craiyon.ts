/**
 * Craiyon — gerador de imagens público e sem cadastro.
 * Usado como segunda opção quando o Pollinations está fora do ar.
 */
export async function craiyon(prompt: string): Promise<Buffer | null> {
  const shapes: Array<{ url: string; headers: Record<string, string>; body: string }> = [
    {
      url: 'https://api.craiyon.com/v3',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, negative_prompt: '', model: 'art', token: null }),
    },
    {
      url: 'https://api.craiyon.com/v3',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ prompt, negative_prompt: '', model: 'art', token: '' }).toString(),
    },
    {
      url: 'https://api.craiyon.com/draw',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ prompt, negative_prompt: '', model: 'art', token: '' }).toString(),
    },
  ];
  for (const shape of shapes) {
    try {
      const res = await fetch(shape.url, {
        method: 'POST',
        headers: { ...shape.headers, Accept: 'application/json', 'User-Agent': 'EditorStudio/1.0' },
        body: shape.body,
        cache: 'no-store',
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { images?: string[]; image?: string };
      const base64 = data.images?.[0] ?? data.image;
      if (base64 && base64.length > 1000) return Buffer.from(base64, 'base64');
    } catch {
      /* tenta o próximo formato */
    }
  }
  return null;
}
