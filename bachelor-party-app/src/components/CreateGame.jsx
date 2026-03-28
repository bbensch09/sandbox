import { useState } from 'react'
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'

const QUICK_DEADLINES = [
  { label: '30 min', hours: 0.5 },
  { label: '2 hrs', hours: 2 },
  { label: '6 hrs', hours: 6 },
  { label: 'Tomorrow morning', hours: 12 },
  { label: 'End of weekend', hours: 60 },
]

export default function CreateGame({ user, onCreated, onCancel }) {
  const [type, setType] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('')
  const [consequence, setConsequence] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [deadlineHours, setDeadlineHours] = useState(null)
  const [loading, setLoading] = useState(false)

  const addOption = () => setOptions(o => [...o, ''])
  const removeOption = (i) => setOptions(o => o.filter((_, idx) => idx !== i))
  const setOption = (i, v) => setOptions(o => o.map((x, idx) => idx === i ? v : x))

  const canSubmit = () => {
    if (!type || !title.trim()) return false
    if (type === 'poll') return options.filter(o => o.trim()).length >= 2
    return true
  }

  const handleSubmit = async () => {
    if (!canSubmit() || loading) return
    setLoading(true)

    const deadline = deadlineHours
      ? Timestamp.fromMillis(Date.now() + deadlineHours * 3600 * 1000)
      : null

    const data = {
      type,
      title: title.trim(),
      description: description.trim(),
      createdBy: {
        uid: user.uid,
        name: user.displayName || 'Someone',
        photo: user.photoURL || null,
      },
      createdAt: serverTimestamp(),
      deadline,
      status: 'active',
      responseCount: 0,
      ...(type === 'price-is-right' && {
        unit: unit.trim() || 'points',
        consequence: consequence.trim(),
        answer: null,
        revealed: false,
      }),
      ...(type === 'poll' && {
        options: options.filter(o => o.trim()),
      }),
    }

    const ref = await addDoc(collection(db, 'games'), data)
    onCreated(ref.id)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">New Game</div>
        <button className="btn-ghost btn" onClick={onCancel}>Cancel</button>
      </header>

      <div className="scroll-content">
        <div className="create-form">

          {/* Type selector */}
          <div className="form-group">
            <label className="form-label">Type</label>
            <div className="type-selector">
              <div
                className={`type-option ${type === 'price-is-right' ? 'selected' : ''}`}
                onClick={() => setType('price-is-right')}
              >
                <span className="type-option-icon">🍺</span>
                <span className="type-option-name">Price Is Right</span>
                <span className="type-option-desc">Guess a number — closest without going over wins</span>
              </div>
              <div
                className={`type-option ${type === 'poll' ? 'selected' : ''}`}
                onClick={() => setType('poll')}
              >
                <span className="type-option-icon">🗳️</span>
                <span className="type-option-name">Quick Poll</span>
                <span className="type-option-desc">Pick from options — live results for everyone</span>
              </div>
            </div>
          </div>

          {type && (
            <>
              <div className="form-group">
                <label className="form-label">Question / Title</label>
                <input
                  className="form-input"
                  placeholder={
                    type === 'price-is-right'
                      ? 'e.g. How many beers left by morning?'
                      : 'e.g. Best restaurant for dinner tonight?'
                  }
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={120}
                />
              </div>

              <div className="form-group">
                <label className="form-label">More context (optional)</label>
                <textarea
                  className="form-input"
                  placeholder="Any extra details, rules, etc."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              {type === 'price-is-right' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Unit (what are people guessing?)</label>
                    <input
                      className="form-input"
                      placeholder="e.g. beers, dollars, minutes, shots..."
                      value={unit}
                      onChange={e => setUnit(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Loser's Consequence 😈</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Buy the next round, morning beer run..."
                      value={consequence}
                      onChange={e => setConsequence(e.target.value)}
                    />
                  </div>
                </>
              )}

              {type === 'poll' && (
                <div className="form-group">
                  <label className="form-label">Options</label>
                  <div className="poll-options">
                    {options.map((opt, i) => (
                      <div className="poll-option-row" key={i}>
                        <input
                          className="form-input"
                          placeholder={`Option ${i + 1}`}
                          value={opt}
                          onChange={e => setOption(i, e.target.value)}
                        />
                        {options.length > 2 && (
                          <button className="remove-btn" onClick={() => removeOption(i)}>✕</button>
                        )}
                      </div>
                    ))}
                    {options.length < 6 && (
                      <button className="add-option-btn" onClick={addOption}>
                        + Add option
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Deadline (optional)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {QUICK_DEADLINES.map(d => (
                    <button
                      key={d.label}
                      className={`btn btn-sm ${deadlineHours === d.hours ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setDeadlineHours(prev => prev === d.hours ? null : d.hours)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                {deadlineHours && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Locks at {new Date(Date.now() + deadlineHours * 3600 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>

              <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit() || loading}>
                {loading ? 'Creating...' : 'Launch Game 🚀'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
