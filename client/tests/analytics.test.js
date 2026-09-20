import assert from 'node:assert/strict'
import test from 'node:test'

import { createAnalytics } from '../src/analytics.js'

function harness() {
  const storage = new Map()
  const dataLayer = []
  const windowRef = {
    location: { href: 'https://battle-of-bands-game.netlify.app/tournament/test' },
    dataLayer,
  }

  windowRef.gtag = function gtag() {
    dataLayer.push(arguments)
  }

  const storageRef = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null
    },
    setItem(key, value) {
      storage.set(key, value)
    },
  }

  return { windowRef, storageRef }
}

function events(windowRef) {
  return (windowRef.dataLayer || [])
    .map(entry => Array.from(entry))
    .filter(entry => entry[0] === 'event')
}

test('analytics is disabled without a measurement id', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: '',
    windowRef: h.windowRef,
    storageRef: h.storageRef,
  })

  assert.equal(analytics.trackTournamentStarted({
    categoryType: 'genre',
    categoryValue: 'Rock',
  }), false)
  assert.deepEqual(events(h.windowRef), [])
})

test('analytics is disabled until the HTML bootstrap defines gtag', () => {
  const h = harness()
  delete h.windowRef.gtag

  const analytics = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: h.windowRef,
    storageRef: h.storageRef,
  })

  assert.equal(analytics.trackTournamentStarted({
    categoryType: 'genre',
    categoryValue: 'Rock',
  }), false)
})

test('start and vote events preserve the public event contract', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: h.windowRef,
    storageRef: h.storageRef,
  })

  assert.equal(analytics.trackTournamentStarted({
    categoryType: 'genre',
    categoryValue: 'Rock',
    startSource: 'new',
  }), true)

  assert.equal(analytics.trackVoteCast({
    round: 2,
    voteNumber: 9,
    categoryType: 'country',
    categoryValue: 'CA',
  }), true)

  assert.deepEqual(events(h.windowRef), [
    [
      'event',
      'tournament_started',
      {
        category_type: 'genre',
        category_value: 'Rock',
        start_source: 'new',
      },
    ],
    [
      'event',
      'vote_cast',
      {
        round: 2,
        vote_number: 9,
        category_type: 'country',
        category_value: 'CA',
      },
    ],
  ])
})

test('completed tournament event is emitted once without exposing the tournament id', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: h.windowRef,
    storageRef: h.storageRef,
  })

  const payload = {
    categoryType: 'language',
    categoryValue: 'French',
    completionTimeSeconds: 87,
    votesCast: 15,
  }

  assert.equal(analytics.trackTournamentCompletedOnce('local-only-id', payload), true)
  assert.equal(analytics.trackTournamentCompletedOnce('local-only-id', payload), false)

  const completionEvents = events(h.windowRef)
    .filter(entry => entry[1] === 'tournament_completed')

  assert.equal(completionEvents.length, 1)
  assert.deepEqual(completionEvents[0][2], {
    category_type: 'language',
    category_value: 'French',
    completion_time_seconds: 87,
    votes_cast: 15,
  })
  assert.equal(JSON.stringify(completionEvents[0]).includes('local-only-id'), false)
})

test('page view and replay events remain unchanged', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: h.windowRef,
    storageRef: h.storageRef,
  })

  assert.equal(analytics.trackPageView('/rankings'), true)
  assert.equal(analytics.trackReplayStarted({
    categoryType: 'genre',
    categoryValue: 'Jazz',
  }), true)

  assert.deepEqual(events(h.windowRef).map(entry => entry[1]), [
    'page_view',
    'replay_started',
  ])
})
