# Contributing

Thanks for helping with Lootify Guard. Bug reports, ideas and pull requests are all welcome.

## Reporting

- **Bugs and ideas** go in [issues](https://github.com/lootifymarket/lootify-guard/issues/new/choose). Look for an existing one first.
- **Security problems** go in a private report, never an issue. See [SECURITY.md](SECURITY.md).
- **Never paste secrets**: no `.maFile`, passwords, revocation codes, tokens, cookies or `steamLoginSecure`. Screenshots too: turn on streamer mode or cover them.

## Rules the code keeps

These hold for every change. A pull request that breaks one isn't merged.

- **Secrets stay on the device.** Passwords, Guard secrets, revocation codes and tokens are never sent anywhere except to Steam, Lootify's servers included.
- **Secrets are never logged**, in debug builds too.
- **No telemetry.**
- **An account's requests go through its proxy** when it has one, every one of them.

## Setting up

You need Rust (stable), Node.js 22+ and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
npm install
npm run tauri dev
```

The Rust code is in `crates/core` (Steam, the vault, everything that doesn't need a window) and `src-tauri` (the app around it). The interface is React in `src`, with its words in `src/i18n` for English, Russian, Ukrainian and Chinese.

## Pull requests

1. Branch from `dev` and open the pull request against `dev`. `main` only gets releases.
2. Keep it to one change. Ask in an issue before a big one, and before adding a dependency.
3. New words in the interface go in all four languages.
4. Make sure the same checks as CI pass:

   ```sh
   npm run lint
   npx prettier --check .
   cargo fmt --all --check
   npm run build
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   ```

5. Say what changed and why. For anything you can see, add a screenshot without secrets in it.

## License

Lootify Guard is under [GPL-3.0](LICENSE). By opening a pull request, you agree that your change is released under the same license.
