import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLanguage } from '../i18n/LanguageContext'
import { isActiveTournament } from '../lib/tournamentLifecycle'
import { deriveTournamentProgress } from '../lib/tournamentProgress'
import {
  canRerollUnknownPair,
  rerollErrorTranslationKey,
} from '../lib/unknownPairReroll'
import {
  trackReplayStarted,
  trackTournamentCompletedOnce,
  trackTournamentStarted,
  trackUnknownPairRerolled,
  trackVoteCast,
} from '../analytics'
import Bracket from '../components/Bracket'
import WinnerScreen from '../components/WinnerScreen'
import './TournamentPage.css'

const FLAG_MAP = {
  US:'🇺🇸', GB:'🇬🇧', CA:'🇨🇦', AU:'🇦🇺', FR:'🇫🇷', DE:'🇩🇪', SE:'🇸🇪',
  NO:'🇳🇴', IE:'🇮🇪', NZ:'🇳🇿', BR:'🇧🇷', MX:'🇲🇽', ES:'🇪🇸', IT:'🇮🇹',
  JP:'🇯🇵', KR:'🇰🇷', JM:'🇯🇲', CU:'🇨🇺', NG:'🇳🇬', SN:'🇸🇳', BE:'🇧🇪',
  NL:'🇳🇱', CH:'🇨🇭', AT:'🇦🇹', DK:'🇩🇰', FI:'🇫🇮', PT:'🇵🇹', AR:'🇦🇷',
  CO:'🇨🇴', CL:'🇨🇱', IS:'🇮🇸', ML:'🇲🇱', CM:'🇨🇲', CV:'🇨🇻', PR:'🇵🇷',
  BB:'🇧🇧',
}

export default function TournamentPage({ sessionId, onEnd, onStart }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [tournament, setTournament] = useState(null)
  const [bracket, setBracket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [replaying, setReplaying] = useState(false)
  const [replayError, setReplayError] = useState(null)
  const previousStatusRef = useRef(null)
  const rerollCountsRef = useRef(new Map())

  const loadTournament = useCallback(async () => {
    try {
      const data = await api.getTournament(id)
      setTournament(data.tournament)
      setBracket(data.bracket)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadTournament() }, [loadTournament])

  useEffect(() => {
    if (tournament && !isActiveTournament(tournament)) {
      onEnd()
    }
  }, [tournament, onEnd])

  useEffect(() => {
    const previousStatus = previousStatusRef.current

    if (previousStatus === 'in_progress' && tournament?.status === 'completed') {
      const createdAt = Date.parse(tournament.created_at)
      const completedAt = Date.parse(tournament.completed_at)
      const completionTimeSeconds = Number.isFinite(createdAt) && Number.isFinite(completedAt)
        ? Math.max(0, Math.round((completedAt - createdAt) / 1000))
        : undefined

      trackTournamentCompletedOnce(tournament.id, {
        categoryType: tournament.category_type,
        categoryValue: tournament.category_value,
        completionTimeSeconds,
        votesCast: 15,
      })
    }

    previousStatusRef.current = tournament?.status || null
  }, [tournament])

  async function handleVote(matchId, winnerId) {
    try {
      const match = bracket?.flat().find(item => item.id === matchId)
      const progressBeforeVote = deriveTournamentProgress(bracket)

      await api.submitMatch(id, matchId, winnerId)

      trackVoteCast({
        round: match?.round,
        voteNumber: progressBeforeVote.done + 1,
        categoryType: tournament?.category_type,
        categoryValue: tournament?.category_value,
      })

      await loadTournament()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleUnknownPairReroll(match) {
    const data = await api.rerollUnknownPair(id, match)

    setTournament(data.tournament)
    setBracket(data.bracket)

    if (data.rerolled) {
      const nextCount = (rerollCountsRef.current.get(match.id) || 0) + 1
      rerollCountsRef.current.set(match.id, nextCount)

      trackUnknownPairRerolled({
        round: match.round,
        rerollCount: nextCount,
        categoryType: tournament?.category_type,
        categoryValue: tournament?.category_value,
      })
    }

    return data
  }

  function handleNewTournament() {
    onEnd()
    navigate('/')
  }

  async function handleReplayCategory() {
    if (replaying) return
    setReplaying(true)
    setReplayError(null)

    try {
      const data = await api.startTournament(
        sessionId,
        tournament.category_type,
        tournament.category_value
      )

      trackTournamentStarted({
        categoryType: tournament.category_type,
        categoryValue: tournament.category_value,
        startSource: 'replay',
      })
      trackReplayStarted({
        categoryType: tournament.category_type,
        categoryValue: tournament.category_value,
      })

      onStart(data.tournament.id)
    } catch (e) {
      setReplayError(e.message)
      setReplaying(false)
    }
  }

  if (loading) return <div className="tp-loading"><div className="spinner" /></div>
  if (error) return (
    <div className="tp-error">
      <p>{error}</p>
      <button className="btn btn--outline" onClick={() => navigate('/')}>{t('tp.button.back')}</button>
    </div>
  )
  if (!tournament) return null

  const currentRound = bracket?.find(r => r.some(m => !m.winner_id))
  const currentMatch = currentRound?.find(m => !m.winner_id)
  const roundNumber = currentMatch?.round
  const isCompleted = tournament.status === 'completed'
  const progress = deriveTournamentProgress(bracket)

  return (
    <div className="tp">
      <div className="tp-header">
        <div className="tp-meta">
          <span className="tp-category">
            {tournament.category_type === 'genre' ? '🎵' : tournament.category_type === 'country' ? '🌍' : '🗣️'}
            {' '}{tournament.category_value}
          </span>
          {!isCompleted && roundNumber && (
            <span className="tp-round">{t(`round.${roundNumber}`)}</span>
          )}
        </div>
      </div>

      {isCompleted ? (
        <WinnerScreen
          tournament={tournament}
          bracket={bracket}
          onNewTournament={handleNewTournament}
          onReplayCategory={handleReplayCategory}
          replaying={replaying}
          replayError={replayError}
        />
      ) : (
        <>
          <Bracket bracket={bracket} currentMatchId={currentMatch?.id} />
          {currentMatch && (
            <CompactVote
              match={currentMatch}
              onVote={handleVote}
              onUnknownPair={handleUnknownPairReroll}
              progress={progress}
              t={t}
            />
          )}
        </>
      )}
    </div>
  )
}

function CompactVote({ match, onVote, onUnknownPair, progress, t }) {
  const [voting, setVoting] = useState(false)
  const [rerolling, setRerolling] = useState(false)
  const [rerollError, setRerollError] = useState(null)
  const { artist1, artist2 } = match

  async function handleVote(artistId) {
    if (voting) return
    setVoting(true)
    await onVote(match.id, artistId)
    setVoting(false)
  }

  async function handleUnknownPair() {
    if (voting || rerolling || !canRerollUnknownPair(match)) return
    setRerolling(true)
    setRerollError(null)

    try {
      await onUnknownPair(match)
    } catch (error) {
      setRerollError(t(rerollErrorTranslationKey(error?.code)))
    } finally {
      setRerolling(false)
    }
  }

  return (
    <div className="compact-vote">
      <div className="compact-progress">
        <div className="compact-progress-bar">
          <div
            className="compact-progress-fill"
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
        <span className="compact-progress-label">
          {t('match.progress', { done: progress.done, total: progress.total })}
        </span>
      </div>

      <p className="compact-instruction">{t('match.instruction')}</p>

      <div className="compact-cards">
        <CompactArtistBtn artist={artist1} onVote={handleVote} voting={voting || rerolling} t={t} />
        <div className="compact-vs">VS</div>
        <CompactArtistBtn artist={artist2} onVote={handleVote} voting={voting || rerolling} t={t} />
      </div>

      {canRerollUnknownPair(match) && (
        <div className="compact-reroll-wrap">
          <button
            type="button"
            className="compact-reroll"
            onClick={handleUnknownPair}
            disabled={voting || rerolling}
          >
            {rerolling ? t('match.reroll.loading') : t('match.reroll')}
          </button>
          {rerollError && (
            <p className="compact-reroll-error" role="alert">{rerollError}</p>
          )}
        </div>
      )}
    </div>
  )
}

function CompactArtistBtn({ artist, onVote, voting, t }) {
  const genres = typeof artist.genres === 'string'
    ? JSON.parse(artist.genres)
    : artist.genres || []
  const flag = FLAG_MAP[artist.country] || ''
  const initials = artist.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <button
      className="compact-artist"
      onClick={() => onVote(artist.id)}
      disabled={voting}
    >
      <div className="compact-avatar">
        {artist.image_url
          ? <img src={artist.image_url} alt={artist.name} />
          : <span className="compact-initials">{initials}</span>
        }
      </div>
      <div className="compact-info">
        <span className="compact-name">{artist.name}</span>
        {artist.country && <span className="compact-country">{flag} {artist.country}</span>}
        {genres[0] && <span className="compact-genre">{genres[0]}</span>}
      </div>
      <span className="compact-vote-label">{t('match.vote')}</span>
    </button>
  )
}
