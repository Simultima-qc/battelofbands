export function deriveTournamentProgress(bracket) {
  if (!Array.isArray(bracket) || bracket.length === 0) {
    return { done: 0, total: 0 }
  }

  const firstRound = Array.isArray(bracket[0]) ? bracket[0] : []
  const firstRoundMatchCount = firstRound.length
  const total = firstRoundMatchCount > 0
    ? (firstRoundMatchCount * 2) - 1
    : 0

  const done = bracket
    .flat()
    .filter(match => match?.winner_id)
    .length

  return { done, total }
}
