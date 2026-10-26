function flattenedName (flattening, name, props) {
  const entry = flattening[name]
  if (!entry) return null
  if (typeof entry === 'string') return entry
  return entry.map?.[props[entry.by]] ?? entry.default ?? null
}

const DEFAULTS = { shape: 'Block', layer: 'opaque', tint: 'none' }

function makeRenderOf ({ render, overrides, flattening }) {
  const patterns = (overrides.patterns ?? []).map(({ match, ...facts }) => ({ re: new RegExp(match), facts }))
  const overridesOf = name => {
    const out = {}
    for (const p of patterns) if (p.re.test(name)) Object.assign(out, p.facts)
    Object.assign(out, overrides.blocks?.[name] ?? {})
    return out
  }
  const cache = new Map()
  return (name, props = {}) => {
    const family = flattenedName(flattening, name, props)
    const key = family ? `${name}\u0000${family}` : name
    if (cache.has(key)) return cache.get(key)
    let facts = render.get(name)
    let source = 'client'
    if (!facts && family) { facts = render.get(family); source = `flattened:${family}` }
    const fixes = { ...(family ? overridesOf(family) : {}), ...overridesOf(name) }
    let out = facts ? { ...DEFAULTS, ...facts, source } : null
    if (Object.keys(fixes).length) out = { ...DEFAULTS, ...(out ?? { source: 'override' }), ...fixes, source: `${out?.source ?? 'override'}+override` }
    cache.set(key, out)
    return out
  }
}

module.exports = { makeRenderOf, flattenedName }
