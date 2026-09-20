const DEFAULT_MEASUREMENT_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID || ''

function isValidMeasurementId(value) {
  return /^G-[A-Z0-9]+$/i.test(String(value || '').trim())
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function safeStorage(windowRef) {
  try {
    return windowRef?.localStorage || null
  } catch {
    return null
  }
}

export function createAnalytics({
  measurementId = DEFAULT_MEASUREMENT_ID,
  windowRef = typeof window !== 'undefined' ? window : null,
  storageRef,
} = {}) {
  const id = String(measurementId || '').trim()
  const storage = storageRef === undefined ? safeStorage(windowRef) : storageRef

  function initialize() {
    return Boolean(
      isValidMeasurementId(id)
      && windowRef
      && typeof windowRef.gtag === 'function'
    )
  }

  function emit(name, params = {}) {
    try {
      if (!initialize()) return false
      windowRef.gtag('event', name, params)
      return true
    } catch {
      return false
    }
  }

  function trackPageView(path) {
    const pagePath = String(path || '/')
    return emit('page_view', {
      page_path: pagePath,
      page_location: windowRef?.location?.href,
    })
  }

  function trackTournamentStarted({
    categoryType,
    categoryValue,
    startSource = 'new',
  }) {
    return emit('tournament_started', {
      category_type: categoryType,
      category_value: categoryValue,
      start_source: startSource,
    })
  }

  function trackVoteCast({
    round,
    voteNumber,
    categoryType,
    categoryValue,
  }) {
    return emit('vote_cast', {
      round: safeNumber(round),
      vote_number: safeNumber(voteNumber),
      category_type: categoryType,
      category_value: categoryValue,
    })
  }

  function trackTournamentCompletedOnce(tournamentId, {
    categoryType,
    categoryValue,
    completionTimeSeconds,
    votesCast = 15,
  }) {
    if (!tournamentId) return false

    const key = `bob-ga-completed:${tournamentId}`

    try {
      if (storage?.getItem(key) === '1') return false
    } catch {
      // Analytics must remain non-blocking when storage is unavailable.
    }

    const emitted = emit('tournament_completed', {
      category_type: categoryType,
      category_value: categoryValue,
      completion_time_seconds: safeNumber(completionTimeSeconds),
      votes_cast: safeNumber(votesCast),
    })

    if (emitted) {
      try {
        storage?.setItem(key, '1')
      } catch {
        // Event delivery matters more than local dedupe persistence.
      }
    }

    return emitted
  }

  function trackReplayStarted({ categoryType, categoryValue }) {
    return emit('replay_started', {
      category_type: categoryType,
      category_value: categoryValue,
    })
  }

  return {
    initialize,
    trackPageView,
    trackTournamentStarted,
    trackVoteCast,
    trackTournamentCompletedOnce,
    trackReplayStarted,
  }
}

const analytics = createAnalytics()

export const trackPageView = (...args) => analytics.trackPageView(...args)
export const trackTournamentStarted = (...args) => analytics.trackTournamentStarted(...args)
export const trackVoteCast = (...args) => analytics.trackVoteCast(...args)
export const trackTournamentCompletedOnce = (...args) =>
  analytics.trackTournamentCompletedOnce(...args)
export const trackReplayStarted = (...args) => analytics.trackReplayStarted(...args)
