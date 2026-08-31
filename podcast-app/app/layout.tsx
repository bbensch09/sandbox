import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PlayerProvider } from '@/components/PlayerContext';
import AudioPlayer from '@/components/AudioPlayer';
import Link from 'next/link';
import { Headphones, Plus, Settings } from 'lucide-react';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'ArticleCast',
  description: 'Turn articles into podcasts',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ArticleCast',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0f1e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-screen" style={{ backgroundColor: '#0a0f1e' }}>
        <PlayerProvider>
          {/* Top nav */}
          <header
            className="sticky top-0 z-40 border-b"
            style={{
              backgroundColor: 'rgba(10,15,30,0.92)',
              backdropFilter: 'blur(12px)',
              borderColor: 'rgb(30,41,59)',
            }}
          >
            <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 font-semibold text-white">
                <Headphones size={20} style={{ color: '#a78bfa' }} />
                ArticleCast
              </Link>
              <div className="flex items-center gap-2">
                <Link
                  href="/add"
                  className="flex items-center gap-1.5 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: '#7c3aed' }}
                >
                  <Plus size={15} />
                  Add Article
                </Link>
                <Link
                  href="/settings"
                  className="p-2 transition-colors"
                  style={{ color: '#94a3b8' }}
                  aria-label="Settings"
                >
                  <Settings size={18} />
                </Link>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="max-w-2xl mx-auto px-4 pt-6 pb-36">
            {children}
          </main>

          {/* Persistent podcast player */}
          <AudioPlayer />
        </PlayerProvider>
        <Analytics />
      </body>
    </html>
  );
}
