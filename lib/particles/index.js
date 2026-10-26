const { parseJsonc } = require('../pack/jsonc')
const { isCompiled, compiledIdentifier, matchesCompiled } = require('./compiled')

const FILES = /^particles\/.+\.json$/
const ATLASES = new Set(['atlas.terrain', 'atlas.items'])

function effectOf (json) {
  const effect = json?.particle_effect
  if (!effect || typeof effect !== 'object') return null
  return json.format_version !== undefined ? { format_version: json.format_version, ...effect } : { ...effect }
}

function exportParticles ({ stack, textures, compiledText = null }) {
  const problems = []
  const byId = new Map()
  let files = 0
  for (const { name, files: layerFiles } of stack.layers) {
    for (const [path, read] of layerFiles) {
      if (!FILES.test(path)) continue
      files++
      const buf = read()
      if (isCompiled(buf)) {
        const id = compiledIdentifier(buf)
        if (id) byId.set(id, { compiled: buf, path })
        else problems.push(`${name}/${path}: a compiled file with no identifier`)
        continue
      }
      let json
      try {
        json = parseJsonc(buf.toString('utf8'))
      } catch (err) {
        problems.push(`${name}/${path}: ${err.message}`)
        continue
      }
      const effect = effectOf(json)
      const id = effect?.description?.identifier
      if (id) byId.set(id, { effect, path })
      else problems.push(`${name}/${path}: no particle_effect identifier`)
    }
  }
  if (!files) return null
  const compiled = { count: 0, from: null, unmatched: {} }
  let texts
  const textOf = id => (texts === undefined ? (texts = compiledText?.() ?? null) : texts)?.get(id)
  const particles = {}
  const sources = {}
  for (const id of [...byId.keys()].sort()) {
    const entry = byId.get(id)
    if (entry.compiled) {
      compiled.count++
      const text = textOf(id)
      if (!text) { compiled.unmatched[id] = 'no text of it'; continue }
      const { format_version: _, ...effect } = text.effect
      const diffs = matchesCompiled(entry.compiled, effect)
      if (diffs.length) { compiled.unmatched[id] = diffs.slice(0, 5).join('; '); continue }
      compiled.from = text.source
      particles[id] = text.effect
    } else {
      particles[id] = entry.effect
    }
    sources[id] = entry.path
  }
  const missing = new Set()
  const atlases = new Set()
  for (const effect of Object.values(particles)) {
    const texture = effect.description?.basic_render_parameters?.texture
    if (typeof texture !== 'string') continue
    if (ATLASES.has(texture)) { atlases.add(texture); continue }
    const ref = textures.ref(texture)
    if (!ref || !textures.isPng(ref)) missing.add(texture)
  }
  return {
    out: { format_version: 1, particles, files: sources, missing: [...missing].sort() },
    counts: { files, particles: Object.keys(particles).length, compiled: compiled.count, atlases: [...atlases].sort() },
    compiled,
    problems
  }
}

function textEffects (files, source) {
  const out = new Map()
  for (const [path, text] of files) {
    let json
    try { json = parseJsonc(text) } catch { continue }
    const effect = effectOf(json)
    const id = effect?.description?.identifier
    if (id) out.set(id, { effect, source, path })
  }
  return out
}

module.exports = { exportParticles, textEffects, effectOf, ATLASES }
