import { useState, useEffect, useRef, useCallback } from 'react'
import {
  doc, onSnapshot, collection, setDoc, updateDoc,
  serverTimestamp, increment, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'

// ---- Helpers ----

function useCountdown(deadline) {
  const [timeLeft, setTimeLeft] = useState(null)

  useEffect(() => {
    if (!deadline) return
    const tick = () => {
      const diff = deadline.toMillis() - Date.now()
      setTimeLeft(diff)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  return timeLeft
}

function formatCountdown(ms) {
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}d ${h % 24}h ${m}m`
  }
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function Confetti() {
  const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#fbbf24', '#fff']
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    duration: `${2 + Math.random() * 2}s`,
    size: `${6 + Math.random() * 8}px`,
    rotate: Math.random() > 0.5 ? 'rotate' : 'scale',
  }))
  return (
    <div className="confetti-wrap">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            background: p.color,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  )
}

// ---- Price Is Right Game View ----

function PriceIsRightView({ game, gameId, user, responses, isCreator, isExpired }) {
  const [guess, setGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [revealAnswer, setRevealAnswer] = useState('')
  const [revealing, setRevealing] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  const myResponse = responses.find(r => r.uid === user.uid)
  const hasSubmitted = !!myResponse
  const isLocked = isExpired || game.status === 'closed'

  // Determine winner/loser after reveal
  const getResults = () => {
    if (!game.revealed || game.answer === null || game.answer === undefined) return null
    const answer = Number(game.answer)
    const withGuesses = responses.map(r => ({
      ...r,
      guess: Number(r.guess),
      diff: answer - Number(r.guess),
      over: Number(r.guess) > answer,
    }))
    const valid = withGuesses.filter(r => !r.over)
    if (valid.length === 0) {
      // Everyone went over — closest to answer wins
      const sorted = withGuesses.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))
      return { winner: sorted[0], loser: sorted[sorted.length - 1], overrideRule: true, all: withGuesses.sort((a, b) => b.guess - a.guess) }
    }
    const winner = valid.reduce((best, r) => r.diff < best.diff ? r : best, valid[0])
    const allSorted = withGuesses.sort((a, b) => b.guess - a.guess)
    // Loser = farthest under (smallest guess)
    const loser = valid.reduce((worst, r) => r.diff > worst.diff ? r : worst, valid[0])
    return { winner, loser: valid.length > 1 ? loser : null, all: allSorted }
  }

  const results = getResults()

  useEffect(() => {
    if (game.revealed && !showConfetti) {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 4000)
    }
  }, [game.revealed])

  const submitGuess = async () => {
    const val = parseFloat(guess)
    if (isNaN(val) || submitting) return
    setSubmitting(true)
    await setDoc(doc(db, 'responses', gameId, 'submissions', user.uid), {
      uid: user.uid,
      name: user.displayName || 'Someone',
      photo: user.photoURL || null,
      guess: val,
      submittedAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'games', gameId), { responseCount: increment(1) })
    setSubmitting(false)
  }

  const doReveal = async () => {
    const val = parseFloat(revealAnswer)
    if (isNaN(val) || revealing) return
    setRevealing(true)
    await updateDoc(doc(db, 'games', gameId), {
      answer: val,
      revealed: true,
      status: 'closed',
    })
    setRevealing(false)
  }

  return (
    <>
      {showConfetti && <Confetti />}

      {/* Consequence */}
      {game.consequence && (
        <div className="consequence">
          <span className="consequence-icon">😈</span>
          <div>
            <div className="consequence-label">Loser's punishment</div>
            <div className="consequence-text">{game.consequence}</div>
          </div>
        </div>
      )}

      {/* Submit guess */}
      {!isLocked && !hasSubmitted && (
        <div className="submit-section card">
          <div className="submit-label">Your guess ({game.unit || 'units'})</div>
          <div className="number-input-row">
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={guess}
              onChange={e => setGuess(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitGuess()}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
              {game.unit}
            </span>
          </div>
          <button className="btn btn-primary" onClick={submitGuess} disabled={!guess || submitting}>
            {submitting ? 'Locking in...' : 'Lock It In 🔒'}
          </button>
        </div>
      )}

      {hasSubmitted && !game.revealed && (
        <div className="already-submitted">
          ✅ You guessed {myResponse.guess} {game.unit} — waiting for others...
        </div>
      )}

      {/* Guesses list */}
      <div className="results-section">
        <div className="results-title">
          Guesses ({responses.length})
        </div>

        {game.revealed && results ? (
          <>
            {/* Winner card */}
            <div className="reveal-winner-card">
              <div className="winner-emoji">🏆</div>
              <div className="winner-name">{results.winner.name.split(' ')[0]} wins!</div>
              <div className="winner-guess">
                Guessed {results.winner.guess} {game.unit} — actual: {game.answer} {game.unit}
              </div>
              {results.overrideRule && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  (everyone went over — closest wins)
                </div>
              )}
            </div>

            {results.loser && results.loser.uid !== results.winner.uid && game.consequence && (
              <div className="loser-card">
                <div className="loser-name">💀 {results.loser.name.split(' ')[0]} loses</div>
                <div className="loser-consequence">{game.consequence}</div>
              </div>
            )}

            <div className="pir-results">
              {results.all.map(r => {
                const isW = r.uid === results.winner?.uid
                const isL = results.loser && r.uid === results.loser?.uid && r.uid !== results.winner?.uid
                return (
                  <div key={r.uid} className={`pir-result-item ${isW ? 'winner' : isL ? 'loser' : r.over ? 'over' : ''}`}>
                    {r.photo
                      ? <img className="pir-avatar" src={r.photo} alt={r.name} />
                      : <div className="pir-avatar-placeholder">{r.name?.[0] || '?'}</div>
                    }
                    <span className="pir-name">{r.name.split(' ')[0]}</span>
                    <span className={`pir-guess ${isW ? 'winner' : r.over ? 'over' : ''}`}>
                      {r.guess} {game.unit}
                    </span>
                    {r.over && <span style={{ fontSize: '0.75rem', color: 'var(--red)' }}>OVER</span>}
                    {isW && <span className="pir-badge">🏆</span>}
                    {isL && <span className="pir-badge">💀</span>}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="pir-results">
            {responses.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '16px 0' }}>
                No guesses yet — be first!
              </div>
            )}
            {responses.map(r => (
              <div key={r.uid} className="pir-result-item">
                {r.photo
                  ? <img className="pir-avatar" src={r.photo} alt={r.name} />
                  : <div className="pir-avatar-placeholder">{r.name?.[0] || '?'}</div>
                }
                <span className="pir-name">{r.name.split(' ')[0]}</span>
                {isCreator || game.revealed ? (
                  <span className="pir-guess">{r.guess} {game.unit}</span>
                ) : (
                  r.uid === user.uid
                    ? <span className="pir-guess">{r.guess} {game.unit} (you)</span>
                    : <span className="pir-hidden">🔒 hidden</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Creator reveal controls */}
      {isCreator && !game.revealed && responses.length > 0 && (
        <div className="reveal-section">
          <div className="reveal-title">👑 Creator Controls</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
            Enter the actual answer to reveal results and crown a winner.
          </p>
          <div className="number-input-row">
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              placeholder="Actual answer"
              value={revealAnswer}
              onChange={e => setRevealAnswer(e.target.value)}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
              {game.unit}
            </span>
          </div>
          <button className="btn btn-danger" onClick={doReveal} disabled={!revealAnswer || revealing}>
            {revealing ? 'Revealing...' : '🎉 Reveal Answer!'}
          </button>
        </div>
      )}
    </>
  )
}

// ---- Poll Game View ----

function PollView({ game, gameId, user, responses, isCreator, isExpired }) {
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const myResponse = responses.find(r => r.uid === user.uid)
  const hasVoted = !!myResponse
  const isLocked = isExpired || game.status === 'closed'
  const options = game.options || []

  // Tally votes
  const tally = options.map(opt => ({
    option: opt,
    count: responses.filter(r => r.choice === opt).length,
    voters: responses.filter(r => r.choice === opt).map(r => r.name.split(' ')[0]),
  }))
  const maxCount = Math.max(...tally.map(t => t.count), 1)
  const totalVotes = responses.length
  const winner = tally.reduce((best, t) => t.count > best.count ? t : best, tally[0])

  const submitVote = async () => {
    if (!selected || submitting) return
    setSubmitting(true)
    await setDoc(doc(db, 'responses', gameId, 'submissions', user.uid), {
      uid: user.uid,
      name: user.displayName || 'Someone',
      photo: user.photoURL || null,
      choice: selected,
      submittedAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'games', gameId), { responseCount: increment(1) })
    setSubmitting(false)
  }

  const closeGame = async () => {
    await updateDoc(doc(db, 'games', gameId), { status: 'closed' })
  }

  return (
    <>
      {/* Vote UI */}
      {!hasVoted && !isLocked && (
        <div className="submit-section card">
          <div className="submit-label">Your vote</div>
          <div className="poll-choices">
            {options.map(opt => (
              <button
                key={opt}
                className={`poll-choice-btn ${selected === opt ? 'selected' : ''}`}
                onClick={() => setSelected(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={submitVote} disabled={!selected || submitting}>
            {submitting ? 'Voting...' : 'Cast My Vote 🗳️'}
          </button>
        </div>
      )}

      {hasVoted && (
        <div className="already-submitted">
          ✅ You voted: {myResponse.choice}
        </div>
      )}

      {/* Live results */}
      <div className="results-section">
        <div className="results-title">
          Results {totalVotes > 0 ? `— ${totalVotes} vote${totalVotes === 1 ? '' : 's'}` : ''}
        </div>

        {tally.length === 0 || totalVotes === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '16px 0' }}>
            No votes yet — be first!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tally.sort((a, b) => b.count - a.count).map(t => {
              const pct = totalVotes ? Math.round((t.count / totalVotes) * 100) : 0
              const isWinner = t.option === winner.option && t.count > 0
              return (
                <div className="poll-result-item" key={t.option}>
                  <div className="poll-result-header">
                    <span className="poll-result-option">
                      {isWinner && game.status === 'closed' && '🏆 '}
                      {t.option}
                    </span>
                    <span className="poll-result-count">{pct}% ({t.count})</span>
                  </div>
                  <div className="poll-result-bar-bg">
                    <div
                      className={`poll-result-bar ${isWinner ? 'winner' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {t.voters.length > 0 && (
                    <div className="poll-result-voters">
                      {t.voters.map(v => (
                        <span key={v} className="voter-chip">{v}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Creator controls */}
      {isCreator && game.status !== 'closed' && (
        <div className="reveal-section">
          <div className="reveal-title">👑 Creator Controls</div>
          <button className="btn btn-secondary" onClick={closeGame}>
            🏁 Close Poll
          </button>
        </div>
      )}
    </>
  )
}

// ---- Main GameView ----

export default function GameView({ gameId, user, onBack }) {
  const [game, setGame] = useState(null)
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)

  const timeLeft = useCountdown(game?.deadline)
  const isExpired = game?.deadline && timeLeft !== null && timeLeft <= 0
  const formatted = formatCountdown(timeLeft)
  const isUrgent = timeLeft !== null && timeLeft > 0 && timeLeft < 600000 // < 10 min

  useEffect(() => {
    const unsub1 = onSnapshot(doc(db, 'games', gameId), snap => {
      if (snap.exists()) setGame({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
    const unsub2 = onSnapshot(collection(db, 'responses', gameId, 'submissions'), snap => {
      setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => { unsub1(); unsub2() }
  }, [gameId])

  if (loading) return <div className="loading-screen">🎲</div>
  if (!game) return <div className="loading-screen">Game not found</div>

  const isCreator = game.createdBy?.uid === user.uid
  const isPIR = game.type === 'price-is-right'

  return (
    <div className="game-view">
      <header className="header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <span className={`badge ${isPIR ? 'badge-beer' : 'badge-vote'}`}>
          {isPIR ? '🍺 Bet' : '🗳️ Poll'}
        </span>
      </header>

      <div className="scroll-content">
        <div className="game-view-body">
          {/* Title & meta */}
          <div className="game-view-header">
            <h1 className="game-view-title">{game.title}</h1>
            {game.description && (
              <p className="game-view-desc">{game.description}</p>
            )}
            <div className="game-view-meta">
              <span className="meta-pill">
                👤 {game.createdBy?.name?.split(' ')[0] || 'Someone'}
              </span>
              {game.status === 'closed' && (
                <span className="meta-pill" style={{ color: 'var(--text-muted)' }}>🏁 Closed</span>
              )}
              {isCreator && game.status !== 'closed' && (
                <span className="meta-pill" style={{ color: 'var(--gold)' }}>👑 Your game</span>
              )}
            </div>
          </div>

          {/* Timer */}
          {game.deadline && game.status !== 'closed' && (
            <div className="timer">
              <div className="timer-label">
                {isExpired ? 'Locked' : 'Time remaining'}
              </div>
              {isExpired ? (
                <div className="timer-expired">🔒 Accepting no more submissions</div>
              ) : (
                <div className={`timer-value ${isUrgent ? 'urgent' : ''}`}>
                  {formatted}
                </div>
              )}
            </div>
          )}

          <div className="section-divider" />

          {/* Game-specific content */}
          {isPIR ? (
            <PriceIsRightView
              game={game}
              gameId={gameId}
              user={user}
              responses={responses}
              isCreator={isCreator}
              isExpired={isExpired}
            />
          ) : (
            <PollView
              game={game}
              gameId={gameId}
              user={user}
              responses={responses}
              isCreator={isCreator}
              isExpired={isExpired}
            />
          )}
        </div>
      </div>
    </div>
  )
}
