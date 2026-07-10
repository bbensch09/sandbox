'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, RefreshCw, Plus, X, LogOut } from 'lucide-react';
import { createClientSupabase } from '@/lib/supabase-client';
import { OPENAI_VOICES } from '@/lib/openai-tts';
import { INWORLD_VOICES } from '@/lib/inworld-tts';
import type { User } from '@supabase/supabase-js';

interface Voice {
  voice_id: string;
  name: string;
}

interface Settings {
  has_elevenlabs_key: boolean;
  has_openai_key: boolean;
  has_inworld_key: boolean;
  elevenlabs_voice_id: string;
  elevenlabs_voice_name: string;
  openai_voice: string;
  inworld_voice: string;
  allowed_emails: string[];
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  // ElevenLabs fields
  const [elevenlabsKey, setElevenlabsKey] = useState('');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(false);

  // OpenAI fields
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiVoice, setOpenaiVoice] = useState('onyx');

  // Inworld fields
  const [inworldKey, setInworldKey] = useState('');
  const [inworldVoice, setInworldVoice] = useState('Dennis');

  // Access control
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Load user
  useEffect(() => {
    const supabase = createClientSupabase();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setAuthChecked(true);
    });
  }, []);

  // Load settings
  useEffect(() => {
    if (!authChecked || !user) return;
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data: Settings) => {
        setSettings(data);
        setSelectedVoiceId(data.elevenlabs_voice_id ?? '');
        setSelectedVoiceName(data.elevenlabs_voice_name ?? '');
        setOpenaiVoice(data.openai_voice ?? 'onyx');
        setInworldVoice(data.inworld_voice ?? 'Dennis');
        setAllowedEmails(data.allowed_emails ?? []);
      });
  }, [authChecked, user]);

  const handleSignOut = async () => {
    const supabase = createClientSupabase();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const loadVoices = async () => {
    setLoadingVoices(true);
    setError('');
    try {
      const res = await fetch('/api/voices');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status} loading voices`);
      setVoices((data as Voice[]).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load voices');
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        allowed_emails: allowedEmails,
        openai_voice: openaiVoice,
        inworld_voice: inworldVoice,
      };
      if (elevenlabsKey.trim()) body.elevenlabs_api_key = elevenlabsKey.trim();
      if (selectedVoiceId) body.elevenlabs_voice_id = selectedVoiceId;
      if (selectedVoiceName) body.elevenlabs_voice_name = selectedVoiceName;
      if (openaiKey.trim()) body.openai_api_key = openaiKey.trim();
      if (inworldKey.trim()) body.inworld_api_key = inworldKey.trim();

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save settings');
      }

      setElevenlabsKey('');
      setOpenaiKey('');
      setInworldKey('');
      setSettings((s) =>
        s ? {
          ...s,
          has_elevenlabs_key: s.has_elevenlabs_key || !!body.elevenlabs_api_key,
          has_openai_key: s.has_openai_key || !!body.openai_api_key,
          has_inworld_key: s.has_inworld_key || !!body.inworld_api_key,
          elevenlabs_voice_id: (body.elevenlabs_voice_id as string) || s.elevenlabs_voice_id,
          elevenlabs_voice_name: (body.elevenlabs_voice_name as string) || s.elevenlabs_voice_name,
          openai_voice: openaiVoice,
          inworld_voice: inworldVoice,
          allowed_emails: allowedEmails,
        } : s,
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Loading auth
  if (!authChecked) {
    return (
      <div className="flex justify-center pt-20">
        <Loader2 size={24} className="animate-spin" style={{ color: '#7c3aed' }} />
      </div>
    );
  }

  // Not in allowed list
  if (user && settings && !settings.allowed_emails.includes(user.email ?? '')) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <p className="text-white font-medium">Access restricted</p>
        <p className="text-sm" style={{ color: '#94a3b8' }}>
          {user.email} doesn&apos;t have access to settings.<br />
          Contact Brian to request access.
        </p>
        <button
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl transition-colors"
          style={{ color: '#94a3b8', backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(30,41,59)' }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    );
  }

  // Loading settings
  if (!settings) {
    return (
      <div className="flex justify-center pt-20">
        <Loader2 size={24} className="animate-spin" style={{ color: '#7c3aed' }} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#64748b' }}>{user.email}</span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: '#94a3b8' }}
              aria-label="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ElevenLabs */}
      <div
        className="rounded-2xl p-5 space-y-5"
        style={{ backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(30,41,59)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
          ElevenLabs
        </p>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-white">API Key</label>
            {settings.has_elevenlabs_key && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)' }}>
                Key saved
              </span>
            )}
          </div>
          <input
            type="password"
            value={elevenlabsKey}
            onChange={(e) => setElevenlabsKey(e.target.value)}
            placeholder={settings.has_elevenlabs_key ? '•••••••••••• (leave blank to keep current)' : 'sk_...'}
            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
            style={{ backgroundColor: 'rgb(2,6,23)', border: '1px solid rgb(51,65,85)' }}
          />
          <p className="text-xs mt-1.5" style={{ color: '#64748b' }}>
            elevenlabs.io → Profile → API Key (enable voices_read scope)
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-white">Voice</label>
            <button
              onClick={loadVoices}
              disabled={loadingVoices}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: '#a78bfa' }}
            >
              {loadingVoices ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Load my voices
            </button>
          </div>

          {voices.length > 0 ? (
            <select
              value={selectedVoiceId}
              onChange={(e) => {
                const v = voices.find((v) => v.voice_id === e.target.value);
                if (v) { setSelectedVoiceId(v.voice_id); setSelectedVoiceName(v.name); }
              }}
              className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
              style={{ backgroundColor: 'rgb(2,6,23)', border: '1px solid rgb(51,65,85)' }}
            >
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
              ))}
            </select>
          ) : (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{ backgroundColor: 'rgb(2,6,23)', border: '1px solid rgb(51,65,85)', color: '#64748b' }}
            >
              Current: {settings.elevenlabs_voice_name}
            </div>
          )}
        </div>
      </div>

      {/* OpenAI */}
      <div
        className="rounded-2xl p-5 space-y-5"
        style={{ backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(30,41,59)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
          OpenAI TTS
        </p>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-white">API Key</label>
            {settings.has_openai_key && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)' }}>
                Key saved
              </span>
            )}
          </div>
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder={settings.has_openai_key ? '•••••••••••• (leave blank to keep current)' : 'sk-...'}
            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
            style={{ backgroundColor: 'rgb(2,6,23)', border: '1px solid rgb(51,65,85)' }}
          />
          <p className="text-xs mt-1.5" style={{ color: '#64748b' }}>
            platform.openai.com → API keys
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-white block mb-1.5">Voice</label>
          <select
            value={openaiVoice}
            onChange={(e) => setOpenaiVoice(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
            style={{ backgroundColor: 'rgb(2,6,23)', border: '1px solid rgb(51,65,85)' }}
          >
            {OPENAI_VOICES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Inworld AI */}
      <div
        className="rounded-2xl p-5 space-y-5"
        style={{ backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(30,41,59)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
          Inworld AI TTS
        </p>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-white">API Key</label>
            {settings.has_inworld_key && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)' }}>
                Key saved
              </span>
            )}
          </div>
          <input
            type="password"
            value={inworldKey}
            onChange={(e) => setInworldKey(e.target.value)}
            placeholder={settings.has_inworld_key ? '•••••••••••• (leave blank to keep current)' : 'Paste API key…'}
            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
            style={{ backgroundColor: 'rgb(2,6,23)', border: '1px solid rgb(51,65,85)' }}
          />
          <p className="text-xs mt-1.5" style={{ color: '#64748b' }}>
            inworld.ai → Studio → API Keys → Create key → copy the key value
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-white block mb-1.5">Default Voice</label>
          <select
            value={inworldVoice}
            onChange={(e) => setInworldVoice(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
            style={{ backgroundColor: 'rgb(2,6,23)', border: '1px solid rgb(51,65,85)' }}
          >
            {INWORLD_VOICES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <p className="text-xs mt-1.5" style={{ color: '#64748b' }}>
            Interview mode uses Sarah, Dennis, Oliver &amp; Claire for up to 4 distinct speaker voices.
          </p>
        </div>
      </div>

      {/* Access control */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(30,41,59)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
          Access Control
        </p>

        <div className="space-y-2">
          {allowedEmails.map((email) => (
            <div key={email} className="flex items-center justify-between gap-2">
              <span className="text-sm text-white truncate">{email}</span>
              <button
                onClick={() => setAllowedEmails((prev) => prev.filter((e) => e !== email))}
                className="flex-shrink-0 p-1 rounded transition-colors"
                style={{ color: '#94a3b8' }}
                aria-label={`Remove ${email}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newEmail.trim()) {
                setAllowedEmails((prev) => [...new Set([...prev, newEmail.trim().toLowerCase()])]);
                setNewEmail('');
              }
            }}
            placeholder="user@example.com"
            className="flex-1 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none"
            style={{ backgroundColor: 'rgb(2,6,23)', border: '1px solid rgb(51,65,85)' }}
          />
          <button
            onClick={() => {
              if (!newEmail.trim()) return;
              setAllowedEmails((prev) => [...new Set([...prev, newEmail.trim().toLowerCase()])]);
              setNewEmail('');
            }}
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-colors"
            style={{ backgroundColor: 'rgb(51,65,85)', color: '#e2e8f0' }}
            aria-label="Add email"
          >
            <Plus size={16} />
          </button>
        </div>
        <p className="text-xs" style={{ color: '#64748b' }}>
          Only listed emails can access settings and generate audio.
        </p>
      </div>

      {error && (
        <p
          className="text-sm rounded-xl px-4 py-3"
          style={{ color: '#f87171', backgroundColor: 'rgba(239,68,68,0.1)' }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60"
        style={{ backgroundColor: saved ? '#16a34a' : '#7c3aed' }}
      >
        {saving ? (
          <><Loader2 size={16} className="animate-spin" /> Saving…</>
        ) : saved ? (
          <><Check size={16} /> Saved</>
        ) : (
          'Save Settings'
        )}
      </button>
    </div>
  );
}
