import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Editor Studio — Edição profissional de vídeo e imagem na nuvem',
  description:
    'Editor Studio: timeline profissional, biblioteca de assets, objetos 3D, narração por IA e downloader integrado. Edite vídeos e imagens direto no navegador.',
  applicationName: 'Editor Studio',
  keywords: ['editor de vídeo', 'editor de imagens', 'saas', 'timeline', 'edição profissional'],
  openGraph: {
    title: 'Editor Studio',
    description: 'Edição profissional de vídeo e imagem no navegador, com timeline, 3D, TTS e biblioteca infinita.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#05060a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
