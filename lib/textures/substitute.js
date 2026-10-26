const TABLE = {
  'textures/blocks/trial_spawner_base': ['textures/blocks/trial_spawner_side']
}

function candidates (path) {
  const m = /^textures\/items\/potion_bottle_lingering_(.+)$/.exec(path)
  if (m) return [`textures/items/potion_bottle_splash_${m[1]}`, `textures/items/potion_bottle_${m[1]}`, 'textures/items/potion_bottle_lingering']
  const item = /^textures\/item\/(.+)$/.exec(path)
  if (item) return ['textures/items/' + item[1]]
  return TABLE[path] ?? []
}

function nearest (path, stems) {
  const dir = path.slice(0, path.lastIndexOf('/') + 1)
  const base = path.slice(dir.length)
  let best = null
  for (const stem of stems) {
    if (!stem.startsWith(dir) || stem.slice(dir.length).includes('/')) continue
    const other = stem.slice(dir.length)
    let n = 0
    while (n < base.length && n < other.length && base[n] === other[n]) n++
    if (n < 4) continue
    if (!best || n > best.n || (n === best.n && (other.length < best.other.length || (other.length === best.other.length && other < best.other)))) best = { stem, other, n }
  }
  return best?.stem ?? null
}

function substituteFor (path, has, stems) {
  for (const c of candidates(path)) if (has(c)) return c
  return nearest(path, stems)
}

module.exports = { substituteFor, nearest }
