// Links a web page hands to another app (mailto:, msteams:, zoommtg:, …). Like Chrome, YARC asks
// before opening one; "Always allow" is remembered per site and scheme until YARC quits.
import { BrowserWindow, dialog, shell, type WebContents } from 'electron'
import { externalLinkInfo } from './external-link-info'

const alwaysAllowed = new Set<string>()
/** Pages with a question on screen: a page can't stack dialogs by launching links in a loop. */
const asking = new Set<number>()
/** Site and scheme the user just said Cancel to: the page can't ask again on its own until a pause has passed. */
const cancelledAt = new Map<string, number>()
const CANCEL_QUIET_MS = 30_000

/** `userActivated`: the user just clicked or typed in the page, so it's their link, not the page's doing. */
export async function openExternalLink(from: WebContents, url: string, userActivated = false): Promise<void> {
  const info = externalLinkInfo(url, from.isDestroyed() ? '' : from.getURL())
  if (info.blocked) return console.warn('[external] refused', info.scheme)
  const key = `${info.origin}|${info.scheme}`
  if (!alwaysAllowed.has(key)) {
    if (from.isDestroyed() || asking.has(from.id)) return
    if (!userActivated && Date.now() - (cancelledAt.get(key) ?? 0) < CANCEL_QUIET_MS) return
    const win = BrowserWindow.fromWebContents(from) ?? BrowserWindow.getFocusedWindow()
    const options = {
      type: 'question' as const,
      title: 'YARC',
      // Plain buttons; Windows would otherwise draw custom labels as big "command links".
      noLink: true,
      buttons: [`Open ${info.app}`, 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `Open ${info.app}?`,
      detail: `${info.site || 'This page'} wants to open this link in another app:\n${url.length > 160 ? `${url.slice(0, 160)}…` : url}`,
      checkboxLabel: info.site ? `Always allow ${info.site} to open ${info.scheme}: links` : undefined
    }
    const id = from.id
    asking.add(id)
    let answer: Electron.MessageBoxReturnValue
    try {
      answer = await (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
    } finally {
      asking.delete(id)
    }
    const { response, checkboxChecked } = answer
    if (response !== 0) {
      cancelledAt.set(key, Date.now())
      return
    }
    if (checkboxChecked) alwaysAllowed.add(key)
  }
  await shell.openExternal(url).catch((err: unknown) => console.warn('[external] no app for', info.scheme, err))
}
