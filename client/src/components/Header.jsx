import { Link, useLocation } from 'react-router-dom'
import { useLanguage, SUPPORTED_LANGS } from '../i18n/LanguageContext'
import './Header.css'

export default function Header({ activeTournamentId }) {
  const loc = useLocation()
  const { lang, setLang, t } = useLanguage()

  return (
    <header className="header">
      <Link to="/" className="header-logo">
        🎸 <span>Battle of Bands</span>
      </Link>
      <nav className="header-nav">
        {activeTournamentId && (
          <Link
            to={`/tournament/${activeTournamentId}`}
            className={`nav-link nav-link--active-tourney ${loc.pathname.startsWith('/tournament') ? 'active' : ''}`}
          >
            {t('nav.activeTournament')}
          </Link>
        )}
        <Link to="/rankings" className={`nav-link ${loc.pathname === '/rankings' ? 'active' : ''}`}>
          {t('nav.rankings')}
        </Link>
        <div className="lang-switcher">
          {SUPPORTED_LANGS.map(l => (
            <button
              key={l.code}
              className={`lang-btn ${lang === l.code ? 'active' : ''}`}
              onClick={() => setLang(l.code)}
              title={l.label}
            >
              {l.label}
            </button>
          ))}
        </div>
      </nav>
    </header>
  )
}
