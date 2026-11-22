import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assign, bindingLabel, canRemap, commandForInput, effectiveKeymap, pressed, usedBy, validShortcuts, whyNot, type KeyInput } from '../../src/shared/keymap.ts'

const mac = true
const windows = false
const press = (code: string, mods: Partial<KeyInput> = {}): KeyInput => ({ type: 'keyDown', code, key: '', control: false, meta: false, alt: false, shift: false, ...mods })

test('a key press reads as an accelerator, modifiers in a fixed order', () => {
  assert.deepEqual(pressed(press('KeyK', { shift: true, meta: true })), { accel: 'Cmd+Shift+K', done: true })
  assert.deepEqual(pressed(press('Digit5', { control: true })), { accel: 'Ctrl+5', done: true })
  assert.deepEqual(pressed(press('ArrowLeft', { alt: true, control: true })), { accel: 'Ctrl+Alt+Left', done: true })
  assert.deepEqual(pressed(press('F6')), { accel: 'F6', done: true })
})

test('holding only modifiers is not a shortcut yet', () => {
  assert.deepEqual(pressed(press('MetaLeft', { meta: true, shift: true })), { accel: 'Cmd+Shift', done: false })
  assert.deepEqual(pressed(press('ShiftRight', { shift: true })), { accel: 'Shift', done: false })
})

test('with no changes, every command keeps its default keys', () => {
  assert.deepEqual(effectiveKeymap(mac).get('reload'), ['Cmd+R', 'F5'])
  assert.deepEqual(effectiveKeymap(windows).get('reload'), ['Ctrl+R', 'F5'])
})

test('a changed shortcut replaces all of that command’s default keys', () => {
  const shortcuts = { reload: ['Cmd+K'] }
  assert.equal(commandForInput(press('KeyK', { meta: true }), mac, shortcuts), 'reload')
  assert.equal(commandForInput(press('KeyR', { meta: true }), mac, shortcuts), undefined)
  assert.equal(commandForInput(press('F5'), mac, shortcuts), undefined)
  assert.equal(bindingLabel('reload', mac, shortcuts), '⌘K')
})

test('a shortcut is per command, and applies on the platform it was recorded on', () => {
  const shortcuts = { reload: ['Ctrl+K'] }
  assert.equal(commandForInput(press('KeyK', { control: true }), windows, shortcuts), 'reload')
  assert.equal(bindingLabel('reload', windows, shortcuts), 'Ctrl+K')
  assert.equal(bindingLabel('newTab', windows, shortcuts), 'Ctrl+T')
})

test('a key given to another command is taken away from its default owner', () => {
  const shortcuts = { find: ['F5'] }
  assert.equal(commandForInput(press('F5'), windows, shortcuts), 'find')
  assert.deepEqual(effectiveKeymap(windows, shortcuts).get('reload'), ['Ctrl+R'])
})

test('a command can be left without keys, and resetting it brings back its defaults minus keys another command took', () => {
  const shortcuts = { find: ['F5'] }
  assert.deepEqual(effectiveKeymap(windows, { ...shortcuts, reload: [] }).get('reload'), [])
  assert.deepEqual(effectiveKeymap(windows, shortcuts).get('reload'), ['Ctrl+R'])
})

test('a conflict names the command that already has the keys', () => {
  assert.equal(usedBy('Cmd+T', 'reload', mac), 'newTab')
  assert.equal(usedBy('Cmd+T', 'newTab', mac), undefined)
  assert.equal(usedBy('Cmd+K', 'reload', mac), undefined)
})

test('a conflict is found whatever order the default writes its modifiers in', () => {
  assert.equal(usedBy('Cmd+Alt+Shift+C', 'reload', mac), 'copyUrlMarkdown')
  assert.equal(usedBy('Cmd+Alt+Shift+N', 'reload', mac), 'newFolder')
})

test('a conflict sees changed shortcuts, not just defaults', () => {
  assert.equal(usedBy('Cmd+K', 'find', mac, { reload: ['Cmd+K'] }), 'reload')
  assert.equal(usedBy('Cmd+R', 'find', mac, { reload: ['Cmd+K'] }), undefined)
})

test('replacing takes the keys from the other command', () => {
  assert.deepEqual(assign({}, 'find', 'Cmd+T', mac), { find: ['Cmd+T'] })
  assert.equal(bindingLabel('newTab', mac, assign({}, 'find', 'Cmd+T', mac)), '')
  assert.deepEqual(assign({ reload: ['Cmd+K'] }, 'find', 'Cmd+K', mac), { reload: [], find: ['Cmd+K'] })
})

test('numbered spaces and tabs and the tab switcher are fixed; others can change', () => {
  assert.equal(canRemap('space3'), false)
  assert.equal(canRemap('tab9'), false)
  assert.equal(canRemap('switcherNext'), false)
  assert.equal(canRemap('reload'), true)
  assert.equal(canRemap('newSpace'), true)
})

test('keys the system keeps, and keys that would catch typing, are refused', () => {
  assert.match(whyNot('Cmd+Q', mac)!, /Quit/)
  assert.match(whyNot('Cmd+C', mac)!, /Copy/)
  assert.match(whyNot('Alt+F4', windows)!, /Close Window/)
  assert.ok(whyNot('Cmd+K', windows), 'the Windows key')
  assert.ok(whyNot('K', mac))
  assert.ok(whyNot('Shift+K', windows))
  assert.ok(whyNot('Alt+K', mac), 'Option+K types a character on a Mac')
  assert.equal(whyNot('Alt+K', windows), undefined)
  assert.equal(whyNot('Cmd+K', mac), undefined)
  assert.equal(whyNot('F6', mac), undefined)
})

test('saved shortcuts keep only known, changeable commands and valid keys', () => {
  assert.deepEqual(validShortcuts({ reload: ['Shift+Cmd+K', 'Cmd+Q', 'K', 'Cmd+<script>', 3], space1: ['Cmd+J'], nope: ['Cmd+J'], find: 'Cmd+J' }, mac), {
    reload: ['Cmd+Shift+K']
  })
  assert.deepEqual(validShortcuts({ reload: [] }, mac), { reload: [] })
  assert.equal(validShortcuts(['Cmd+K'], mac), undefined)
  assert.equal(validShortcuts(null, mac), undefined)
})
