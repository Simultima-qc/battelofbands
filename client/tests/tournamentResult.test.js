import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveTournamentResult } from '../src/lib/tournamentResult.js'

function artist(id, name) {
  return { id, name, country: 'CA', genres: '["Rock"]', image_url: null }
}

function match(round, index, a1, a2, winnerId) {
  return {
    id: `r${round}-m${index}`,
    round,
    match_index: index,
    artist1: a1,
    artist2: a2,
    artist1_id: a1.id,
    artist2_id: a2.id,
    winner_id: winnerId,
  }
}

const a = artist('a', 'Alpha')
const b = artist('b', 'Bravo')
const c = artist('c', 'Charlie')
const d = artist('d', 'Delta')
const e = artist('e', 'Echo')
const f = artist('f', 'Foxtrot')
const g = artist('g', 'Golf')
const h = artist('h', 'Hotel')
const i = artist('i', 'India')
const j = artist('j', 'Juliet')
const k = artist('k', 'Kilo')
const l = artist('l', 'Lima')
const m = artist('m', 'Mike')
const n = artist('n', 'November')
const o = artist('o', 'Oscar')
const p = artist('p', 'Papa')

const completedBracket = [
  [
    match(1, 0, a, b, 'a'),
    match(1, 1, c, d, 'c'),
    match(1, 2, e, f, 'e'),
    match(1, 3, g, h, 'g'),
    match(1, 4, i, j, 'i'),
    match(1, 5, k, l, 'k'),
    match(1, 6, m, n, 'm'),
    match(1, 7, o, p, 'o'),
  ],
  [
    match(2, 0, a, c, 'a'),
    match(2, 1, e, g, 'e'),
    match(2, 2, i, k, 'i'),
    match(2, 3, m, o, 'm'),
  ],
  [
    match(3, 0, a, e, 'a'),
    match(3, 1, i, m, 'i'),
  ],
  [
    match(4, 0, a, i, 'a'),
  ],
]

test('derives champion, finalist and exactly four unique semifinalists', () => {
  const result = deriveTournamentResult(
    {
      status: 'completed',
      winner_id: 'a',
      winner: { ...a, genres: ['Rock'] },
    },
    completedBracket
  )

  assert.ok(result)
  assert.equal(result.champion.id, 'a')
  assert.equal(result.finalist.id, 'i')
  assert.deepEqual(result.top4.map(artist => artist.id), ['a', 'i', 'e', 'm'])
  assert.equal(new Set(result.top4.map(artist => artist.id)).size, 4)
})

test('does not expose a result for an incomplete tournament', () => {
  assert.equal(
    deriveTournamentResult(
      { status: 'in_progress', winner_id: null },
      completedBracket
    ),
    null
  )
})

test('returns null when the semifinal field cannot prove a complete Top 4', () => {
  const incomplete = [
    completedBracket[0],
    completedBracket[1],
    [match(3, 0, a, e, 'a')],
    completedBracket[3],
  ]

  assert.equal(
    deriveTournamentResult(
      { status: 'completed', winner_id: 'a', winner: a },
      incomplete
    ),
    null
  )
})
