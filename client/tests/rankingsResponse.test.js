import assert from 'node:assert/strict'
import test from 'node:test'

import { parseRankingsResponse } from '../src/lib/rankingsResponse.js'

test('reads rankings and total from the API pagination contract', () => {
  const result = parseRankingsResponse({
    rankings: [{ artist_id: 'a' }, { artist_id: 'b' }],
    pagination: { total: 73, page: 1, limit: 50, total_pages: 2 },
  })

  assert.deepEqual(result, {
    rankings: [{ artist_id: 'a' }, { artist_id: 'b' }],
    total: 73,
  })
})

test('accepts numeric string totals from JSON-compatible sources', () => {
  const result = parseRankingsResponse({
    rankings: [],
    pagination: { total: '51' },
  })

  assert.equal(result.total, 51)
})

test('falls back safely when pagination or rankings are missing or invalid', () => {
  assert.deepEqual(parseRankingsResponse({}), { rankings: [], total: 0 })
  assert.deepEqual(
    parseRankingsResponse({ rankings: 'bad', pagination: { total: -4 } }),
    { rankings: [], total: 0 }
  )
})
