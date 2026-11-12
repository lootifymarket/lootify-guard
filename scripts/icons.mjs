import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = fileURLToPath(new URL('../src-tauri/icons/', import.meta.url))

// Shapes and colors are copied from the LogoMark component in the design (64×64 viewBox).
const marks = {
  shield: `
    <path d="M9 19H32V30H9Z" fill="#FF7A7A"/>
    <path d="M32 19H55V30H32Z" fill="#E0262B"/>
    <path d="M9 30H32V63C19 57 9 47 9 33Z" fill="#FF1A1A"/>
    <path d="M32 30H55V33C55 47 45 57 32 63Z" fill="#A8121A"/>
    <path d="M12 3L24 8.5L32 1.5V14.5H17Z" fill="#FF1A1A"/>
    <path d="M32 1.5L40 8.5L52 3L47 14.5H32Z" fill="#CC0F14"/>`,
  flat: `
    <path d="M10 18H32V63C20 58 10 50 10 37Z" fill="#FF1A1A"/>
    <path d="M32 18H54V37C54 50 44 58 32 63Z" fill="#C4161C"/>
    <path d="M11 1.5L24 7L32 0V13H16Z" fill="#FF1A1A"/>
    <path d="M32 0L40 7L53 1.5L48 13H32Z" fill="#CC0F14"/>`,
}

// macOS icons leave a margin so the tile matches other apps in the Dock (824 of 1024).
const MACOS_INSET = 100

// The design's app icon is a 96 px tile with a 22 px corner and a 1 px border,
// with the mark at 58 px. At 24 px and below the design switches to the flat mark.
function tile(size, inset) {
  const tileSize = 1024 - inset * 2
  const unit = tileSize / 96
  const markSize = 58 * unit
  const markOffset = inset + (tileSize - markSize) / 2
  const mark = (markSize / 1024) * size <= 24 ? marks.flat : marks.shield
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="${inset + unit / 2}" y="${inset + unit / 2}" width="${tileSize - unit}" height="${tileSize - unit}"
    rx="${22 * unit - unit / 2}" fill="#050505" stroke="#222222" stroke-width="${unit}"/>
  <g transform="translate(${markOffset} ${markOffset}) scale(${markSize / 64})">${mark}</g>
</svg>`
}

function render(svg, px) {
  return execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px)], {
    input: svg,
  })
}

function icns() {
  const workDir = mkdtempSync(join(tmpdir(), 'lootify-guard-icons-'))
  const iconset = join(workDir, 'icon.iconset')
  mkdirSync(iconset)
  for (const points of [16, 32, 128, 256, 512]) {
    const svg = tile(points, MACOS_INSET)
    writeFileSync(
      join(iconset, `icon_${points}x${points}.png`),
      render(svg, points),
    )
    writeFileSync(
      join(iconset, `icon_${points}x${points}@2x.png`),
      render(svg, points * 2),
    )
  }
  execFileSync('iconutil', [
    '-c',
    'icns',
    iconset,
    '-o',
    join(outDir, 'icon.icns'),
  ])
  rmSync(workDir, { recursive: true })
}

function ico() {
  const images = [16, 24, 32, 48, 64, 256].map((px) => ({
    px,
    png: render(tile(px, 0), px),
  }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length + images.length * 16
  const entries = images.map(({ px, png }) => {
    const entry = Buffer.alloc(16)
    // A one-byte dimension, so 256 is stored as 0.
    entry.writeUInt8(px % 256, 0)
    entry.writeUInt8(px % 256, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  const pngs = images.map(({ png }) => png)
  writeFileSync(
    join(outDir, 'icon.ico'),
    Buffer.concat([header, ...entries, ...pngs]),
  )
}

icns()
ico()
// Window and Dock icon while running `tauri dev`.
writeFileSync(join(outDir, 'icon.png'), render(tile(512, MACOS_INSET), 512))
