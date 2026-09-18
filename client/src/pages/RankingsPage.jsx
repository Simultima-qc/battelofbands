import { useState, useEffect } from 'react'
import { api } from '../api'
import { useLanguage } from '../i18n/LanguageContext'
import { parseRankingsResponse } from '../lib/rankingsResponse'
import './RankingsPage.css'

const FLAG_MAP = {
  US:'🇺🇸', GB:'🇬🇧', CA:'🇨🇦', AU:'🇦🇺', FR:'🇫🇷', DE:'🇩🇪', SE:'🇸🇪',
  NO:'🇳🇴', IE:'🇮🇪', NZ:'🇳🇿', BR:'🇧🇷', MX:'🇲🇽', ES:'🇪🇸', IT:'🇮🇹',
  JP:'🇯🇵', KR:'🇰🇷', JM:'🇯🇲', CU:'🇨🇺', NG:'🇳🇬', SN:'🇸🇳', BE:'🇧🇪',
  NL:'🇳🇱', CH:'🇨🇭', AT:'🇦🇹', DK:'🇩🇰', FI:'🇫🇮', PT:'🇵🇹', AR:'🇦🇷',
  CO:'🇨🇴', CL:'🇨🇱', IS:'🇮🇸', ML:'🇲🇱', CM:'🇨🇲', CV:'🇨🇻', PR:'🇵🇷',
  BB:'🇧🇧',
}

export default function RankingsPage() {
  const { t } = useLanguage()
  const [rankings, setRankings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 50

  useEffect(() => {
    setLoading(true)
    api.getRankings(page, LIMIT, 'avg')
      .then(data => {
        const parsed = parseRankingsResponse(data)
        setRankings(parsed.rankings)
        setTotal(parsed.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div className="rankings">
      <h1 className="rankings-title">{t('rankings.title')}</h1>
      <p className="rankings-sub">{t('rankings.subtitle')}</p>

      {loading && <div className="rankings-loading"><div className="spinner" /></div>}

      {!loading && rankings?.length === 0 && (
        <div className="rankings-empty">
          <p>{t('rankings.empty')}</p>
          <a href="/" className="btn btn--primary">{t('rankings.button.start')}</a>
        </div>
      )}

      {!loading && rankings?.length > 0 && (
        <>
          <div className="rankings-table">
            <div className="rankings-header">
              <span>#</span>
              <span>{t('rankings.header.artist')}</span>
              <span>{t('rankings.header.avg')} ★</span>
              <span>{t('rankings.header.points')}</span>
              <span>{t('rankings.header.wins')}</span>
              <span>{t('rankings.header.finals')}</span>
              <span>{t('rankings.header.tournaments')}</span>
            </div>
            {rankings.map((r, i) => {
              const rank = (page - 1) * LIMIT + i + 1
              const genres = typeof r.genres === 'string'
                ? JSON.parse(r.genres)
                : r.genres || []
              const flag = FLAG_MAP[r.country] || ''
              const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank

              return (
                <div key={r.artist_id} className={`rankings-row ${rank <= 3 ? 'top3' : ''}`}>
                  <span className="rank-num">{medal}</span>
                  <div className="rank-artist">
                    <span className="rank-name">{r.name}</span>
                    <span className="rank-meta">
                      {flag} {r.country}
                      {genres[0] && <> · <em>{genres[0]}</em></>}
                    </span>
                  </div>
                  <span className="rank-avg">{r.avg?.toFixed(1) ?? '—'}</span>
                  <span className="rank-points">{r.points}</span>
                  <span className="rank-stat">{r.wins}</span>
                  <span className="rank-stat">{r.finals}</span>
                  <span className="rank-stat">{r.tournaments_played}</span>
                </div>
              )
            })}
          </div>

          {total > LIMIT && (
            <div className="rankings-pagination">
              <button
                className="btn btn--outline"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                {t('rankings.pagination.prev')}
              </button>
              <span className="page-info">
                {t('rankings.pagination.info', { page, total: Math.ceil(total / LIMIT) })}
              </span>
              <button
                className="btn btn--outline"
                disabled={page * LIMIT >= total}
                onClick={() => setPage(p => p + 1)}
              >
                {t('rankings.pagination.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
