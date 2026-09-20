import assert from 'node:assert/strict'
import test from 'node:test'

import { createAnalytics } from '../src/analytics.js'

function harness() {
  const appendedScripts = []
  const storage = new Map()

  const windowRef = {
    location: { href: 'https://battle-of-bands-game.netlify.app/tournament/test' },
  }

  const documentRef = {
    querySelector: () => appendedScripts.find(script => !script.removed) || null,
    createElement: () => ({
      dataset: {},
      removed: false,
      remove() {
        this.removed = true
      },
    }),
    head: {
      appendChild(script) {
        appendedScripts.push(script)
      },
    },
  }

  const storageRef = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null
    },
    setItem(key, value) {
      storage.set(key, value)
    },
  }

  return { windowRef, documentRef, storageRef, appendedScripts, storage }
}

function events(windowRef) {
  return (windowRef.dataLayer || [])
    .map(entry => Array.from(entry))
    .filter(entry => entry[0] === 'event')
}

test('analytics is a no-op when no GA measurement id is configured', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: '',
    windowRef: h.windowRef,
    documentRef: h.documentRef,
    storageRef: h.storageRef,
  })

  assert.equal(analytics.trackTournamentStarted({
    categoryType: 'genre',
    categoryValue: 'Rock',
  }), false)

  assert.equal(h.appendedScripts.length, 0)
  assert.deepEqual(events(h.windowRef), [])
})

test('successful start emits the expected isolated event payload', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: h.windowRef,
    documentRef: h.documentRef,
    storageRef: h.storageRef,
  })

  assert.equal(analytics.trackTournamentStarted({
    categoryType: 'genre',
    categoryValue: 'Rock',
    startSource: 'new',
  }), true)

  assert.equal(h.appendedScripts.length, 1)
  assert.deepEqual(events(h.windowRef), [[
    'event',
    'tournament_started',
    {
      category_type: 'genre',
      category_value: 'Rock',
      start_source: 'new',
    },
  ]])
})

test('vote event carries round and 1-based vote progress only after explicit tracking', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: h.windowRef,
    documentRef: h.documentRef,
    storageRef: h.storageRef,
  })

  analytics.trackVoteCast({
    round: 2,
    voteNumber: 9,
    categoryType: 'country',
    categoryValue: 'CA',
  })

  assert.deepEqual(events(h.windowRef)[0], [
    'event',
    'vote_cast',
    {
      round: 2,
      vote_number: 9,
      category_type: 'country',
      category_value: 'CA',
    },
  ])
})

test('completed tournament event is emitted once and does not send the tournament id', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: h.windowRef,
    documentRef: h.documentRef,
    storageRef: h.storageRef,
  })

  const payload = {
    categoryType: 'language',
    categoryValue: 'French',
    completionTimeSeconds: 87,
    votesCast: 15,
  }

  assert.equal(
    analytics.trackTournamentCompletedOnce('private-tournament-id', payload),
    true
  )
  assert.equal(
    analytics.trackTournamentCompletedOnce('private-tournament-id', payload),
    false
  )

  const completionEvents = events(h.windowRef)
    .filter(entry => entry[1] === 'tournament_completed')

  assert.equal(completionEvents.length, 1)
  assert.deepEqual(completionEvents[0][2], {
    category_type: 'language',
    category_value: 'French',
    completion_time_seconds: 87,
    votes_cast: 15,
  })
  assert.equal(JSON.stringify(completionEvents[0]).includes('private-tournament-id'), false)
})

test('page view and replay use standard event names and analytics failure never throws', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: h.windowRef,
    documentRef: h.documentRef,
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

  const broken = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: {},
    documentRef: {
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
      head: { appendChild() { throw new Error('blocked') } },
    },
    storageRef: h.storageRef,
  })

  assert.doesNotThrow(() => {
    assert.equal(broken.trackReplayStarted({
      categoryType: 'genre',
      categoryValue: 'Rock',
    }), false)
  })
})


test('failed initial gtag load can be retried without losing queued events', () => {
  const h = harness()
  const analytics = createAnalytics({
    measurementId: 'G-TEST123',
    windowRef: h.windowRef,
    documentRef: h.documentRef,
    storageRef: h.storageRef,
  })

  assert.equal(analytics.trackTournamentStarted({
    categoryType: 'genre',
    categoryValue: 'Alternative',
    startSource: 'new',
  }), true)

  assert.equal(h.appendedScripts.length, 1)
  const firstScript = h.appendedScripts[0]
  assert.equal(typeof firstScript.onerror, 'function')

  firstScript.onerror()
  assert.equal(firstScript.removed, true)
  assert.equal(firstScript.dataset.bobGaState, 'error')

  assert.equal(analytics.trackVoteCast({
    round: 1,
    voteNumber: 1,
    categoryType: 'genre',
    categoryValue: 'Alternative',
  }), true)

  assert.equal(h.appendedScripts.length, 2)
  const retryScript = h.appendedScripts[1]
  assert.notEqual(retryScript, firstScript)
  assert.equal(retryScript.dataset.bobGaState, 'loading')

  retryScript.onload()
  assert.equal(retryScript.dataset.bobGaState, 'loaded')

  assert.equal(analytics.trackReplayStarted({
    categoryType: 'genre',
    categoryValue: 'Alternative',
  }), true)

  assert.equal(h.appendedScripts.length, 2)
  assert.deepEqual(events(h.windowRef).map(entry => entry[1]), [
    'tournament_started',
    'vote_cast',
    'replay_started',
  ])
})
