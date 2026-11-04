import assert from 'node:assert/strict'
import test from 'node:test'
import { searchOutput } from './output-search'

test('literal output search treats regex metacharacters as plain text', () => {
  const result = searchOutput('a.b aXb A.B', 'a.b', false)
  assert.deepEqual(result.matches, [{ start: 0, end: 3 }, { start: 8, end: 11 }])
  assert.equal(result.error, undefined)
})

test('regex output search returns all case-insensitive ranges', () => {
  const result = searchOutput('Build passed\nbuild failed', 'build\\s+(passed|failed)', true)
  assert.deepEqual(result.matches, [{ start: 0, end: 12 }, { start: 13, end: 25 }])
})

test('invalid regex is reported without throwing', () => {
  const result = searchOutput('some output', '(', true)
  assert.equal(result.matches.length, 0)
  assert.ok(result.error)
})

test('zero-width regex matches do not create empty highlights', () => {
  const result = searchOutput('aba', '(?=a)', true)
  assert.deepEqual(result.matches, [])
})