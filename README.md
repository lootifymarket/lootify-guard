# Lootify Guard

Desktop app for managing Steam accounts: Steam Guard codes, trade and market confirmations, inventories and proxies for many accounts in one place. A companion to [Lootify Market](https://lootify.market). Windows and macOS.

## Install

Download the latest build from [Releases](https://github.com/lootifymarket/lootify-guard/releases):

- **macOS 14 or newer** (Apple Silicon and Intel): `.dmg`, or `.zip` with the app inside.
- **Windows 10 or 11**: `-setup.exe` installs it; `-portable.zip` runs without installing.

The builds aren't signed yet, so the system warns before the first launch:

- **macOS** says the app can't be checked. Open System Settings → Privacy & Security and press **Open Anyway** next to Lootify Guard. Or run `xattr -dr com.apple.quarantine "/Applications/Lootify Guard.app"`.
- **Windows** shows "Windows protected your PC". Press **More info**, then **Run anyway**.

`SHA256SUMS.txt` in each release lists the files' checksums.

## Development

You need Rust (stable), Node.js 22+ and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
npm install
npm run tauri dev
```

## Releasing

1. Raise the version on `dev`: `npm run release:version 0.2.0`, and merge it.
2. Merge `dev` into `main`. GitHub Actions builds both platforms into a draft release.
3. Check the draft and publish it. Publishing makes the `v0.2.0` tag.
