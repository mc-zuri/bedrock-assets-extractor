const { decodePng, encodePng } = require('./png')

const entriesOf = terrain => Object.values(terrain ?? {}).flatMap(entry => [entry?.textures].flat())

function overlayTextures (terrain) {
  const paths = new Set()
  for (const t of entriesOf(terrain)) if (t && typeof t === 'object' && t.overlay_color && t.path) paths.add(t.path)
  return paths
}

function constantTints (terrain) {
  const tints = new Map()
  for (const t of entriesOf(terrain)) if (t && typeof t === 'object' && t.tint_color && t.path) tints.set(t.path, t.tint_color.toLowerCase())
  return tints
}

function splitOverlay (png) {
  const { width, height, rgba } = decodePng(png)
  const base = Buffer.from(rgba)
  const overlay = Buffer.from(rgba)
  for (let i = 3; i < rgba.length; i += 4) {
    base[i] = 255
    overlay[i] = rgba[i] > 127 ? 255 : 0
  }
  return { base: encodePng({ width, height, rgba: base }), overlay: encodePng({ width, height, rgba: overlay }) }
}

module.exports = { overlayTextures, constantTints, splitOverlay }
