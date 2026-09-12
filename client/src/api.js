const BASE = '/api'

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Erreur réseau')
  }
  return res.json()
}

export const api = {
  // Artists
  getCategories: () => req('/artists/categories'),
  getRandomArtists: (type, value, count = 32) =>
    req(`/artists/random?category_type=${type}&category_value=${encodeURIComponent(value)}&count=${count}`),

  // Tournament
  startTournament: (sessionId, categoryType, categoryValue) =>
    req('/tournament/start', {
      method: 'POST',
      body: JSON.stringify({ user_session: sessionId, category_type: categoryType, category_value: categoryValue }),
    }),
  getTournament: (id) => req(`/tournament/${id}`),
  submitMatch: (tournamentId, matchId, winnerId) =>
    req(`/tournament/${tournamentId}/match`, {
      method: 'POST',
      body: JSON.stringify({ match_id: matchId, winner_id: winnerId }),
    }),
  getActiveSession: (sessionId) => req(`/tournament/session/${sessionId}`),

  // Rankings
  getRankings: (page = 1, limit = 50, sort = 'avg') => req(`/rankings?page=${page}&limit=${limit}&sort=${sort}`),
  getLeaderboard: () => req('/rankings/leaderboard'),
}
