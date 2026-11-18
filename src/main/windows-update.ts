// Windows updates are electron-updater's, which checks the installer against latest.yml. But
// latest.yml comes from the same release as the installer, and the installer isn't code-signed, so
// that only catches a broken download. Before YARC installs an update it also checks the installer's
// Ed25519 signature (update-signature.ts), which CI makes with the release key.
import fs from 'node:fs'
import path from 'node:path'
import { releaseAssetUrl, windowsInstallerName } from './release'
import { UPDATE_PUBLIC_KEY, verifyUpdate } from './update-signature'

/** Throws unless `file` is the installer of `version` for this CPU, signed with the release key. */
export async function verifyInstaller(file: string, version: string, arch: string): Promise<void> {
  const name = windowsInstallerName(version, arch)
  // The signature covers the name, which carries the version and CPU: an older signed installer
  // can't pass for this one.
  if (path.basename(file) !== name) throw new Error(`The update is ${path.basename(file)}, not ${name}`)
  const res = await fetch(releaseAssetUrl(version, `${name}.sig`), { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Downloading ${name}.sig failed: ${res.status}`)
  const [signature, installer] = await Promise.all([res.text(), fs.promises.readFile(file)])
  if (!verifyUpdate(name, installer, signature, UPDATE_PUBLIC_KEY)) throw new Error(`${name} doesn't match its signature`)
}
