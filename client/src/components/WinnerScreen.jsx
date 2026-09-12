import { useLanguage } from '../i18n/LanguageContext'
import './WinnerScreen.css'

const FLAG_MAP = {
  US:'🇺🇸', GB:'🇬🇧', CA:'🇨🇦', AU:'🇦🇺', FR:'🇫🇷', DE:'🇩🇪', SE:'🇸🇪',
  NO:'🇳🇴', IE:'🇮🇪', NZ:'🇳🇿', BR:'🇧🇷', MX:'🇲🇽', ES:'🇪🇸', IT:'🇮🇹',
  JP:'🇯🇵', KR:'🇰🇷', JM:'🇯🇲', CU:'🇨🇺', NG:'🇳🇬', SN:'🇸🇳', BE:'🇧🇪',
  NL:'🇳🇱', CH:'🇨🇭', AT:'🇦🇹', DK:'🇩🇰', FI:'🇫🇮', PT:'🇵🇹', AR:'🇦🇷',
  CO:'🇨🇴', CL:'🇨🇱', IS:'🇮🇸', ML:'🇲🇱', CM:'🇨🇲', CV:'🇨🇻', PR:'🇵🇷',
  BB:'🇧🇧',
}

export default function WinnerScreen({ tournament, onNewTournament }) {
  const { t } = useLanguage()
  const winner = tournament.winner
  if (!winner) return null

  const genres = typeof winner.genres === 'string'
    ? JSON.parse(winner.genres)
    : winner.genres || []

  const initials = winner.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const flag = FLAG_MAP[winner.country] || ''

  return (
    <div className="winner-screen">
      <div className="winner-confetti">🎉</div>
      <h2 className="winner-title">{t('winner.title')}</h2>
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
      <div className="winner-actions">
        <button className="btn btn--primary btn--lg" onClick={onNewTournament}>
          {t('winner.button.new')}
        </button>
        <a href="/rankings" className="btn btn--outline">
          {t('winner.link.rankings')}
        </a>
      </div>
    </div>
  )
}
