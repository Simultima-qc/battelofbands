import { useLanguage } from '../i18n/LanguageContext'
import { deriveTournamentResult } from '../lib/tournamentResult'
import Bracket from './Bracket'
import './WinnerScreen.css'

const FLAG_MAP = {
  US:'🇺🇸', GB:'🇬🇧', CA:'🇨🇦', AU:'🇦🇺', FR:'🇫🇷', DE:'🇩🇪', SE:'🇸🇪',
  NO:'🇳🇴', IE:'🇮🇪', NZ:'🇳🇿', BR:'🇧🇷', MX:'🇲🇽', ES:'🇪🇸', IT:'🇮🇹',
  JP:'🇯🇵', KR:'🇰🇷', JM:'🇯🇲', CU:'🇨🇺', NG:'🇳🇬', SN:'🇸🇳', BE:'🇧🇪',
  NL:'🇳🇱', CH:'🇨🇭', AT:'🇦🇹', DK:'🇩🇰', FI:'🇫🇮', PT:'🇵🇹', AR:'🇦🇷',
  CO:'🇨🇴', CL:'🇨🇱', IS:'🇮🇸', ML:'🇲🇱', CM:'🇨🇲', CV:'🇨🇻', PR:'🇵🇷',
  BB:'🇧🇧',
}

export default function WinnerScreen({
  tournament,
  bracket,
  onNewTournament,
  onReplayCategory,
  replaying,
  replayError,
}) {
  const { t } = useLanguage()
  const result = deriveTournamentResult(tournament, bracket)
  if (!result) return null

  const winner = result.champion
  const genres = typeof winner.genres === 'string'
    ? JSON.parse(winner.genres)
    : winner.genres || []

  const initials = winner.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const flag = FLAG_MAP[winner.country] || ''

  return (
    <div className="winner-screen">
      <div className="winner-confetti">🎉</div>
      <h2 className="winner-title">{t('winner.title')}</h2>
      <p className="winner-category">
        <span>{t('winner.category')}</span>
        <strong>{tournament.category_value}</strong>
      </p>

      <div className="winner-card">
        <div className="winner-avatar">
          {winner.image_url
            ? <img src={winner.image_url} alt={winner.name} />
            : <span className="winner-initials">{initials}</span>
          }
        </div>
        <h1 className="winner-name">{winner.name}</h1>
        {winner.country && (
          <p className="winner-country">{flag} {winner.country}</p>
        )}
        <div className="winner-genres">
          {genres.slice(0, 4).map(g => (
            <span key={g} className="genre-tag">{g}</span>
          ))}
        </div>
      </div>

      <div className="winner-result-grid">
        <div className="winner-result-panel">
          <span className="winner-result-label">{t('winner.finalist')}</span>
          <strong>{result.finalist.name}</strong>
        </div>

        <div className="winner-result-panel winner-result-panel--top4">
          <span className="winner-result-label">{t('winner.top4')}</span>
          <div className="winner-top4">
            {result.top4.map((artist, index) => (
              <div key={artist.id} className="winner-top4-item">
                <span aria-hidden="true">{index === 0 ? '🏆' : index === 1 ? '🥈' : '•'}</span>
                <span>{artist.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="winner-actions">
        <button className="btn btn--primary btn--lg" onClick={onNewTournament}>
          {t('winner.button.new')}
        </button>
        <button
          className="btn btn--outline"
          onClick={onReplayCategory}
          disabled={replaying}
        >
          {replaying ? t('winner.button.replaying') : t('winner.button.replay')}
        </button>
        <a href="/rankings" className="btn btn--outline">
          {t('winner.link.rankings')}
        </a>
      </div>

      {replayError && <p className="winner-error">{replayError}</p>}

      <section className="winner-bracket" aria-label={t('winner.bracket')}>
        <h3>{t('winner.bracket')}</h3>
        <Bracket bracket={bracket} currentMatchId={null} />
      </section>
    </div>
  )
}
