import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLanguage } from '../i18n/LanguageContext'
import { trackTournamentStarted } from '../analytics'
import './HomePage.css'

const FLAG_MAP = {
  US:'🇺🇸', GB:'🇬🇧', CA:'🇨🇦', AU:'🇦🇺', FR:'🇫🇷', DE:'🇩🇪', SE:'🇸🇪',
  NO:'🇳🇴', IE:'🇮🇪', NZ:'🇳🇿', BR:'🇧🇷', MX:'🇲🇽', ES:'🇪🇸', IT:'🇮🇹',
  JP:'🇯🇵', KR:'🇰🇷', JM:'🇯🇲', CU:'🇨🇺', NG:'🇳🇬', SN:'🇸🇳', BE:'🇧🇪',
  NL:'🇳🇱', CH:'🇨🇭', AT:'🇦🇹', DK:'🇩🇰', FI:'🇫🇮', PT:'🇵🇹', AR:'🇦🇷',
  CO:'🇨🇴', CL:'🇨🇱', IS:'🇮🇸', ML:'🇲🇱', CM:'🇨🇲', CV:'🇨🇻', PR:'🇵🇷',
  BB:'🇧🇧',
}

const GENRE_ICONS = {
  'Rock':'🎸', 'Metal':'🤘', 'Punk':'⚡', 'Alternative':'🔀', 'Indie':'🎵',
  'Pop':'✨', 'Electronic':'🎛️', 'Hip-Hop':'🎤', 'R&B':'🎶', 'Soul':'💛',
  'Funk':'🕺', 'Jazz':'🎷', 'Blues':'🎹', 'Country':'🤠', 'Folk':'🪕',
  'Classical':'🎻', 'Reggae':'🌿', 'Latin':'💃', 'K-Pop':'🌸', 'J-Pop':'🗾',
}

export default function HomePage({ sessionId, activeTournamentId, onStart }) {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [categories, setCategories] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState('genre')
  const [selected, setSelected] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getCategories()
      .then(data => setCategories(data.categories))
      .catch(() => setError(t('home.error.categories')))
      .finally(() => setLoading(false))
  }, [])

  async function handleStart() {
    if (!selected) return
    setStarting(true)
    setError(null)
    try {
      const data = await api.startTournament(sessionId, activeType, selected)
      trackTournamentStarted({
        categoryType: activeType,
        categoryValue: selected,
        startSource: 'new',
      })
      onStart(data.tournament.id)
    } catch (e) {
      setError(e.message)
      setStarting(false)
    }
  }

  const CATEGORY_KEYS = {
    genre: 'home.category.genre',
    country: 'home.category.country',
    language: 'home.category.language',
  }

  const options = categories?.[activeType] ?? []

  return (
    <div className="home">
      <div className="home-hero">
        <h1 className="home-title">Battle of Bands</h1>
        <p className="home-subtitle">{t('home.subtitle')}</p>
      </div>

      {activeTournamentId && (
        <div className="resume-banner">
          <span>🏆 {t('home.resume.message')}</span>
          <button className="btn btn--gold" onClick={() => navigate(`/tournament/${activeTournamentId}`)}>
            {t('home.resume.button')}
          </button>
        </div>
      )}

      {loading && <div className="home-loading"><div className="spinner" /></div>}

      {!loading && categories && (
        <div className="category-selector">
          <div className="type-tabs">
            {Object.keys(CATEGORY_KEYS).map(type => (
              <button
                key={type}
                className={`type-tab ${activeType === type ? 'active' : ''}`}
                onClick={() => { setActiveType(type); setSelected(null) }}
              >
                {t(CATEGORY_KEYS[type])}
              </button>
            ))}
          </div>

          <div className="options-grid">
            {options.map(opt => (
              <button
                key={opt}
                className={`option-card ${selected === opt ? 'selected' : ''}`}
                onClick={() => setSelected(opt)}
              >
                <span className="option-icon">
                  {activeType === 'genre' && (GENRE_ICONS[opt] || '🎵')}
                  {activeType === 'country' && (FLAG_MAP[opt] || '🌍')}
                  {activeType === 'language' && '🗣️'}
                </span>
                <span className="option-name">{opt}</span>
                <span className="option-count">
                  {categories._counts?.[activeType]?.[opt] ?? ''} {t('home.option.artists')}
                </span>
              </button>
            ))}
          </div>

          {error && <p className="home-error">{error}</p>}

          <div className="home-actions">
            <button
              className="btn btn--primary btn--lg"
              disabled={!selected || starting}
              onClick={handleStart}
            >
              {starting
                ? t('home.button.generating')
                : selected
                  ? t('home.button.start.with', { value: selected })
                  : t('home.button.start')
              }
            </button>
          </div>
        </div>
      )}

      {error && !loading && !categories && (
        <p className="home-error">{error}</p>
      )}
    </div>
  )
}
