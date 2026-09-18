export function deriveTournamentResult(tournament, bracket) {
  if (tournament?.status !== 'completed' || !Array.isArray(bracket) || bracket.length === 0) {
    return null
  }

  const rounds = bracket
    .filter(round => Array.isArray(round) && round.length > 0)
    .map(round => ({
      number: Number(round[0]?.round) || 0,
      matches: round,
    }))
    .filter(round => round.number > 0)
    .sort((a, b) => a.number - b.number)

  if (rounds.length < 2) return null

  const finalRound = rounds[rounds.length - 1]
  const finalMatch = finalRound.matches[0]
  if (!finalMatch) return null

  const championId = tournament.winner_id || finalMatch.winner_id
  const finalArtists = [finalMatch.artist1, finalMatch.artist2].filter(Boolean)
  const bracketChampion = finalArtists.find(artist => artist.id === championId)
  const champion = tournament.winner?.id === championId
    ? tournament.winner
    : bracketChampion
  const finalist = finalArtists.find(artist => artist.id !== championId)

  const semifinalRound = rounds.find(round => round.number === finalRound.number - 1)
  if (!champion || !finalist || !semifinalRound) return null

  const seen = new Set()
  const semifinalists = semifinalRound.matches
    .flatMap(match => [match.artist1, match.artist2])
    .filter(Boolean)
    .filter(artist => {
      if (seen.has(artist.id)) return false
      seen.add(artist.id)
      return true
    })

  const remaining = semifinalists.filter(
    artist => artist.id !== champion.id && artist.id !== finalist.id
  )

  const top4 = [champion, finalist, ...remaining].slice(0, 4)
  if (top4.length !== 4) return null

  return {
    champion,
    finalist,
    top4,
    finalMatch,
    semifinalRound: semifinalRound.matches,
  }
}
