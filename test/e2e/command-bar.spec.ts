import { expect, test } from '@playwright/test'
import { app, base, dispatch, mod, openCommandBar, overlayKind, pageWithUrl, pressInActiveTab, restart, space, state, useApp } from './app'

useApp()

test('command bar opens a new tab at the top of Today', async () => {
  const ui = await pageWithUrl('index.html')
  await ui.locator('.newtab').click()
  const overlay = await pageWithUrl('overlay.html')
  const input = overlay.locator('.command input')
  await expect(input).toBeFocused()
  await input.fill(`${base}/one`)
  await input.press('Enter')
  await expect.poll(async () => (await space()).today[0]?.url).toBe(`${base}/one`)
  await expect.poll(async () => (await state()).live[(await space()).today[0].id]?.title).toBe('Page one')
  await expect(ui.locator('.row.active .title')).toHaveText('Page one')
})

test('keyboard shortcut Ctrl/Cmd+T opens the command bar from a web page', async () => {
  await pageWithUrl('/one')
  const before = (await space()).today.map((tab) => tab.url)
  await pressInActiveTab('T', [mod])
  const overlay = await pageWithUrl('overlay.html')
  await expect(overlay.locator('.command input')).toHaveValue('')
  await overlay.locator('.command input').fill(`${base}/two`)
  await overlay.locator('.command input').press('Enter')
  await expect.poll(async () => (await space()).today.map((tab) => tab.url)).toEqual([`${base}/two`, ...before])
})

test('command bar finds and switches to open tabs', async () => {
  const overlay = await openCommandBar()
  await overlay.locator('.command input').fill('page one')
  await expect(overlay.locator('.result').first()).toContainText('Page one')
  await expect(overlay.locator('.result.sel .hint')).toContainText('Switch to Tab')
  await overlay.locator('.command input').press('Enter')
  const current = await space()
  await expect.poll(async () => (await space()).activeItemId).toBe(current.today.find((tab) => tab.url.endsWith('/one'))!.id)
})

test('typing a canvas’s name offers it, and Enter opens it', async () => {
  const canvasId: string = await app.evaluate(() => {
    const browser = (globalThis as any).arcBrowser
    return browser.canvases.create(browser.space, 'Kitchen moodboard').id
  })
  const overlay = await openCommandBar()
  await overlay.locator('.command input').fill('kitchen mood')
  await expect(overlay.locator('.result').first()).toContainText('Kitchen moodboard')
  await expect(overlay.locator('.result.sel .hint')).toHaveText('Open Canvas')
  await overlay.locator('.command input').press('Enter')
  await expect.poll(async () => (await space()).activeItemId).toBe(canvasId)
  await expect.poll(overlayKind).toBe('none')
})

test('the command bar stays open while a page behind it finishes loading', async () => {
  // Windows gives the keyboard to a page whenever it commits a navigation; that blur used to close the bar.
  // As if the user were in YARC: the test window needn't be the foreground app (leaving the window still closes the bar).
  const focused = (on: boolean) =>
    app.evaluate((_electron, on) => {
      const win = (globalThis as any).arcBrowser.window.win
      if (on) win.isFocused = () => true
      else delete win.isFocused
    }, on)
  await focused(true)
  const previous = (await space()).activeItemId!
  await dispatch({ type: 'open', url: `${base}/slow-focus`, where: 'tab' })
  await dispatch({ type: 'overlay', mode: { kind: 'command', target: 'tab' } })
  await expect.poll(async () => (await state()).live[(await space()).activeItemId!]?.loading).toBe(false)
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(await overlayKind()).toBe('command')
  await dispatch({ type: 'overlay', mode: { kind: 'none' } })
  await dispatch({ type: 'close', id: (await space()).activeItemId! })
  await dispatch({ type: 'activate', id: previous })
  await focused(false)
})

test('command bar completes the top URL inline, like Arc', async () => {
  const overlay = await openCommandBar()
  const input = overlay.locator('.command input')
  await input.pressSequentially('127.0.0', { delay: 30 })
  await expect(input).toHaveValue(/^127\.0\.0\.1:\d+\//)
  // The completed part is selected, so typing on replaces it.
  expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe('127.0.0'.length)
  await input.press('Backspace')
  await expect(input).toHaveValue('127.0.0')
  await input.press('Escape')
})

const pressInOverlay = (keyCode: string) =>
  app.evaluate((_electron, keyCode) => {
    const wc = (globalThis as any).arcBrowser.window.overlay.webContents
    for (const type of ['keyDown', 'keyUp']) wc.sendInputEvent({ type, keyCode })
  }, keyCode)

test('Tab to Search: a site name, Tab, then a query searches that site, like Arc', async () => {
  // Answer https locally: no network, and YouTube can't redirect to a consent page.
  const partition = `persist:profile-${(await space()).profileId}`
  await app.evaluate(({ session }, partitionName) => {
    session.fromPartition(partitionName).protocol.handle('https', () => new Response('<title>stub</title>', { headers: { 'content-type': 'text/html' } }))
  }, partition)
  const before = (await space()).activeItemId
  try {
    const overlay = await openCommandBar()
    const input = overlay.locator('.command input')
    await input.pressSequentially('you', { delay: 30 })
    await expect(overlay.locator('.command .tab-hint')).toContainText('Search YouTube')
    await pressInOverlay('Tab')
    await expect(overlay.locator('.command .site-chip')).toHaveText('YouTube')
    await expect(input).toHaveValue('')
    await expect(input).toHaveAttribute('placeholder', 'Search YouTube…')
    // Backspace on the empty query leaves the mode and puts back what was typed.
    await pressInOverlay('Backspace')
    await expect(overlay.locator('.command .site-chip')).toHaveCount(0)
    await expect(input).toHaveValue('you')
    await pressInOverlay('Tab')
    await input.pressSequentially('lofi beats', { delay: 20 })
    await expect(overlay.locator('.result.sel')).toContainText('Search YouTube')
    await input.press('Enter')
    await expect.poll(async () => (await space()).today[0]?.url).toBe('https://www.youtube.com/results?search_query=lofi%20beats')
    // Leave the tabs as the next tests expect them.
    await dispatch({ type: 'close', id: (await space()).today[0].id })
    if (before) await dispatch({ type: 'activate', id: before })
  } finally {
    await app.evaluate(({ session }, partitionName) => session.fromPartition(partitionName).protocol.unhandle('https'), partition)
  }
})

test('launching to an empty window opens the command bar for a new tab, and launching to a page does not', async () => {
  const withStartupScreens = { YARC_STARTUP_SCREENS: '1' }
  const windowShown = () => app.evaluate(() => (globalThis as any).arcBrowser.window.win.isVisible())
  for (let closed = 0; (await space()).activeItemId && closed < 50; closed++) await dispatch({ type: 'close', id: (await space()).activeItemId! })
  expect((await space()).activeItemId).toBeUndefined()
  await restart(withStartupScreens)
  await expect.poll(overlayKind).toBe('command')
  await dispatch({ type: 'overlay', mode: { kind: 'none' } })
  await dispatch({ type: 'open', url: `${base}/launch-page`, where: 'tab' })
  await restart(withStartupScreens)
  await expect.poll(windowShown).toBe(true)
  expect(await overlayKind()).toBe('none')
})

test('after Escape closes the command bar on an empty window, ⌘T opens it again', async () => {
  for (let closed = 0; (await space()).activeItemId && closed < 50; closed++) await dispatch({ type: 'close', id: (await space()).activeItemId! })
  const pressInFocusedView = (keyCode: string, modifiers: string[] = []) =>
    app.evaluate(({ webContents }, [key, held]) => {
      const focused = webContents.getFocusedWebContents()
      if (!focused) return false
      focused.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: held as any })
      focused.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: held as any })
      return true
    }, [keyCode, modifiers] as const)
  await app.evaluate(() => {
    const window = (globalThis as any).arcBrowser.window.win
    window.show()
    window.focus()
  })
  try {
    await dispatch({ type: 'overlay', mode: { kind: 'command' } })
    await expect.poll(overlayKind).toBe('command')
    expect(await pressInFocusedView('Escape')).toBe(true)
    await expect.poll(overlayKind).toBe('none')
    expect(await pressInFocusedView('T', [mod === 'meta' ? 'meta' : 'control'])).toBe(true)
    await expect.poll(overlayKind).toBe('command')
  } finally {
    await dispatch({ type: 'overlay', mode: { kind: 'none' } })
    await app.evaluate(() => (globalThis as any).arcBrowser.window.win.hide())
  }
})

test('with the command bar open, a click on a sidebar tab selects it at once and closes the bar', async () => {
  await dispatch({ type: 'open', url: `${base}/bar-first`, where: 'tab' })
  const first = (await space()).activeItemId!
  await dispatch({ type: 'open', url: `${base}/bar-second`, where: 'tab' })
  const second = (await space()).activeItemId!
  const ui = await pageWithUrl('index.html')
  // A window that was shown and hidden again gets no animation frames, which Playwright's stability check waits for.
  const clickInSidebar = (target: string) => ui.locator(target).first().click({ force: true })
  try {
    await dispatch({ type: 'overlay', mode: { kind: 'command' } })
    await expect.poll(overlayKind).toBe('command')
    const overlayBounds = await app.evaluate(() => (globalThis as any).arcBrowser.window.overlay.getBounds())
    expect(overlayBounds.x).toBeGreaterThanOrEqual((await state()).layout.content.x)

    await clickInSidebar('.row:has-text("Page bar-first")')
    await expect.poll(async () => (await space()).activeItemId).toBe(first)
    await expect.poll(overlayKind).toBe('none')

    await dispatch({ type: 'overlay', mode: { kind: 'command' } })
    await expect.poll(overlayKind).toBe('command')
    await clickInSidebar('.newtab')
    await new Promise((done) => setTimeout(done, 300))
    expect(await overlayKind()).toBe('command')
  } finally {
    await dispatch({ type: 'overlay', mode: { kind: 'none' } })
    for (const id of [first, second]) await dispatch({ type: 'close', id })
  }
})

test('the command bar sits centred on the window at 35% of its height, and moves right only to stay clear of the sidebar', async () => {
  const overlay = await pageWithUrl('overlay.html')
  const resize = (width: number, height: number) =>
    app.evaluate((_electron, [width, height]) => (globalThis as any).arcBrowser.window.win.setContentSize(width, height), [width, height] as const)
  const original = await app.evaluate(() => (globalThis as any).arcBrowser.window.win.getContentSize() as [number, number])
  const barInWindow = async () => {
    const box = await overlay.locator('.panel.command').boundingBox()
    const { bounds, size } = await app.evaluate(() => {
      const window = (globalThis as any).arcBrowser.window
      const [width, height] = window.win.getContentSize()
      return { bounds: window.overlay.getBounds(), size: { width, height } }
    })
    return box && { left: bounds.x + box.x, centreOffset: Math.round(bounds.x + box.x + box.width / 2 - size.width / 2), top: Math.round(bounds.y + box.y), wanted: Math.round(size.height * 0.35) }
  }
  const openBar = async () => {
    await dispatch({ type: 'overlay', mode: { kind: 'none' } })
    await dispatch({ type: 'overlay', mode: { kind: 'command' } })
  }
  try {
    await resize(1400, 900)
    for (const sidebarVisible of [true, false]) {
      await dispatch({ type: 'settings', patch: { sidebarVisible } })
      await openBar()
      await expect.poll(async () => Math.abs((await barInWindow())?.centreOffset ?? 99)).toBeLessThanOrEqual(1)
      const bar = (await barInWindow())!
      expect(Math.abs(bar.top - bar.wanted)).toBeLessThanOrEqual(1)
    }
    await dispatch({ type: 'settings', patch: { sidebarVisible: true } })
    await resize(760, 600)
    await openBar()
    await expect.poll(async () => (await barInWindow())?.left ?? 0).toBeGreaterThanOrEqual((await state()).layout.content.x)
  } finally {
    await dispatch({ type: 'overlay', mode: { kind: 'none' } })
    await dispatch({ type: 'settings', patch: { sidebarVisible: true } })
    await resize(...original)
  }
})
