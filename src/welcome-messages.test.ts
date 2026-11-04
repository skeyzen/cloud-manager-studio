import assert from 'node:assert/strict'
import test from 'node:test'
import { getWelcomeMessages } from './welcome-messages'

test('uses the first supported preferred language', () => {
  const messages = getWelcomeMessages(['ja-JP', 'it-IT', 'en-US'])

  assert.equal(messages.choose, 'Scegli una toolbox')
  assert.equal(messages.greeting(9), 'Buongiorno')
})

test('falls back to English when no preferred language is supported', () => {
  const messages = getWelcomeMessages(['ja-JP', 'pt-BR'])

  assert.equal(messages.choose, 'Choose a toolbox')
  assert.equal(messages.greeting(20), 'Good evening')
})