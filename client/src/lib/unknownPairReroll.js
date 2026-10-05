export function canRerollUnknownPair(match) {
  return Boolean(
    match &&
    Number(match.round) === 1 &&
    !match.winner_id &&
    match.artist1_id &&
    match.artist2_id
  )
}

export function rerollErrorTranslationKey(code) {
  if (code === 'REROLL_POOL_EXHAUSTED') return 'match.reroll.exhausted'
  return 'match.reroll.error'
}
