import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import Login from './components/Login'
import GameList from './components/GameList'
import CreateGame from './components/CreateGame'
import GameView from './components/GameView'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('games')
  const [selectedGame, setSelectedGame] = useState(null)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="loading-screen">🍾</div>
  }

  if (!user) {
    return <Login />
  }

  if (view === 'game' && selectedGame) {
    return (
      <GameView
        gameId={selectedGame}
        user={user}
        onBack={() => { setSelectedGame(null); setView('games') }}
      />
    )
  }

  if (view === 'create') {
    return (
      <CreateGame
        user={user}
        onCreated={(gameId) => { setSelectedGame(gameId); setView('game') }}
        onCancel={() => setView('games')}
      />
    )
  }

  return (
    <GameList
      user={user}
      onSelectGame={(id) => { setSelectedGame(id); setView('game') }}
      onCreateGame={() => setView('create')}
    />
  )
}
