'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, FileText, Loader2, Mic2 } from 'lucide-react';

type Mode = 'url' | 'text';

export default function AddEpisode() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [isInterview, setIsInterview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const body =
        mode === 'url'
          ? { sourceUrl: url, title: title || undefined, isInterview }
          : { content: text, title: title || 'Pasted Article', isInterview };

      const res = await fetch('/api/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create episode');
      }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-white mb-6">Add Article</h1>

      {/* Mode toggle */}
      <div
        className="flex rounded-xl p-1 mb-6"
        style={{ backgroundColor: 'rgb(15,23,42)' }}
      >
        {(['url', 'text'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: mode === m ? '#7c3aed' : 'transparent',
              color: mode === m ? 'white' : '#94a3b8',
            }}
          >
            {m === 'url' ? <Link2 size={15} /> : <FileText size={15} />}
            {m === 'url' ? 'From URL' : 'Paste Text'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'url' ? (
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Article URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              required
              className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:ring-2"
              style={{
                backgroundColor: 'rgb(15,23,42)',
                border: '1px solid rgb(51,65,85)',
              }}
            />
            <p className="text-xs mt-2" style={{ color: '#64748b' }}>
              Works with most public articles. For paywalled content, use the Paste Text tab.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Article Text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full article text here…"
              required
              rows={10}
              className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 resize-none"
              style={{
                backgroundColor: 'rgb(15,23,42)',
                border: '1px solid rgb(51,65,85)',
              }}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Title <span style={{ color: '#64748b' }}>(optional)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === 'url' ? 'Auto-detected from article' : 'Give this episode a name'}
            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:ring-2"
            style={{
              backgroundColor: 'rgb(15,23,42)',
              border: '1px solid rgb(51,65,85)',
            }}
          />
        </div>

        {/* Interview transcript toggle */}
        <label
          className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer select-none"
          style={{ backgroundColor: isInterview ? 'rgba(124,58,237,0.1)' : 'rgb(15,23,42)', border: `1px solid ${isInterview ? 'rgba(124,58,237,0.4)' : 'rgb(51,65,85)'}` }}
        >
          <input
            type="checkbox"
            checked={isInterview}
            onChange={(e) => setIsInterview(e.target.checked)}
            className="sr-only"
          />
          <div
            className="flex-shrink-0 w-9 h-5 rounded-full transition-colors relative"
            style={{ backgroundColor: isInterview ? '#7c3aed' : 'rgb(51,65,85)' }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
              style={{ transform: isInterview ? 'translateX(18px)' : 'translateX(2px)' }}
            />
          </div>
          <Mic2 size={15} style={{ color: isInterview ? '#a78bfa' : '#64748b' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: isInterview ? '#e2e8f0' : '#94a3b8' }}>
              Interview transcript
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Assigns distinct voices per speaker (fable, onyx, nova)
            </p>
          </div>
        </label>

        {error && (
          <p className="text-sm rounded-xl px-4 py-3" style={{ color: '#f87171', backgroundColor: 'rgba(239,68,68,0.1)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60"
          style={{ backgroundColor: '#7c3aed' }}
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Submitting…
            </>
          ) : (
            'Convert to Podcast'
          )}
        </button>
      </form>
    </div>
  );
}
