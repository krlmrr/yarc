// electron-builder's afterPack hook (electron-builder.yml): flips Electron fuses in the packaged
// binary, before it's signed. Not with the `electronFuses` option because the fuses differ per
// platform: cookie encryption must stay off on macOS (docs/electron-notes.md section 8).
import { FuseV1Options, FuseVersion } from '@electron/fuses'

export default async function afterPack(context) {
  const mac = context.electronPlatformName === 'darwin'
  await context.packager.addElectronFuses(context, {
    version: FuseVersion.V1,
    // The binary can't be used as a plain Node or be debugged from outside: another program could
    // otherwise run its own code as YARC, with YARC's camera and microphone permissions.
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // file:// pages get no more than in Chrome (YARC's own UI comes from yarc://ui, ui-origin.ts).
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    // The app's code only comes from app.asar, and on macOS app.asar must match the hash in Info.plist.
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: mac,
    // Encrypt cookies like Chrome: a DPAPI-protected key on Windows, the Secret Service/kwallet on
    // Linux. On macOS the key would sit in the login keychain, and without an Apple Developer ID
    // every update would ask for the login password before the browser can read its cookies.
    [FuseV1Options.EnableCookieEncryption]: !mac
  })
}
