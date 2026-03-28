import { useState, useEffect } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../firebase'

function timeAgo(ts) {
  if (!ts) return ''
  const seconds = Math.floor((Date.now() - ts.toMillis()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function timeLeft(ts) {
  if (!ts) return null
  const diff = ts.toMillis() - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d left`
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

export default function GameList({ user, onSelectGame, onCreateGame }) {
  const [games, setGames] = useState([])
  const [tab, setTab] = useState('active')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [])

  const active = games.filter(g => g.status !== 'closed')
  const closed = games.filter(g => g.status === 'closed')
  const displayed = tab === 'active' ? active : closed

  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="header-title">Bachelor HQ 🍾</div>
          <div className="header-subtitle">
            {user.displayName?.split(' ')[0]} is logged in
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user.photoURL
            ? <img className="avatar" src={user.photoURL} alt={user.displayName} />
            : <div className="avatar-placeholder">{user.displayName?.[0] || '?'}</div>
          }
        </div>
      </header>

      <div style={{ padding: '12px 20px 0' }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
            Live {active.length > 0 && `(${active.length})`}
          </button>
          <button className={`tab ${tab === 'closed' ? 'active' : ''}`} onClick={() => setTab('closed')}>
            Finished {closed.length > 0 && `(${closed.length})`}
          </button>
        </div>
      </div>

      <div className="scroll-content">
        <div className="game-list">
          {loading && (
            <div className="game-list-empty">
              <div className="game-list-empty-emoji">⏳</div>
              <p>Loading games...</p>
            </div>
          )}

          {!loading && displayed.length === 0 && (
            <div className="game-list-empty">
              <div className="game-list-empty-emoji">
                {tab === 'active' ? '🎲' : '🏁'}
              </div>
              <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                {tab === 'active' ? 'No games yet' : 'No finished games'}
              </p>
              {tab === 'active' && (
                <p style={{ fontSize: '0.875rem' }}>
                  Hit the button below to start something fun
                </p>
              )}
            </div>
          )}

          {displayed.map(game => (
            <GameCard key={game.id} game={game} onClick={() => onSelectGame(game.id)} />
          ))}
        </div>
      </div>

      <button className="fab" onClick={onCreateGame}>
        + New Game
      </button>

      <div style={{ textAlign: 'center', padding: '8px', paddingBottom: '80px' }}>
        <button className="sign-out-btn" onClick={() => signOut(auth)}>Sign out</button>
      </div>
    </div>
  )
}

function GameCard({ game, onClick }) {
  const isPIR = game.type === 'price-is-right'
  const accentColor = game.status === 'closed' ? 'var(--text-muted)' : isPIR ? 'var(--gold)' : 'var(--blue)'
  const left = game.deadline ? timeLeft(game.deadline) : null
  const expired = left === 'Expired'

  return (
    <div className="game-card" onClick={onClick}>
      <div className="game-card-accent" style={{ background: accentColor }} />
      <div className="game-card-header">
        <div className="game-card-title">{game.title}</div>
        {game.status === 'closed'
          ? <span className="badge badge-closed">Done</span>
          : <span className={`badge ${isPIR ? 'badge-beer' : 'badge-vote'}`}>
              {isPIR ? '🍺 Bet' : '🗳️ Poll'}
            </span>
        }
      </div>
      <div className="game-card-meta">
        <span className="game-card-meta-item">
          👤 {game.createdBy?.name?.split(' ')[0] || 'Someone'}
        </span>
        {game.responseCount > 0 && (
          <span className="game-card-meta-item">
            ✅ {game.responseCount} in
          </span>
        )}
        {left && !game.status === 'closed' && (
          <span className="game-card-meta-item" style={{ color: expired ? 'var(--red)' : undefined }}>
            ⏱️ {left}
          </span>
        )}
        {!left && game.createdAt && (
          <span className="game-card-meta-item">
            🕐 {timeAgo(game.createdAt)}
          </span>
        )}
        {left && (
          <span className="game-card-meta-item" style={{ color: expired ? 'var(--red)' : undefined }}>
            ⏱️ {left}
          </span>
        )}
      </div>
    </div>
  )
}
