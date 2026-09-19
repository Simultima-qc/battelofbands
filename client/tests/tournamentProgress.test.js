import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveTournamentProgress } from '../src/lib/tournamentProgress.js'

function match(id, winner = null) {
  return { id, winner_id: winner }
}

test('reports 0 / 15 for a new 16-artist tournament with only round 1 created', () => {
  const bracket = [
    Array.from({ length: 8 }, (_, i) => match(`r1-${i}`)),
  ]

  assert.deepEqual(deriveTournamentProgress(bracket), { done: 0, total: 15 })
})

test('keeps denominator fixed as later rounds are generated', () => {
  const bracket = [
    Array.from({ length: 8 }, (_, i) => match(`r1-${i}`, 'winner')),
    Array.from({ length: 4 }, (_, i) => match(`r2-${i}`)),
  ]

  assert.deepEqual(deriveTournamentProgress(bracket), { done: 8, total: 15 })
})

test('counts resolved matches across all generated rounds', () => {
  const bracket = [
    Array.from({ length: 8 }, (_, i) => match(`r1-${i}`, 'winner')),
    Array.from({ length: 4 }, (_, i) => match(`r2-${i}`, 'winner')),
    [match('r3-0', 'winner'), match('r3-1')],
  ]

  assert.deepEqual(deriveTournamentProgress(bracket), { done: 13, total: 15 })
})

test('reports 15 / 15 for a completed 16-artist bracket', () => {
  const bracket = [
    Array.from({ length: 8 }, (_, i) => match(`r1-${i}`, 'winner')),
    Array.from({ length: 4 }, (_, i) => match(`r2-${i}`, 'winner')),
    Array.from({ length: 2 }, (_, i) => match(`r3-${i}`, 'winner')),
    [match('r4-0', 'winner')],
  ]

  assert.deepEqual(deriveTournamentProgress(bracket), { done: 15, total: 15 })
})

test('derives a legacy 32-artist total from 16 first-round matches', () => {
  const bracket = [
    Array.from({ length: 16 }, (_, i) => match(`r1-${i}`)),
  ]

  assert.deepEqual(deriveTournamentProgress(bracket), { done: 0, total: 31 })
})

test('returns 0 / 0 for a missing bracket', () => {
  assert.deepEqual(deriveTournamentProgress(null), { done: 0, total: 0 })
})
