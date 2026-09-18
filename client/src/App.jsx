import { Routes, Route, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from './useSession'
import { api } from './api'
import { isActiveTournament } from './lib/tournamentLifecycle'
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
        setActiveTournamentId(
          isActiveTournament(data?.tournament) ? data.tournament.id : null
        )
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [sessionId])

  const handleTournamentStart = useCallback((tournamentId) => {
    setActiveTournamentId(tournamentId)
    navigate(`/tournament/${tournamentId}`)
  }, [navigate])

  const handleTournamentEnd = useCallback(() => {
    setActiveTournamentId(null)
  }, [])

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
