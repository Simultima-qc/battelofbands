export function isActiveTournament(tournament) {
  return Boolean(tournament?.id) && tournament?.status === 'in_progress'
}
