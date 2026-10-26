const { TextureResolver, FACES } = require('./resolve')
const { legacyData } = require('./layouts')
const { makeRenderOf } = require('./render')
const { canonicalFaces, doorWood, drawnFaces } = require('./faces')
const { propsOf, stateKey } = require('./states')
const { generate } = require('./geometry')
const { geometryIndex, LID_STEPS } = require('./geometry/entity')
const { buildBlockState } = require('./blockstate')
const { sample, redstoneTable, stemTable, hexColor, COLORMAPS } = require('./tints')
const { overlayTextures, constantTints } = require('../image/overlay')
const { isChemistry } = require('../chemistry')

const MODEL = 'minecraft:block/'
const MISSING = 'missing_texture'

function viewerTint (name) {
  if (name === 'redstone_wire') return null
  if (name === 'birch_leaves') return 'birch'
  if (name === 'spruce_leaves') return 'evergreen'
  if (name.includes('leaves') || name === 'vine') return 'foliage'
  return 'grass'
}

class ModelStore {
  constructor () {
    this.models = {}
    this.byContent = new Map()
    this.geometries = new Map()
    this.counts = new Map()
  }

  add (name, { elements, textures, ao }) {
    const geometry = JSON.stringify({ elements, ao })
    let parent = this.geometries.get(geometry)
    if (!parent) {
      parent = this.geometries.size === 0 && isCube(elements) ? 'cube' : `geometry_${this.geometries.size}`
      if (this.models[parent]) parent = `geometry_${this.geometries.size}`
      this.models[parent] = { elements }
      if (ao === false) this.models[parent].ambientocclusion = false
      this.geometries.set(geometry, parent)
    }
    const child = { parent: MODEL + parent, textures: Object.fromEntries(Object.entries(textures).map(([k, v]) => [k, v.startsWith('#') ? v : MODEL + v])) }
    const key = JSON.stringify(child)
    if (this.byContent.has(key)) return this.byContent.get(key)
    const n = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, n)
    let out = n === 1 ? name : `${name}_${n}`
    while (this.models[out]) out += '_'
    this.models[out] = child
    this.byContent.set(key, out)
    return out
  }
}

const isCube = elements => elements.length === 1 && elements[0].from.every(v => v === 0) && elements[0].to.every(v => v === 16)

function addOverlays (m, overlayOf) {
  const extra = []
  for (const el of m.elements) {
    const faces = {}
    for (const [dir, face] of Object.entries(el.faces)) {
      const overlay = overlayOf(m.textures[face.texture.slice(1)])
      if (!overlay) continue
      delete face.tintindex
      const v = 'overlay_' + dir
      m.textures[v] = overlay
      faces[dir] = { ...face, texture: '#' + v, tintindex: 0 }
    }
    if (Object.keys(faces).length) extra.push({ ...el, faces })
  }
  m.elements.push(...extra)
}

function statesOf (mcData, layouts) {
  const states = mcData.blockStates.map((s, index) => ({ name: s.name, props: propsOf(s), index }))
  const data = legacyData(states, layouts)
  const permutation = new Map()
  const boxesOf = (file, s) => {
    const ids = file?.blocks?.[s.name]
    const id = Array.isArray(ids) ? ids[s.permutation] : ids
    return id === undefined ? null : (file.shapes[id] ?? [])
  }
  states.forEach((s, i) => {
    s.data = data[i]
    s.permutation = permutation.get(s.name) ?? 0
    permutation.set(s.name, s.permutation + 1)
    s.collision = boxesOf(mcData.blockCollisionShapes, s)
    s.outline = boxesOf(mcData.blockSelectionShapes, s)?.[0] ?? null
  })
  return states
}

function legacyStatesOf (mcData, legacyBlocks, reference, layouts) {
  const known = new Map(statesOf(reference, layouts).map(s => [s.name + '[' + stateKey(s.props) + ']', s]))
  const states = []
  for (const block of mcData.blocksArray) {
    for (let data = 0; data < 16; data++) {
      const entry = legacyBlocks[`${block.id}:${data}`]
      if (!entry && data > 0) continue
      const m = entry ? /^(?:minecraft:)?([^[]+)(?:\[(.*)\])?$/.exec(entry) : null
      const name = m ? m[1] : block.name
      const props = Object.fromEntries((m?.[2] ? m[2].split(',') : []).map(p => p.split('=')))
      const same = known.get(name + '[' + stateKey(props) + ']')
      states.push({ name, blockName: block.name, props, data, index: (block.id << 4) | data, collision: same?.collision ?? null, outline: same?.outline ?? null })
      if (/door$/.test(name) && props.door_hinge_bit === '0') states.push({ ...states[states.length - 1], props: { ...props, door_hinge_bit: '1' } })
    }
  }
  return states
}

const CONNECTED = new Set(['Fence', 'DoubleSideFence', 'MetalBars'])
const SIDES = ['north', 'east', 'south', 'west']
const CORNERS = ['none', 'inner_left', 'inner_right', 'outer_left', 'outer_right']
const DUST = ['none', 'side', 'up']

function withNeighbourStates (list, stairBoxes) {
  const out = []
  for (const s of list) {
    const shape = s.render?.shape
    if (CONNECTED.has(shape) && !('minecraft:connection_north' in s.props)) {
      for (let mask = 0; mask < 16; mask++) {
        const props = { ...s.props }
        SIDES.forEach((side, i) => { props['minecraft:connection_' + side] = mask & (1 << i) ? '1' : '0' })
        out.push({ ...s, props })
      }
    } else if (shape === 'RedDust' && !('minecraft:connection_north' in s.props)) {
      for (let n = 0; n < DUST.length ** SIDES.length; n++) {
        const props = { ...s.props }
        SIDES.forEach((side, i) => { props['minecraft:connection_' + side] = DUST[Math.floor(n / DUST.length ** i) % DUST.length] })
        out.push({ ...s, props })
      }
    } else if (shape === 'Stairs' && !('minecraft:corner' in s.props) && 'weirdo_direction' in s.props && stairBoxes.size) {
      for (const corner of CORNERS) {
        const boxes = stairBoxes.get(`${s.props.weirdo_direction},${s.props.upside_down_bit},${corner}`)
        if (corner === 'none' || boxes) out.push({ ...s, props: { ...s.props, 'minecraft:corner': corner }, collision: corner === 'none' ? s.collision : boxes })
      }
    } else {
      out.push(s)
    }
  }
  return out
}

const ROTATIONS = [...Array(16).keys()].map(i => i * 22.5).concat([...Array(15).keys()].map(i => (i + 1) * 22.5 - 360))
const BLOCK_ENTITY_DATA = [
  [s => s.render?.shape === 'Bed', { 'block_entity.color': [14, ...Array(14).keys(), 15] }],
  [s => s.render?.shape === 'Skull' && s.name === 'skull', { 'block_entity.SkullType': [...Array(7).keys()] }],
  [s => s.render?.shape === 'Skull', { 'block_entity.Rotation': ROTATIONS }],
  [s => s.render?.shape === 'Chest' && !/ender/.test(s.name), { 'block_entity.pair': ['none', 'north', 'east', 'south', 'west'] }],
  [s => s.render?.shape === 'Chest', { 'block_entity.lid': [...Array(LID_STEPS + 1).keys()] }],
  [s => s.render?.shape === 'ShulkerBox', { 'block_entity.facing': [1, 0, 2, 3, 4, 5], 'block_entity.lid': [...Array(LID_STEPS + 1).keys()] }],
  [s => s.render?.shape === 'Piston', { 'block_entity.Progress': [0, 0.5, 1] }]
]

function withBlockEntityStates (list) {
  const out = []
  for (const s of list) {
    let combos = [{}]
    for (const [applies, values] of BLOCK_ENTITY_DATA) {
      if (!applies(s)) continue
      for (const [tag, options] of Object.entries(values)) combos = combos.flatMap(c => options.map(v => ({ ...c, [tag]: String(v) })))
    }
    if (combos.length === 1) { out.push(s); continue }
    combos.forEach((c, i) => out.push({ ...s, props: { ...s.props, ...c }, blockEntityDefault: i === 0 }))
  }
  return out
}

function stairBoxesOf (mcData) {
  const boxes = new Map()
  if (!mcData?.blockStates) return boxes
  for (const s of statesOf(mcData, new Map())) {
    if (s.name !== 'oak_stairs' || !('minecraft:corner' in s.props)) continue
    boxes.set(`${s.props.weirdo_direction},${s.props.upside_down_bit},${s.props['minecraft:corner']}`, s.collision)
  }
  return boxes
}

function exportBlocks ({ stack, mcData, store, tables, legacy, newest }) {
  const states = (mcData.blockStates ? statesOf(mcData, tables.layouts) : legacyStatesOf(mcData, legacy.blocks, legacy.reference, tables.layouts))
    .filter(s => !isChemistry(s.blockName ?? s.name))
  const resolver = new TextureResolver(stack, { legacyKeys: tables.legacyKeys })
  const renderOf = makeRenderOf(tables)
  const hasPackTexture = p => !!stack.resolveTexture(p)

  const colormap = name => store.imageOf(store.ref(`textures/colormap/${name}`)) ?? null
  const plains = method => {
    if (method === 'water') return hexColor(stack.biomesClient().biomes.default?.water_surface_color ?? '#44aff5')
    const map = colormap(COLORMAPS[method === 'dry' ? 'dry' : method] ?? 'grass')
    return sample(map, 0.8, 0.4) ?? 0x79c05a
  }
  const redstone = redstoneTable()
  const stems = stemTable()
  const tintColor = (method, props) => {
    if (method.startsWith('#')) return hexColor(method)
    if (method === 'redstone') return redstone.data[+(props.redstone_signal ?? 0)]?.color ?? redstone.default
    if (method === 'stem') return stems.data[+(props.growth ?? 7)]?.color ?? stems.default
    return plains(method)
  }

  const overlays = new Set([...overlayTextures(resolver.terrain)].map(p => store.ref(p)).filter(Boolean))
  const fixedTints = new Map([...constantTints(resolver.terrain)].map(([p, color]) => [store.ref(p), color]))
  const overlayOf = name => overlays.has(name) ? store.splitOverlay(name)[1] : null

  const byName = new Map()
  const baseFaces = new Map()
  const report = { missingTile: new Set(), unrendered: new Set(), failed: [], shapes: {} }
  for (const s of states) {
    const resolved = resolver.resolve(s.name, s.data, s.props)
    s.resolved = resolved
    s.packFaces = resolved ? FACES.map(f => resolved.faces[f]) : null
    s.render = renderOf(s.name, s.props)
    if (!s.render) report.unrendered.add(s.name)
    const key = s.blockName ?? s.name
    if (!byName.has(key)) {
      byName.set(key, [])
      if (s.packFaces) baseFaces.set(key, s.packFaces)
    }
    byName.get(key).push(s)
  }
  for (const [name, list] of byName) {
    const shape = list[0].render?.shape
    const canon = canonicalFaces(list.map(s => ({ ...s, faces: s.packFaces })), shape, baseFaces.get(name), resolver.texturePick(list[0].name))
    const keyed = [...canon.values()]
    list.forEach((s, i) => {
      let faces = keyed.length === list.length ? keyed[i] : s.packFaces
      if (shape === 'Door') faces = doorWood(s.name, faces, hasPackTexture)
      s.faces = s.render && faces ? drawnFaces(s, shape, faces, hasPackTexture) : faces
    })
  }

  const models = new ModelStore()
  const blocksStates = {}
  const blocksTextures = []
  const missingTextures = new Set()
  const refOf = p => {
    const ref = store.ref(p)
    if (!ref) missingTextures.add(p)
    return ref ?? MISSING
  }

  const stairBoxes = stairBoxesOf(newest)
  const geometries = geometryIndex(stack)
  const clientEntities = new Map()
  for (const path of stack.files.keys()) {
    if (!/^entity\/.+\.json$/.test(path)) continue
    try {
      const d = stack.json(path)?.['minecraft:client_entity']?.description
      if (d?.identifier && !clientEntities.has(d.identifier)) clientEntities.set(d.identifier, d)
    } catch { }
  }
  for (const [name, list] of byName) {
    const entries = []
    let defaultModel = null
    let defaultTexture = null
    for (const s of withBlockEntityStates(withNeighbourStates(list, stairBoxes))) {
      const shape = s.render?.shape ?? null
      report.shapes[shape ?? 'unknown'] = (report.shapes[shape ?? 'unknown'] ?? 0) + 1
      const faces = s.faces?.map(refOf) ?? null
      if (!faces) { entries.push({ props: s.props, parts: [] }); continue }
      let method = s.render?.tint && s.render.tint !== 'none' ? s.render.tint : null
      const fixed = faces.map(f => fixedTints.get(f)).find(Boolean)
      if (fixed) method = fixed
      const tintable = t => !!method && t !== MISSING && store.isGrey(t)
      const ctx = {
        shape,
        faces,
        tintFaces: method ? Object.fromEntries(FACES.map((d, i) => [d, tintable(faces[i])])) : false,
        tintTexture: tintable,
        tessellator: tables.tessellator,
        ref: p => store.ref(p),
        geometry: id => geometries.get(id) ?? null,
        clientEntity: id => clientEntities.get(id) ?? null
      }
      let model
      try {
        model = generate(s, ctx)
      } catch (err) {
        report.failed.push(`${name} ${JSON.stringify(s.props)} (${shape}): ${err.message}`)
        model = null
      }
      if (!model) { entries.push({ props: s.props, parts: [] }); continue }
      if (s.resolved?.source === 'missing_tile' && s.name !== 'unknown') report.missingTile.add(name)
      const parts = (model.parts ?? [model]).map(m => {
        addOverlays(m, overlayOf)
        const tinted = m.elements.some(el => Object.values(el.faces).some(f => f.tintindex === 0))
        if (tinted && method && method !== viewerTint(name)) {
          const color = tintColor(method, s.props)
          const baked = {}
          for (const el of m.elements) {
            for (const face of Object.values(el.faces)) {
              if (face.tintindex !== 0) continue
              delete face.tintindex
              const variable = face.texture.slice(1)
              baked[variable] ??= `${variable}_tinted`
              face.texture = '#' + baked[variable]
            }
          }
          for (const [variable, tintedVariable] of Object.entries(baked)) {
            m.textures[tintedVariable] = store.tinted(m.textures[variable], color)
          }
        }
        const part = { model: MODEL + models.add(name, m) }
        if (m.x) part.x = m.x
        if (m.y) part.y = m.y
        return part
      })
      entries.push({ props: s.props, parts, blockEntityDefault: s.blockEntityDefault })
      if (!parts.length || s.blockEntityDefault === false) continue
      if (!defaultModel || s.index === mcData.blocksByName[name]?.defaultState) {
        defaultModel = parts[0].model
        defaultTexture = (model.parts?.[0] ?? model).textures.particle ?? faces[2]
      }
    }
    blocksStates[name] = buildBlockState(entries)
    const defaults = entries.filter(e => e.blockEntityDefault)
    const variants = blocksStates[name].variants
    if (defaults.length && variants) {
      const plain = defaults.map(e => ({ props: Object.fromEntries(Object.entries(e.props).filter(([k]) => !k.startsWith('block_entity.'))), parts: e.parts }))
      for (const [key, variant] of Object.entries(buildBlockState(plain).variants ?? {})) variants[key] ??= variant
    }
    blocksTextures.push({
      name,
      blockState: name,
      model: defaultModel ? defaultModel.replace(MODEL, 'minecraft:blocks/') : null,
      texture: defaultTexture && defaultTexture !== MISSING ? 'minecraft:blocks/' + defaultTexture : null
    })
  }
  if (!models.models.air) models.models.air = { textures: {}, elements: [] }
  models.models.cube_all = {
    textures: { particle: '#all', down: '#all', up: '#all', north: '#all', south: '#all', west: '#all', east: '#all' },
    elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(FACES.map(d => [d, { texture: '#' + d, cullface: d }])) }]
  }

  const itemBlocks = new Map()
  for (const [name, list] of byName) {
    const s = list.find(s => s.index === mcData.blocksByName[name]?.defaultState) ?? list[0]
    const carried = resolver.carried(s.resolved)
    const north = carried?.path ?? s.faces?.[2]
    if (!north || !store.stemOf(north)) continue
    const colors = carried && (carried.overlay_color || carried.tint_color) ? { overlay_color: carried.overlay_color, tint_color: carried.tint_color } : undefined
    itemBlocks.set(name, { name, north, carried: !!carried, colors, shape: s.render?.shape ?? null })
  }

  return {
    blocksStates,
    blocksModels: models.models,
    blocksTextures,
    itemBlocks,
    resolveBlock: (name, data) => resolver.resolve(name, data),
    report: {
      missingTile: [...report.missingTile].sort(),
      unrendered: [...report.unrendered].sort(),
      missingTextures: [...missingTextures].sort(),
      failed: report.failed,
      shapes: report.shapes
    }
  }
}

module.exports = { exportBlocks, viewerTint }
