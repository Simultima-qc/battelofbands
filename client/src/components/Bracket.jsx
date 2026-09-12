import { useLanguage } from '../i18n/LanguageContext'
import './Bracket.css'

// Build full bracket structure even when future rounds haven't been generated yet.
// The server only creates next-round matches after the current round completes,
// so we infer total rounds from R1 match count and fill gaps with null placeholders.
function buildSplitBracket(bracket) {
  if (!bracket || bracket.length === 0) return { leftRounds: [], rightRounds: [], finalMatch: null, totalRounds: 0 }

  const firstRound = bracket[0]
  if (!firstRound || firstRound.length === 0) return { leftRounds: [], rightRounds: [], finalMatch: null, totalRounds: 0 }

  // e.g. 16 R1 matches → log2(16)+1 = 5 total rounds for 32 players
  const r1Count = firstRound.length
  const totalRounds = Math.round(Math.log2(r1Count)) + 1

  // Index existing rounds by their round number field
  const roundMap = {}
  for (const round of bracket) {
    if (round.length > 0 && round[0]?.round != null) {
      roundMap[round[0].round] = round
    }
  }

  // Full round list: use existing data or empty array for rounds not yet generated
  const allRounds = Array.from({ length: totalRounds }, (_, i) => roundMap[i + 1] || [])

  const finalMatch = allRounds[totalRounds - 1][0] ?? null
  const otherRounds = allRounds.slice(0, -1)

  const leftRounds = []
  const rightRoundsMirrored = []

  for (let i = 0; i < otherRounds.length; i++) {
    const round = otherRounds[i]
    // Expected match count in this round (halves each round)
    const expectedCount = r1Count / Math.pow(2, i)
    const half = expectedCount / 2

    // Pad with null for matches not yet generated
    const left = Array.from({ length: half }, (_, j) => round[j] ?? null)
    const right = Array.from({ length: half }, (_, j) => round[half + j] ?? null).reverse()

    leftRounds.push(left)
    rightRoundsMirrored.push(right)
  }

  // Reverse so SF is closest to Final on right side
  const rightRounds = [...rightRoundsMirrored].reverse()

  return { leftRounds, rightRounds, finalMatch, totalRounds }
}

export default function Bracket({ bracket, currentMatchId }) {
  const { t } = useLanguage()
  if (!bracket) return null

  const { leftRounds, rightRounds, finalMatch, totalRounds } = buildSplitBracket(bracket)

  const firstRoundCount = leftRounds[0]?.length ?? 1
  const bracketHeight = Math.max(320, firstRoundCount * 60 + (firstRoundCount - 1) * 6)
  const totalCols = leftRounds.length + 1 + rightRounds.length

  return (
    <div className="bracket-scroll">
      <div className="bracket-grid" style={{ height: bracketHeight, gridTemplateColumns: `repeat(${totalCols}, 1fr)` }}>

        {/* LEFT side: R1 → R2 → QF → SF */}
        {leftRounds.map((matches, i) => {
          const roundNum = i + 1
          return (
            <div key={`L${i}`} className="bracket-col">
              <div className="bracket-col-label">{t(`round.short.${roundNum}`)}</div>
              <div className="bracket-col-matches">
                {matches.map((m, j) => (
                  <BracketMatch key={m?.id ?? `L${i}-${j}`} match={m} isActive={m?.id === currentMatchId} />
                ))}
              </div>
            </div>
          )
        })}

        {/* CENTER: Final */}
        <div className="bracket-col bracket-col--final">
          <div className="bracket-col-label">{t(`round.short.${totalRounds}`)}</div>
          <div className="bracket-col-matches">
            <BracketMatch match={finalMatch} isActive={finalMatch?.id === currentMatchId} isFinal />
          </div>
        </div>

        {/* RIGHT side: SF → QF → R2 → R1 (mirrored) */}
        {rightRounds.map((matches, i) => {
          const roundNum = totalRounds - 1 - i
          return (
            <div key={`R${i}`} className="bracket-col">
              <div className="bracket-col-label">{t(`round.short.${roundNum}`)}</div>
              <div className="bracket-col-matches">
                {matches.map((m, j) => (
                  <BracketMatch key={m?.id ?? `R${i}-${j}`} match={m} isActive={m?.id === currentMatchId} />
                ))}
              </div>
            </div>
          )
        })}

      </div>
    </div>
  )
}

function BracketMatch({ match, isActive, isFinal }) {
  if (!match) {
    return (
      <div className="bm bm--empty">
        <div className="bm-artist bm-artist--tbd"><span className="bm-artist-name">TBD</span></div>
        <div className="bm-divider" />
        <div className="bm-artist bm-artist--tbd"><span className="bm-artist-name">TBD</span></div>
      </div>
    )
  }

  const { artist1, artist2, winner_id } = match

  return (
    <div className={`bm ${isActive ? 'bm--active' : ''} ${isFinal ? 'bm--final' : ''}`}>
      <BracketArtist
        artist={artist1}
        isWinner={winner_id === artist1?.id}
        isLoser={winner_id && winner_id !== artist1?.id}
      />
      <div className="bm-divider" />
      <BracketArtist
        artist={artist2}
        isWinner={winner_id === artist2?.id}
        isLoser={winner_id && winner_id !== artist2?.id}
      />
    </div>
  )
}

function BracketArtist({ artist, isWinner, isLoser }) {
  const name = artist?.name ?? 'TBD'
  return (
    <div className={`bm-artist ${isWinner ? 'bm-artist--winner' : ''} ${isLoser ? 'bm-artist--loser' : ''} ${!artist ? 'bm-artist--tbd' : ''}`}>
      <span className="bm-artist-name">{name}</span>
      {isWinner && <span className="bm-check">✓</span>}
    </div>
  )
}
