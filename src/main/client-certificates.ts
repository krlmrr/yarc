// Sites that ask for a client certificate (company sign-in, national ID cards). Electron's default
// sends the first matching one without asking, which identifies the user to any site that asks,
// in incognito too. Like Chrome, ask which one to send, or none. Chromium remembers the answer
// for that site until the session ends, so the question comes once.
import { app, BrowserWindow, dialog, type Certificate } from 'electron'

const MAX_SHOWN = 4

function label(cert: Certificate): string {
  const issuer = cert.issuerName && cert.issuerName !== cert.subjectName ? ` (from ${cert.issuerName})` : ''
  return `${cert.subjectName || 'Certificate'}${issuer}`
}

export function askForClientCertificates(): void {
  app.on('select-client-certificate', (event, wc, url, list, callback) => {
    event.preventDefault()
    let host = url
    try {
      host = new URL(url).host
    } catch {}
    const shown = list.slice(0, MAX_SHOWN)
    const win = (wc && BrowserWindow.fromWebContents(wc)) || BrowserWindow.getFocusedWindow()
    const options = {
      type: 'question' as const,
      title: 'YARC',
      noLink: true,
      message: `${host} asks for a certificate to identify you`,
      detail: 'Only send one if you trust this site with who you are.',
      buttons: ["Don't Send", ...shown.map(label)],
      defaultId: 0,
      cancelId: 0
    }
    void (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
      .then(({ response }) => callback(response > 0 ? shown[response - 1] : undefined))
      .catch(() => callback(undefined))
  })
}
