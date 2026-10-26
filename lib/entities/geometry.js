const vec = (v, d = [0, 0, 0]) => Array.isArray(v) && v.length >= 3 ? v.slice(0, 3).map(Number) : d

const BONE_FIELDS = new Set(['name', 'parent', 'pivot', 'rotation', 'bind_pose_rotation', 'mirror', 'inflate', 'neverRender',
  'locators', 'cubes', 'poly_mesh', 'reset', 'inheritedBind'])
const CUBE_FIELDS = new Set(['origin', 'size', 'uv', 'pivot', 'rotation', 'inflate', 'mirror'])
const BONE_ORDER = ['name', 'parent', 'pivot', 'rotation', 'bind', 'mirror', 'inflate', 'neverRender', 'locators', 'cubes', 'poly_mesh']

const rest = (from, known) => Object.fromEntries(Object.entries(from).filter(([k]) => !known.has(k)))

function normalizeCube (c) {
  const cube = { origin: vec(c.origin), size: vec(c.size) }
  if (c.uv !== undefined) cube.uv = c.uv
  if (c.pivot) cube.pivot = vec(c.pivot)
  if (c.rotation) cube.rotation = vec(c.rotation)
  if (c.inflate !== undefined) cube.inflate = c.inflate
  if (c.mirror !== undefined) cube.mirror = c.mirror
  return { ...cube, ...rest(c, CUBE_FIELDS) }
}

function normalizeBone (b) {
  const bone = { name: b.name }
  if (b.parent) bone.parent = b.parent
  bone.pivot = vec(b.pivot)
  if (b.rotation && b.rotation.some(Number)) bone.rotation = vec(b.rotation)
  const bind = b.bind_pose_rotation ?? b.inheritedBind
  if (bind && bind.some(Number)) bone.bind = vec(bind)
  if (b.mirror !== undefined) bone.mirror = b.mirror
  if (b.inflate !== undefined) bone.inflate = b.inflate
  if (b.neverRender) bone.neverRender = true
  if (b.locators) bone.locators = b.locators
  if (b.cubes?.length) bone.cubes = b.cubes.map(normalizeCube)
  const mesh = b.poly_mesh
  if (mesh?.positions?.length && mesh.polys) {
    const { positions, normals, uvs, polys, normalized_uvs: n, ...more } = mesh
    bone.poly_mesh = { positions, normals: normals ?? [], uvs: uvs ?? [], polys, normalized_uvs: !!n, ...more }
  }
  return { ...bone, ...rest(b, BONE_FIELDS) }
}

function droppedFields (source, bone) {
  const lost = []
  for (const [k, v] of Object.entries(source)) {
    if (k === 'reset' || k === 'inheritedBind' || v === undefined || v === null || (k === 'parent' && v === '')) continue
    if (k === 'bind_pose_rotation') { if (v.some?.(Number) && !bone.bind) lost.push(k); continue }
    if (k === 'rotation') { if (v.some?.(Number) && !bone.rotation) lost.push(k); continue }
    if (k === 'neverRender') { if (v && !bone.neverRender) lost.push(k); continue }
    if (k === 'cubes') {
      if (v.length && bone.cubes?.length !== v.length) lost.push(k)
      else v.forEach((c, i) => { for (const ck of Object.keys(c)) if (!(ck in bone.cubes[i])) lost.push('cubes.' + ck) })
      continue
    }
    if (k === 'poly_mesh') { if (v?.positions?.length && v.polys && !bone.poly_mesh) lost.push(k); continue }
    if (!(k in bone)) lost.push(k)
  }
  return [...new Set(lost)]
}

function mergeBone (inherited, b) {
  const own = normalizeBone(b)
  const bone = { ...inherited, name: b.name }
  if (b.parent !== undefined) bone.parent = b.parent
  if (b.pivot !== undefined) bone.pivot = own.pivot
  if (b.rotation !== undefined) {
    if (own.rotation) bone.rotation = own.rotation
    else delete bone.rotation
  }
  const bind = b.bind_pose_rotation ?? b.inheritedBind
  if (bind !== undefined) {
    if (own.bind) bone.bind = own.bind
    else delete bone.bind
  }
  for (const key of ['mirror', 'inflate', 'locators']) if (b[key] !== undefined) bone[key] = b[key]
  if (b.neverRender !== undefined) {
    if (b.neverRender) bone.neverRender = true
    else delete bone.neverRender
  }
  if (b.cubes !== undefined || b.reset) {
    if (own.cubes) bone.cubes = own.cubes
    else delete bone.cubes
  }
  if (b.poly_mesh !== undefined || b.reset) {
    if (own.poly_mesh) bone.poly_mesh = own.poly_mesh
    else delete bone.poly_mesh
  }
  Object.assign(bone, rest(b, BONE_FIELDS))
  return Object.fromEntries([...BONE_ORDER.filter(k => k in bone), ...Object.keys(bone).filter(k => !BONE_ORDER.includes(k))].map(k => [k, bone[k]]))
}

function geometryEntries (file) {
  const entries = []
  if (!file || typeof file !== 'object') return entries
  for (const data of [file['minecraft:geometry']].flat().filter(Boolean)) {
    const id = data.description?.identifier
    if (id) entries.push({ id, data, legacy: false })
  }
  for (const [key, data] of Object.entries(file)) {
    if (!key.startsWith('geometry.') || !data || typeof data !== 'object') continue
    const [id, parent] = key.split(':')
    entries.push({ id, parent, data, legacy: true })
  }
  return entries
}

function resolveGeometry (id, defs, external = () => null, seen = new Set()) {
  const def = defs.get(id)
  if (!def) return external(id)
  if (seen.has(id)) throw new Error(`geometry ${id} inherits from itself`)
  seen.add(id)
  const d = def.data
  const raw = (d.bones ?? []).filter(b => b?.name)
  let bones = raw.map(b => normalizeBone(b))
  let base = {}
  if (def.parent) {
    const parent = resolveGeometry(def.parent, defs, external, seen)
    if (!parent) throw new Error(`geometry ${id}: no parent ${def.parent}`)
    base = parent
    const byName = new Map(raw.map(b => [b.name.toLowerCase(), b]))
    bones = parent.bones.map(b => {
      const child = byName.get(b.name.toLowerCase())
      return child ? mergeBone(b, child) : b
    })
    const inherited = new Set(parent.bones.map(b => b.name.toLowerCase()))
    bones.push(...raw.filter(b => !inherited.has(b.name.toLowerCase())).map(b => normalizeBone(b)))
  }
  const description = def.legacy ? d : (d.description ?? {})
  const pick = (a, b) => description[a] ?? description[b] ?? base[a]
  const geometry = {
    texture_width: pick('texture_width', 'texturewidth') ?? 64,
    texture_height: pick('texture_height', 'textureheight') ?? 64
  }
  for (const key of ['visible_bounds_width', 'visible_bounds_height', 'visible_bounds_offset']) {
    const v = description[key] ?? base[key]
    if (v !== undefined) geometry[key] = v
  }
  geometry.bones = bones
  return geometry
}

module.exports = { vec, normalizeCube, normalizeBone, mergeBone, droppedFields, geometryEntries, resolveGeometry }
