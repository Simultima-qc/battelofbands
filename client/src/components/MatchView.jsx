import { useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import './MatchView.css'

const FLAG_MAP = {
  US:'🇺🇸', GB:'🇬🇧', CA:'🇨🇦', AU:'🇦🇺', FR:'🇫🇷', DE:'🇩🇪', SE:'🇸🇪',
  NO:'🇳🇴', IE:'🇮🇪', NZ:'🇳🇿', BR:'🇧🇷', MX:'🇲🇽', ES:'🇪🇸', IT:'🇮🇹',
  JP:'🇯🇵', KR:'🇰🇷', JM:'🇯🇲', CU:'🇨🇺', NG:'🇳🇬', SN:'🇸🇳', BE:'🇧🇪',
  NL:'🇳🇱', CH:'🇨🇭', AT:'🇦🇹', DK:'🇩🇰', FI:'🇫🇮', PT:'🇵🇹', AR:'🇦🇷',
  CO:'🇨🇴', CL:'🇨🇱', IS:'🇮🇸', ML:'🇲🇱', CM:'🇨🇲', CV:'🇨🇻', PR:'🇵🇷',
  BB:'🇧🇧',
}

export default function MatchView({ match, onVote, progress }) {
  const { t } = useLanguage()
  const [voting, setVoting] = useState(false)

  async function handleVote(artist) {
    if (voting) return
    setVoting(true)
    await onVote(match.id, artist.id)
    setVoting(false)
  }

  const { artist1, artist2 } = match

  return (
    <div className="match-view">
      <div className="match-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
        <span className="progress-label">
          {t('match.progress', { done: progress.done, total: progress.total })}
        </span>
      </div>

      <p className="match-instruction">{t('match.instruction')}</p>

      <div className="match-cards">
        <ArtistCard artist={artist1} onVote={handleVote} voting={voting} />
        <div className="vs-badge">VS</div>
        <ArtistCard artist={artist2} onVote={handleVote} voting={voting} />
      </div>
    </div>
  )
}

function ArtistCard({ artist, onVote, voting }) {
  const { t } = useLanguage()
  const genres = typeof artist.genres === 'string'
    ? JSON.parse(artist.genres)
    : artist.genres || []

  const flag = FLAG_MAP[artist.country] || ''
  const initials = artist.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <button
      className="artist-card"
      onClick={() => onVote(artist)}
      disabled={voting}
    >
      <div className="artist-avatar">
        {artist.image_url
          ? <img src={artist.image_url} alt={artist.name} />
          : <span className="artist-initials">{initials}</span>
        }
      </div>
      <div className="artist-info">
        <h2 className="artist-name">{artist.name}</h2>
        {artist.country && (
          <p className="artist-country">{flag} {artist.country}</p>
        )}
        <div className="artist-genres">
          {genres.slice(0, 3).map(g => (
            <span key={g} className="genre-tag">{g}</span>
          ))}
        </div>
      </div>
      <div className="vote-overlay">
        <span>{t('match.vote')}</span>
      </div>
    </button>
  )
}
