'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, Download, Loader2, RotateCcw, Save, Scissors, Upload } from 'lucide-react';
import type { Episode } from '@/components/PlayerContext';

const panel = { backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(51,65,85)' };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'transcript';
}

/** Strip the header the .md download adds, so a round-tripped file isn't read aloud with it. */
function stripMarkdownHeader(md: string): string {
  return md.replace(/^# .*\n+(Source: .*\n+)?(---\n+)?/, '');
}

export default function ReviewTranscript() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState<'save' | 'approve' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/episodes/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setEpisode(data);
        setTitle(data.title ?? '');
        setText(data.content ?? '');
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load episode'));
  }, [id]);

  const editable = episode?.status === 'needs_review' || episode?.status === 'awaiting_confirmation';
  const dirty = !!episode && (text !== (episode.content ?? '') || title !== episode.title);

  const save = async (approve: boolean) => {
    setSaving(approve ? 'approve' : 'save');
    setMessage(null);
    try {
      const res = await fetch(`/api/episodes/${id}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, title, approve }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Save failed (HTTP ${res.status})`);
      if (approve) {
        router.push('/');
        return;
      }
      setEpisode(data);
      setMessage({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(null);
    }
  };

  const downloadMarkdown = () => {
    const header = `# ${title}\n\n${episode?.source_url ? `Source: ${episode.source_url}\n\n` : ''}---\n\n`;
    const blob = new Blob([header + text + '\n'], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slugify(title)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const uploadMarkdown = async (file: File) => {
    setText(stripMarkdownHeader(await file.text()).trim());
    setMessage({ ok: true, text: `Loaded ${file.name} — review it, then save.` });
  };

  if (loadError) {
    return <p className="text-sm" style={{ color: '#f87171' }}>{loadError}</p>;
  }
  if (!episode) {
    return <Loader2 className="animate-spin mx-auto mt-10" style={{ color: '#64748b' }} />;
  }

  const notes = episode.review_notes ?? [];
  const removed = episode.removed_content ?? [];
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#94a3b8' }}>
        <ArrowLeft size={15} /> Library
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-white">Review transcript</h1>
        <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
          This is exactly what will be read aloud. Fix anything that&apos;s off before generating audio.
        </p>
      </div>

      {notes.length > 0 && (
        <div className="rounded-xl px-4 py-3 space-y-1.5" style={{ backgroundColor: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#fbbf24' }}>
            <AlertTriangle size={15} /> Flagged for review
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: '#fde68a' }}>
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={!editable}
        className="w-full rounded-xl px-4 py-3 text-sm font-medium text-white outline-none"
        style={panel}
        aria-label="Title"
      />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!editable}
        className="w-full rounded-xl px-4 py-3 text-sm leading-relaxed outline-none resize-y"
        style={{ ...panel, color: '#e2e8f0', minHeight: '55vh' }}
        aria-label="Transcript"
      />
      <p className="text-xs -mt-2" style={{ color: '#64748b' }}>
        {words.toLocaleString()} words · ~{Math.max(1, Math.round(words / 150))} min listen
        {!editable && ` · read-only (episode is ${episode.status})`}
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={downloadMarkdown} className="btn-secondary"><Download size={14} /> Download .md</button>
        {editable && (
          <>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary"><Upload size={14} /> Load edited .md</button>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMarkdown(f); e.target.value = ''; }}
            />
            {episode.original_content && (
              <button
                onClick={() => { if (confirm('Replace the text with the original, uncleaned extraction?')) setText(episode.original_content!); }}
                className="btn-secondary"
              >
                <RotateCcw size={14} /> Use original text
              </button>
            )}
          </>
        )}
      </div>

      {message && (
        <p className="text-sm" style={{ color: message.ok ? '#86efac' : '#f87171' }}>{message.text}</p>
      )}

      {editable && (
        <div className="flex gap-2 sticky bottom-24 z-10">
          <button
            onClick={() => save(false)}
            disabled={!dirty || saving !== null}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-medium disabled:opacity-40"
            style={{ ...panel, color: '#e2e8f0' }}
          >
            {saving === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving !== null || !text.trim()}
            className="flex-[2] flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: '#7c3aed' }}
          >
            {saving === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Looks good — pick a voice
          </button>
        </div>
      )}

      {removed.length > 0 && (
        <details className="rounded-xl px-4 py-3" style={panel}>
          <summary className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: '#94a3b8' }}>
            <Scissors size={14} /> Cut during cleanup ({removed.length})
            {episode.unrelated_share != null && ` · ${(episode.unrelated_share * 100).toFixed(1)}% of the text`}
          </summary>
          <ul className="mt-3 space-y-2">
            {removed.map((r, i) => (
              <li key={i} className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>
                <span className="font-medium" style={{ color: '#fbbf24' }}>{r.reason}</span>
                <p className="mt-1 line-clamp-3 break-words" style={{ color: '#94a3b8' }}>{r.text}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
