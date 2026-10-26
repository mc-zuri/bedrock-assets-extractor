const FACES = ['down', 'up', 'north', 'south', 'west', 'east']

function terrainTexture (entry, data = 0) {
  if (!entry) return null
  let t = entry.textures
  if (Array.isArray(t)) t = t[data] ?? t[0]
  if (t && typeof t === 'object' && Array.isArray(t.variations)) t = t.variations[0]
  if (typeof t === 'string') return { path: t }
  if (t && typeof t === 'object' && typeof t.path === 'string') {
    const out = { path: t.path }
    if (t.overlay_color) out.overlay_color = t.overlay_color.toLowerCase()
    if (t.tint_color) out.tint_color = t.tint_color.toLowerCase()
    return out
  }
  return null
}

function terrainPath (entry, data = 0) {
  return terrainTexture(entry, data)?.path ?? null
}

function faceKeys (textures) {
  if (!textures) return null
  if (typeof textures === 'string') return Object.fromEntries(FACES.map(f => [f, textures]))
  const side = textures.side
  const keys = {}
  for (const f of FACES) {
    keys[f] = textures[f] ?? (f === 'up' || f === 'down' ? side ?? textures.up ?? textures.down : side)
  }
  for (const f of FACES) keys[f] ??= Object.values(textures).find(v => typeof v === 'string')
  return keys
}

const HARDCODED = {
  iron_chain: { key: 'chain' },
  mangrove_propagule_hanging: { key: 'mangrove_propagule' },
  shelf_mushroom: { by: 'growth', terrainKeys: ['shelf_mushroom_small', 'shelf_mushroom_large'] },
  end_portal: { fallback: 'textures/environment/end_sky' },
  end_gateway: { fallback: 'textures/environment/end_sky' },
  piston_arm_collision: { path: 'textures/blocks/piston_inner' },
  sticky_piston_arm_collision: { path: 'textures/blocks/piston_inner' },
  lever: { terrain: { down: 'lever', up: 'lever', north: 'lever', south: 'lever', west: 'lever', east: 'lever_particle' } },
  unpowered_repeater: { index: 0 },
  powered_repeater: { index: 1 },
  unpowered_comparator: { index: 0 },
  powered_comparator: { index: 1 },
  barrel: { indexBy: 'open_bit' },
  pointed_dripstone: { indexBy: 'hanging', order: ['1', '0'] }
}

function pickedIndex (hard, props) {
  const value = props[hard.indexBy] ?? 0
  if (!hard.order) return +value
  return Math.max(0, hard.order.indexOf({ true: '1', false: '0' }[value] ?? String(value)))
}

class TextureResolver {
  constructor (stack, { aliases = {}, legacyKeys = new Map() } = {}) {
    this.stack = stack
    this.blocks = stack.blocks()
    this.terrain = stack.textureData('textures/terrain_texture.json')
    this.legacy = new Map()
    for (const [legacy, names] of Object.entries(aliases ?? {})) {
      names.forEach((name, data) => {
        const n = name.replace(/^minecraft:/, '')
        if (!this.legacy.has(n)) this.legacy.set(n, { legacy: legacy.replace(/^minecraft:/, ''), data })
      })
    }
    this.legacyKeys = legacyKeys
  }

  candidates (name) {
    const out = [{ key: name }]
    const legacy = this.legacy.get(name)
    if (legacy) out.push({ key: legacy.legacy, data: legacy.data })
    return out
  }

  texturePick (name) {
    return HARDCODED[name]?.indexBy ?? HARDCODED[name]?.by ?? null
  }

  fromBlock (key, data) {
    const keys = faceKeys(this.blocks[key]?.textures)
    if (!keys) return null
    const faces = {}
    for (const f of FACES) faces[f] = terrainPath(this.terrain[keys[f]], data)
    return FACES.every(f => faces[f]) ? faces : null
  }

  resolve (name, data = 0, props = {}) {
    const hard = HARDCODED[name]
    data = hard?.index ?? (hard?.indexBy ? pickedIndex(hard, props) : data)
    if (hard?.terrainKeys) {
      const path = terrainPath(this.terrain[hard.terrainKeys[+props[hard.by]] ?? hard.terrainKeys[0]], 0)
      if (path) return { faces: Object.fromEntries(FACES.map(f => [f, path])), source: 'hardcoded' }
    }
    if (hard?.path && this.stack.resolveTexture(hard.path)) {
      return { faces: Object.fromEntries(FACES.map(f => [f, hard.path])), source: 'hardcoded' }
    }
    if (hard?.terrain) {
      const faces = Object.fromEntries(FACES.map(f => [f, terrainPath(this.terrain[hard.terrain[f]], 0)]))
      if (FACES.every(f => faces[f])) return { faces, source: 'hardcoded' }
    }
    const candidates = this.candidates(name)
    if (hard?.key) candidates.splice(1, 0, { key: hard.key })
    for (const { key, data: legacyData } of candidates) {
      const faces = this.fromBlock(key, legacyData ?? data)
      if (faces) return { faces, source: `blocks.json:${key}`, key, data: legacyData ?? data }
    }
    const own = terrainPath(this.terrain[name], data)
    if (own) return { faces: Object.fromEntries(FACES.map(f => [f, own])), source: `terrain:${name}` }
    for (const legacyKey of this.legacyKeys.get(name) ?? []) {
      if (legacyKey === name) continue
      const faces = this.fromBlock(legacyKey, data)
      if (faces) return { faces, source: `blocks.json:${legacyKey}`, key: legacyKey, data }
      candidates.push({ key: legacyKey })
    }
    for (const { key, data: legacyData } of candidates.slice(1)) {
      const path = terrainPath(this.terrain[key], legacyData ?? data)
      if (path) return { faces: Object.fromEntries(FACES.map(f => [f, path])), source: `terrain:${key}` }
    }
    if (hard?.fallback && this.stack.resolveTexture(hard.fallback)) {
      return { faces: Object.fromEntries(FACES.map(f => [f, hard.fallback])), source: 'hardcoded' }
    }
    const missing = terrainPath(this.terrain.missing_tile)
    if (missing) return { faces: Object.fromEntries(FACES.map(f => [f, missing])), source: 'missing_tile' }
    return null
  }

  carried (resolved) {
    if (!resolved?.key) return null
    const block = this.blocks[resolved.key]
    const t = block?.carried_textures
    const carriedKey = typeof t === 'string' ? t : t?.side
    if (!carriedKey || !/carried/i.test(carriedKey)) return null
    const frames = key => [this.terrain[key]?.textures].flat().length
    const own = Math.max(0, ...[...new Set(Object.values(faceKeys(block.textures) ?? {}))].map(frames))
    if (frames(carriedKey) > 1 && frames(carriedKey) < own) return null
    return terrainTexture(this.terrain[carriedKey], resolved.data ?? 0)
  }
}

module.exports = { TextureResolver, terrainPath, terrainTexture, faceKeys, FACES, HARDCODED }
