import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canRerollUnknownPair,
  rerollErrorTranslationKey,
} from '../src/lib/unknownPairReroll.js'

test('unknown-pair reroll is available only for unresolved round-one matches', () => {
  assert.equal(canRerollUnknownPair({
    round: 1,
    winner_id: null,
    artist1_id: 'a',
    artist2_id: 'b',
  }), true)

  assert.equal(canRerollUnknownPair({
    round: 2,
    winner_id: null,
    artist1_id: 'a',
    artist2_id: 'b',
  }), false)

  assert.equal(canRerollUnknownPair({
    round: 1,
    winner_id: 'a',
    artist1_id: 'a',
    artist2_id: 'b',
  }), false)
})

test('exhausted replacement pool maps to specific localized copy', () => {
  assert.equal(
    rerollErrorTranslationKey('REROLL_POOL_EXHAUSTED'),
    'match.reroll.exhausted'
  )
  assert.equal(
    rerollErrorTranslationKey('OTHER'),
    'match.reroll.error'
  )
})
