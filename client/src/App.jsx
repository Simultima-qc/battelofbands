import { Routes, Route, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useSession } from './useSession'
import { api } from './api'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import TournamentPage from './pages/TournamentPage'
import RankingsPage from './pages/RankingsPage'
import './App.css'

export default function App() {
  const sessionId = useSession()
  const navigate = useNavigate()
  const [activeTournamentId, setActiveTournamentId] = useState(null)
  const [checking, setChecking] = useState(true)

  // On mount: check if there's an active tournament for this session
  useEffect(() => {
    api.getActiveSession(sessionId)
      .then(data => {
        if (data?.tournament?.id) {
          setActiveTournamentId(data.tournament.id)
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [sessionId])

  function handleTournamentStart(tournamentId) {
    setActiveTournamentId(tournamentId)
    navigate(`/tournament/${tournamentId}`)
  }

  function handleTournamentEnd() {
    setActiveTournamentId(null)
  }

  if (checking) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="app">
      <Header activeTournamentId={activeTournamentId} />
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                sessionId={sessionId}
                activeTournamentId={activeTournamentId}
                onStart={handleTournamentStart}
              />
            }
          />
          <Route
            path="/tournament/:id"
            element={
              <TournamentPage
                sessionId={sessionId}
                onEnd={handleTournamentEnd}
                onStart={handleTournamentStart}
              />
            }
          />
          <Route path="/rankings" element={<RankingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
