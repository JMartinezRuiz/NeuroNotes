import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const buildDir = path.join(root, 'build')
const sizes = [16, 24, 32, 48, 64, 128, 256]

const svg = `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="16" y="16" width="224" height="224" rx="48" fill="#211F1A"/>
  <path d="M54 188V68L202 188V68" stroke="#F7F5EF" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M54 188V68L202 188V68" stroke="#1F7A64" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="54" cy="68" r="16" fill="#F7F5EF"/>
  <circle cx="202" cy="188" r="16" fill="#F7F5EF"/>
  <circle cx="54" cy="188" r="12" fill="#1F7A64"/>
  <circle cx="202" cy="68" r="12" fill="#1F7A64"/>
</svg>
`

const bgA = [33, 31, 26]
const bgB = [31, 122, 100]
const paper = [247, 245, 239]
const accent = [31, 122, 100]

function mix(a, b, t) {
  return a.map((value, index) => Math.round(value * (1 - t) + b[index] * t))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function roundedRectAlpha(x, y, radius) {
  const px = Math.abs(x - 0.5) - 0.5 + radius
  const py = Math.abs(y - 0.5) - 0.5 + radius
  const outsideX = Math.max(px, 0)
  const outsideY = Math.max(py, 0)
  const distance = Math.hypot(outsideX, outsideY) + Math.min(Math.max(px, py), 0) - radius
  return 1 - smoothstep(0, 0.012, distance)
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const len = vx * vx + vy * vy
  const t = len === 0 ? 0 : clamp((wx * vx + wy * vy) / len, 0, 1)
  const cx = ax + vx * t
  const cy = ay + vy * t
  return Math.hypot(px - cx, py - cy)
}

function strokeAlpha(x, y, width, points) {
  let distance = Infinity
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]
    const b = points[index + 1]
    distance = Math.min(distance, distanceToSegment(x, y, a[0], a[1], b[0], b[1]))
  }

  return 1 - smoothstep(width, width + 0.012, distance)
}

function circleAlpha(x, y, cx, cy, radius) {
  const distance = Math.hypot(x - cx, y - cy)
  return 1 - smoothstep(radius, radius + 0.012, distance)
}

function over(base, layer, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + layer[0] * alpha),
    Math.round(base[1] * (1 - alpha) + layer[1] * alpha),
    Math.round(base[2] * (1 - alpha) + layer[2] * alpha)
  ]
}

function samplePixel(x, y) {
  const bgAlpha = roundedRectAlpha(x, y, 0.19)
  const gradient = mix(bgA, bgB, clamp((x + y) / 1.8, 0, 1))
  let color = gradient

  const points = [
    [0.21, 0.73],
    [0.21, 0.27],
    [0.79, 0.73],
    [0.79, 0.27]
  ]
  color = over(color, paper, strokeAlpha(x, y, 0.048, points))
  color = over(color, accent, strokeAlpha(x, y, 0.021, points))
  color = over(color, paper, circleAlpha(x, y, 0.21, 0.27, 0.063))
  color = over(color, paper, circleAlpha(x, y, 0.79, 0.73, 0.063))
  color = over(color, accent, circleAlpha(x, y, 0.21, 0.73, 0.047))
  color = over(color, accent, circleAlpha(x, y, 0.79, 0.27, 0.047))

  return { color, alpha: bgAlpha }
}

function render(size) {
  const scale = 3
  const pixels = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const px = (x + (sx + 0.5) / scale) / size
          const py = (y + (sy + 0.5) / scale) / size
          const sample = samplePixel(px, py)
          r += sample.color[0]
          g += sample.color[1]
          b += sample.color[2]
          a += sample.alpha
        }
      }

      const samples = scale * scale
      const offset = ((size - 1 - y) * size + x) * 4
      const alpha = Math.round((a / samples) * 255)
      pixels[offset] = Math.round(b / samples)
      pixels[offset + 1] = Math.round(g / samples)
      pixels[offset + 2] = Math.round(r / samples)
      pixels[offset + 3] = alpha
    }
  }

  return pixels
}

function createIconImage(size) {
  const pixels = render(size)
  const maskStride = Math.ceil(size / 32) * 4
  const mask = Buffer.alloc(maskStride * size)
  const header = Buffer.alloc(40)

  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(pixels.length + mask.length, 20)

  return Buffer.concat([header, pixels, mask])
}

function createIco() {
  const images = sizes.map((size) => ({ size, data: createIconImage(size) }))
  const header = Buffer.alloc(6)
  const entries = Buffer.alloc(images.length * 16)
  let offset = header.length + entries.length

  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  images.forEach((image, index) => {
    const entryOffset = index * 16
    entries[entryOffset] = image.size === 256 ? 0 : image.size
    entries[entryOffset + 1] = image.size === 256 ? 0 : image.size
    entries[entryOffset + 2] = 0
    entries[entryOffset + 3] = 0
    entries.writeUInt16LE(1, entryOffset + 4)
    entries.writeUInt16LE(32, entryOffset + 6)
    entries.writeUInt32LE(image.data.length, entryOffset + 8)
    entries.writeUInt32LE(offset, entryOffset + 12)
    offset += image.data.length
  })

  return Buffer.concat([header, entries, ...images.map((image) => image.data)])
}

await mkdir(buildDir, { recursive: true })
await writeFile(path.join(buildDir, 'icon.svg'), svg, 'utf8')
await writeFile(path.join(buildDir, 'icon.ico'), createIco())

console.log('Generated build/icon.svg and build/icon.ico')
