import assert from 'node:assert/strict'
import test from 'node:test'

import { isActiveTournament } from '../src/lib/tournamentLifecycle.js'

test('classifies an in-progress tournament as active', () => {
  assert.equal(isActiveTournament({ id: 't-1', status: 'in_progress' }), true)
})

test('classifies a completed tournament as inactive', () => {
  assert.equal(isActiveTournament({ id: 't-1', status: 'completed' }), false)
})

test('requires a tournament id and known active status', () => {
  assert.equal(isActiveTournament({ status: 'in_progress' }), false)
  assert.equal(isActiveTournament(null), false)
  assert.equal(isActiveTournament({ id: 't-1', status: 'abandoned' }), false)
})
