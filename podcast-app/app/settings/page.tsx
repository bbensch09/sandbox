'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';

interface Voice {
  voice_id: string;
  name: string;
}

interface Settings {
  has_api_key: boolean;
  elevenlabs_voice_id: string;
  elevenlabs_voice_name: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data: Settings) => {
        setSettings(data);
        setSelectedVoiceId(data.elevenlabs_voice_id);
        setSelectedVoiceName(data.elevenlabs_voice_name);
      });
  }, []);

  const loadVoices = async () => {
    setLoadingVoices(true);
    setError('');
    try {
      const res = await fetch('/api/voices');
      if (!res.ok) throw new Error('Could not load voices — check your API key');
      const data: Voice[] = await res.json();
      setVoices(data.sort((a, b) => a.name.localeCompare(b.name)));
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
      const body: Record<string, string> = {};
      if (apiKey.trim()) body.elevenlabs_api_key = apiKey.trim();
      if (selectedVoiceId) body.elevenlabs_voice_id = selectedVoiceId;
      if (selectedVoiceName) body.elevenlabs_voice_name = selectedVoiceName;

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save settings');

      setApiKey('');
      setSettings((s) =>
        s
          ? {
              ...s,
              has_api_key: s.has_api_key || !!body.elevenlabs_api_key,
              elevenlabs_voice_id: selectedVoiceId || s.elevenlabs_voice_id,
              elevenlabs_voice_name: selectedVoiceName || s.elevenlabs_voice_name,
            }
          : s,
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex justify-center pt-20">
        <Loader2 size={24} className="animate-spin" style={{ color: '#7c3aed' }} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-white mb-6">Settings</h1>

      <div
        className="rounded-2xl p-5 space-y-6"
        style={{ backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(30,41,59)' }}
      >
        {/* API Key */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-white">ElevenLabs API Key</label>
            {settings.has_api_key && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ color: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)' }}
              >
                Key saved
              </span>
            )}
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.has_api_key ? '••••••••••••  (leave blank to keep current)' : 'sk_...'}
            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
            style={{
              backgroundColor: 'rgb(2,6,23)',
              border: '1px solid rgb(51,65,85)',
            }}
          />
          <p className="text-xs mt-1.5" style={{ color: '#64748b' }}>
            Find your key at elevenlabs.io → Profile → API Key
          </p>
        </div>

        {/* Voice selection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-white">Voice</label>
            <button
              onClick={loadVoices}
              disabled={loadingVoices}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: '#a78bfa' }}
            >
              {loadingVoices ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              Load my voices
            </button>
          </div>

          {voices.length > 0 ? (
            <select
              value={selectedVoiceId}
              onChange={(e) => {
                const v = voices.find((v) => v.voice_id === e.target.value);
                if (v) {
                  setSelectedVoiceId(v.voice_id);
                  setSelectedVoiceName(v.name);
                }
              }}
              className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
              style={{
                backgroundColor: 'rgb(2,6,23)',
                border: '1px solid rgb(51,65,85)',
              }}
            >
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgb(2,6,23)',
                border: '1px solid rgb(51,65,85)',
                color: '#64748b',
              }}
            >
              Current: {settings.elevenlabs_voice_name}
            </div>
          )}
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
    </div>
  );
}
