import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validSettingsPatch } from '../../src/shared/settings.ts'
import type { Settings } from '../../src/shared/types.ts'

const current = { theme: 'system', searchEngine: 'google', archiveAfterHours: 12, adblock: true, adblockAllowlist: [] } as unknown as Settings

test('a settings change keeps the settings that exist, with the type they already have', () => {
  assert.deepEqual(validSettingsPatch(current, { archiveAfterHours: 24, adblock: false, madeUp: 1 }, true), { archiveAfterHours: 24, adblock: false })
  assert.deepEqual(validSettingsPatch(current, { archiveAfterHours: '24', adblock: 'no' }, true), {})
})

test('a settings change drops numbers that are not finite and lists that are not all text', () => {
  assert.deepEqual(validSettingsPatch(current, { archiveAfterHours: Infinity, adblockAllowlist: ['a.com', 2] }, true), {})
  assert.deepEqual(validSettingsPatch(current, { adblockAllowlist: ['a.com'] }, true), { adblockAllowlist: ['a.com'] })
})

test('the theme and search engine take only the values YARC knows', () => {
  assert.deepEqual(validSettingsPatch(current, { theme: 'dark', searchEngine: 'duckduckgo' }, true), { theme: 'dark', searchEngine: 'duckduckgo' })
  assert.deepEqual(validSettingsPatch(current, { theme: 'pink', searchEngine: 'altavista' }, true), {})
})

test('a settings change that is not an object changes nothing', () => {
  assert.deepEqual(validSettingsPatch(current, null, true), {})
  assert.deepEqual(validSettingsPatch(current, 'theme', true), {})
})
