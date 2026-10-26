const { parseJsonc } = require('../pack/jsonc')
const { compareVersions } = require('../pack/versions')
const { geometryEntries, resolveGeometry, droppedFields } = require('./geometry')
const { materialDefinitions, resolveMaterial } = require('./materials')

function * layerFiles (stack, pattern, problems) {
  for (let layer = 0; layer < stack.layers.length; layer++) {
    const { name, files } = stack.layers[layer]
    for (const [path, read] of files) {
      if (!pattern.test(path)) continue
      let json
      try {
        json = parseJsonc(read().toString('utf8'))
      } catch (err) {
        problems.push(`${name}/${path}: ${err.message}`)
        continue
      }
      if (json && typeof json === 'object') yield { path, layer, json }
    }
  }
}

const engineVersion = description => description.min_engine_version ?? '0'

function mergeDescription (base, top) {
  const out = { ...base }
  for (const [key, value] of Object.entries(top)) {
    const prev = out[key]
    out[key] = prev && value && typeof prev === 'object' && typeof value === 'object' && !Array.isArray(prev) && !Array.isArray(value)
      ? { ...prev, ...value }
      : value
  }
  return out
}

function descriptions (stack, folder, key, problems) {
  const byFile = new Map()
  for (const { path, json } of layerFiles(stack, new RegExp(`^${folder}/.+\\.json$`), problems)) {
    const description = json[key]?.description
    if (description) byFile.set(path, mergeDescription(byFile.get(path) ?? {}, description))
  }
  const out = {}
  const files = {}
  for (const [path, description] of byFile) {
    const id = description.identifier
    if (!id) continue
    if (!out[id] || compareVersions(engineVersion(description), engineVersion(out[id])) > 0) {
      out[id] = description
      files[id] = path
    }
  }
  return { out, files }
}

function clientEntities (stack, problems) {
  const { out: entities, files } = descriptions(stack, 'entity', 'minecraft:client_entity', problems)
  return { entities, files }
}

function attachables (stack, problems) {
  const { out, files } = descriptions(stack, 'attachables', 'minecraft:attachable', problems)
  return { attachables: out, files }
}

function entityProperties (behavior, problems) {
  const out = {}
  if (!behavior) return out
  for (const { json } of layerFiles(behavior, /^entities\/.+\.json$/, problems)) {
    const description = json['minecraft:entity']?.description
    const id = description?.identifier
    if (!id) continue
    if (description.properties && Object.keys(description.properties).length) out[id] = description.properties
    else delete out[id]
  }
  return Object.fromEntries(Object.keys(out).sort().map(id => [id, out[id]]))
}

function geometryDefinitions (stack, problems) {
  const defs = new Map()
  const binds = new Map()
  const add = (id, def) => {
    for (const b of def.data.bones ?? []) {
      if (!b?.name) continue
      const key = id + '/' + b.name.toLowerCase()
      if (b.bind_pose_rotation) binds.set(key, b.bind_pose_rotation)
      else if (!def.legacy && !b.rotation && binds.has(key)) b.inheritedBind = binds.get(key)
    }
    const prev = defs.get(id)
    if (!prev || def.layer > prev.layer || (def.layer === prev.layer && prev.file.endsWith('mobs.json'))) defs.set(id, def)
  }
  for (const { path, layer, json: file } of layerFiles(stack, /^models\/.+\.json$/, problems)) {
    for (const { id, ...entry } of geometryEntries(file)) add(id, { ...entry, layer, file: path })
  }
  return defs
}

function entityTextures (...lists) {
  const paths = new Set()
  for (const list of lists) {
    for (const e of Object.values(list ?? {})) {
      for (const t of Object.values(e.textures ?? {})) if (typeof t === 'string' && t.startsWith('textures/')) paths.add(t)
    }
  }
  return paths
}

function exportEntities ({ version, stack, source, materialsTable = null }) {
  const problems = []
  const { entities, files } = clientEntities(stack, problems)
  if (!Object.keys(entities).length) return null
  const { attachables: worn, files: wornFiles } = attachables(stack, problems)

  const geometryDefs = geometryDefinitions(stack, problems)
  const geometry = {}
  for (const [id, def] of geometryDefs) {
    try {
      geometry[id] = resolveGeometry(id, geometryDefs)
    } catch (err) {
      problems.push(err.message)
      continue
    }
    for (const b of def.data.bones ?? []) {
      if (!b?.name) continue
      const same = geometry[id].bones.filter(o => o.name.toLowerCase() === b.name.toLowerCase())
      const losses = same.map(o => droppedFields(b, o))
      const lost = same.length ? losses.find(l => !l.length) ?? losses[0] : ['the bone']
      if (lost.length) problems.push(`${id} bone ${b.name}: ${lost.map(k => `${k} ${JSON.stringify(b[k.split('.')[0]])?.slice(0, 60)}`).join(', ')} dropped`)
    }
  }

  const renderControllers = {}
  const animations = {}
  const animationControllers = {}
  for (const { json } of layerFiles(stack, /^render_controllers\/.+\.json$/, problems)) Object.assign(renderControllers, json.render_controllers)
  for (const { json } of layerFiles(stack, /^animations\/.+\.json$/, problems)) Object.assign(animations, json.animations)
  for (const { json } of layerFiles(stack, /^animation_controllers\/.+\.json$/, problems)) Object.assign(animationControllers, json.animation_controllers)

  const materialDefs = materialDefinitions(stack, problems)
  const fromTable = !materialDefs.size && materialsTable
  const materials = {}
  for (const e of [...Object.values(entities), ...Object.values(worn)]) {
    for (const name of Object.values(e.materials ?? {})) {
      materials[name] ??= fromTable ? (materialsTable[name] ?? { defines: [], states: [] }) : resolveMaterial(name, materialDefs)
    }
  }

  const missing = { geometry: new Set(), render_controllers: new Set(), animations: new Set() }
  for (const e of [...Object.values(entities), ...Object.values(worn)]) {
    for (const g of Object.values(e.geometry ?? {})) if (!geometry[g]) missing.geometry.add(g)
    for (const rc of e.render_controllers ?? []) {
      const name = typeof rc === 'string' ? rc : Object.keys(rc)[0]
      if (!renderControllers[name]) missing.render_controllers.add(name)
    }
    for (const a of Object.values(e.animations ?? {})) {
      if (!animations[a] && !animationControllers[a]) missing.animations.add(a)
    }
  }

  const out = {
    version,
    source,
    entities,
    files,
    attachables: worn,
    attachable_files: wornFiles,
    geometry,
    render_controllers: renderControllers,
    animations,
    animation_controllers: animationControllers,
    materials,
    entity_properties: entityProperties(stack.behavior, problems),
    missing: Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, [...v].sort()])),
    problems
  }
  return { out, materialsFrom: fromTable ? 'data/entity_materials.json' : 'packs' }
}

module.exports = { exportEntities, clientEntities, attachables, entityProperties, geometryDefinitions, entityTextures, layerFiles }
