// Windows updates are electron-updater's, which checks the installer against latest.yml. But
// latest.yml comes from the same release as the installer, and the installer isn't code-signed, so
// that only catches a broken download. Before YARC installs an update it also checks the installer's
// Ed25519 signature (update-signature.ts), which CI makes with the release key.
import fs from 'node:fs'
import path from 'node:path'
import { releaseAssetUrl, windowsInstallerName } from './release'
import { UPDATE_PUBLIC_KEY, verifyUpdate } from './update-signature'

/** What a checked installer was signed with, to check it again just before it runs (stillSigned). */
export interface CheckedInstaller {
  file: string
  name: string
  signature: string
}

/** Throws unless `file` is the installer of `version` for this CPU, signed with the release key. */
export async function verifyInstaller(file: string, version: string, arch: string): Promise<CheckedInstaller> {
  const name = windowsInstallerName(version, arch)
  // The signature covers the name, which carries the version and CPU: an older signed installer
  // can't pass for this one.
  if (path.basename(file) !== name) throw new Error(`The update is ${path.basename(file)}, not ${name}`)
  const res = await fetch(releaseAssetUrl(version, `${name}.sig`), { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Downloading ${name}.sig failed: ${res.status}`)
  const [signature, installer] = await Promise.all([res.text(), fs.promises.readFile(file)])
  if (!verifyUpdate(name, installer, signature, UPDATE_PUBLIC_KEY)) throw new Error(`${name} doesn't match its signature`)
  return { file, name, signature }
}

/**
 * The same check again, synchronously, as YARC quits: the installer waited in the profile folder
 * since the download, where another program could have swapped it.
 */
export function stillSigned(checked: CheckedInstaller): boolean {
  try {
    return verifyUpdate(checked.name, fs.readFileSync(checked.file), checked.signature, UPDATE_PUBLIC_KEY)
  } catch {
    return false
  }
}
