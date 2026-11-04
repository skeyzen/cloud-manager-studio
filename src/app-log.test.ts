import assert from 'node:assert/strict'
import test from 'node:test'
import { createLocalAppLog } from './app-log'

test('local renderer logs have unique keys when created in the same millisecond', () => {
  const timestamp = new Date('2026-10-30T20:14:57.000Z')
  const first = createLocalAppLog('error', 'First log', timestamp)
  const second = createLocalAppLog('error', 'Second log', timestamp)

  assert.notEqual(first.id, second.id)
})