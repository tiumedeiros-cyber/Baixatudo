import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { clientIp, rateLimit } from '@/lib/rate-limit';
// Garante que o gerador rode no bundler do servidor (não no navegador).
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

/**
 * GET /api/free/qr?text=… → PNG do QR Code gerado aqui mesmo (sem serviço externo).
 * Assim o QR nunca depende de terceiros e funciona offline do lado do cliente.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`qr:${clientIp(request.headers)}`, 40, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos. Aguarde um minuto.' }, { status: 429 });
  const url = new URL(request.url);
  const text = (url.searchParams.get('text') || '').slice(0, 900);
  if (!text) return NextResponse.json({ error: 'Informe o texto do QR Code.' }, { status: 400 });
  const size = Math.min(1200, Math.max(160, Number(url.searchParams.get('size') || 600)));
  try {
    const png = await QRCode.toBuffer(text, {
      type: 'png',
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000ff', light: '#ffffffff' },
    });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao gerar o QR Code.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
