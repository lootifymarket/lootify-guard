// Sets the app's version everywhere it's written: `npm run release:version 0.2.0`.
// The release build takes it from src-tauri/Cargo.toml and tags the release with it.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run release:version <major.minor.patch>')
  process.exit(1)
}

const root = new URL('../', import.meta.url)

function edit(path, change) {
  const file = fileURLToPath(new URL(path, root))
  const before = readFileSync(file, 'utf8')
  const after = change(before)
  if (after === before) {
    console.error(`${path} already has this version, or none to change`)
    process.exit(1)
  }
  writeFileSync(file, after)
}

// Only the app's own entries: the first `"version"` in each npm file, and the
// lootify-guard package in Cargo.
edit('package.json', (text) =>
  text.replace(/"version": "[^"]*"/, `"version": "${version}"`),
)
edit('package-lock.json', (text) =>
  text
    .replace(/"version": "[^"]*"/, `"version": "${version}"`)
    .replace(
      /("packages": \{\s*"": \{\s*"name": "lootify-guard",\s*"version": )"[^"]*"/,
      `$1"${version}"`,
    ),
)
edit('src-tauri/Cargo.toml', (text) =>
  text.replace(/^version = "[^"]*"/m, `version = "${version}"`),
)
edit('Cargo.lock', (text) =>
  text.replace(/(name = "lootify-guard"\nversion = )"[^"]*"/, `$1"${version}"`),
)

console.log(`Version set to ${version}`)
