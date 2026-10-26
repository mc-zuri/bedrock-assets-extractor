const { DIRS, box, toElementBox, isFullBox, sidePlane, textureVars, cube, boxesToElements } = require('./boxes')
const { rotationBetween, unrotateBox, rotateBox, rotateDir, stateFacing, baseFront, fitRotationY } = require('./orient')
const entity = require('./entity')

const result = (elements, textures, extra = {}) => ({ elements, textures, ao: true, ...extra })

function stateBoxes (state, { prefer = 'collision' } = {}) {
  const collision = state.collision?.length ? state.collision : null
  const outline = state.outline ? [state.outline] : null
  const order = prefer === 'outline' ? [outline, collision] : [collision, outline]
  return (order.find(Boolean) ?? [[0, 0, 0, 1, 1, 1]]).map(toElementBox).filter(Boolean)
}

function oriented (state, ctx, elements, { boxesAreOriented = false } = {}) {
  const target = stateFacing(state.props)
  const front = baseFront(ctx.faces)
  let x = 0
  let y = 0
  const textures = textureVars(ctx.faces)
  if (target && front && DIRS.includes(target)) {
    ({ x, y } = rotationBetween(front, target))
    const vertical = ctx.faces.findIndex(f => /vertical/.test(f))
    if ((target === 'up' || target === 'down') && vertical !== -1) {
      textures[front] = ctx.faces[vertical]
      textures[DIRS[vertical]] = ctx.faces[DIRS.indexOf(front)]
    }
  } else if (target && ctx.shape === 'Terracotta' && DIRS.includes(target)) {
    ({ x, y } = rotationBetween('south', target))
  }
  if (boxesAreOriented && (x || y)) {
    for (const el of elements) [el.from, el.to] = unrotateBox(el.from, el.to, x, y)
  }
  return result(elements, textures, { x, y })
}

function pillar (state, ctx) {
  const axis = state.props.pillar_axis
  const rot = axis === 'x' ? { x: 90, y: 90 } : axis === 'z' ? { x: 90, y: 0 } : { x: 0, y: 0 }
  const boxes = stateBoxes(state)
  const elements = isFullBox(boxes)
    ? cube(ctx.tintFaces)
    : boxesToElements(boxes.map(([f, t]) => unrotateBox(f, t, rot.x, rot.y)), ctx.tintFaces)
  return result(elements, textureVars(ctx.faces), rot)
}

function boxShape (state, ctx, opts) {
  const boxes = stateBoxes(state, opts)
  if (isFullBox(boxes)) return oriented(state, ctx, cube(ctx.tintFaces))
  return oriented(state, ctx, boxesToElements(boxes, ctx.tintFaces), { boxesAreOriented: true })
}

function plane (from, to, faces, texture, { uv = [0, 0, 16, 16], tint = false, rotation } = {}) {
  const el = { from, to, faces: {}, shade: false }
  if (rotation) el.rotation = rotation
  for (const dir of faces) {
    el.faces[dir] = { texture: '#' + texture, uv }
    if (tint) el.faces[dir].tintindex = 0
  }
  return el
}

function crossElements (texture, tint, height = 16) {
  const d = 8 * Math.SQRT2
  const uv = [0, 16 - height, 16, 16]
  const rotation = { origin: [8, 8, 8], axis: 'y', angle: 45 }
  return [
    plane([8 - d, 0, 8], [8 + d, height, 8], ['north', 'south'], texture, { uv, tint, rotation }),
    plane([8, 0, 8 - d], [8, height, 8 + d], ['west', 'east'], texture, { uv, tint, rotation })
  ]
}

function rowElements (texture, tint) {
  return [
    plane([4, 0, 0], [4, 16, 16], ['west', 'east'], texture, { tint }),
    plane([12, 0, 0], [12, 16, 16], ['west', 'east'], texture, { tint }),
    plane([0, 0, 4], [16, 16, 4], ['north', 'south'], texture, { tint }),
    plane([0, 0, 12], [16, 16, 12], ['north', 'south'], texture, { tint })
  ]
}

const G = {}

G.Invisible = () => null
G.StructureVoid = () => null
G.CameraFacingSprite = () => null
G.ClientRequestPlaceholder = () => null

G.Water = (state, ctx) => result([], { particle: ctx.faces[1], flow: ctx.faces[2] }, { liquid: true })

G.Block = (state, ctx) => {
  const boxes = stateBoxes(state, { prefer: state.collision?.length ? 'collision' : 'outline' })
  if (!isFullBox(boxes)) return oriented(state, ctx, boxesToElements(boxes, ctx.tintFaces), { boxesAreOriented: true })
  if (state.props.pillar_axis) return pillar(state, ctx)
  return oriented(state, ctx, cube(ctx.tintFaces))
}
G.Tree = pillar
G.Chain = pillar
G.BambooBlock = pillar

for (const shape of ['BlockHalf', 'Stairs', 'Trapdoor', 'Cactus', 'Cauldron', 'Hopper', 'Anvil', 'EndRod',
  'LightningRod', 'Candle', 'CandleCake', 'Bell', 'Grindstone', 'Lectern', 'Campfire', 'Composter', 'Scaffolding',
  'PortalFrame', 'BrewingStand', 'Skull', 'ShulkerBox', 'Sign', 'Lever', 'TripwireHook', 'Repeater',
  'Comparator', 'Cocoa', 'Bamboo', 'TurtleEgg', 'SnifferEgg', 'DriedGhast', 'HeavyCore', 'Vault',
  'ChiseledBookshelf', 'Shelf', 'CrystalCluster', 'Conduit', 'DragonEgg',
  'StoneCutter', 'SculkSensor', 'CalibratedSculkSensor', 'SculkShrieker', 'FlowerPot', 'ItemFrame',
  'GlowItemFrame', 'BlockActorRendererOnly', 'ChemistryTable', 'FacingBlock', 'Terracotta', 'CommandBlock', 'EndPortal', 'EndGateway', 'SlimeBlock', 'HoneyBlock', 'DriedKelpBlock', 'MangroveRoot',
  'ChorusPlant', 'ChorusFlower', 'CartographyTable', 'ElementBlock', 'FrogSpawn', 'Tripwire', 'Bed', 'Chest']) {
  G[shape] = (state, ctx) => boxShape(state, ctx)
}

for (const [shape, draw] of [['Chest', entity.chest], ['ShulkerBox', entity.shulkerBox], ['Bed', entity.bed], ['Skull', entity.skull], ['Sign', entity.sign]]) {
  G[shape] = (state, ctx) => (ctx.geometry && draw(state, ctx)) || boxShape(state, ctx)
}

G.TopSnow = (state, ctx) => result(boxesToElements(stateBoxes(state, { prefer: 'outline' }), ctx.tintFaces), textureVars(ctx.faces))

const DOOR_FACING = ['east', 'south', 'west', 'north']
const DOOR_CARDINAL = { south: 'east', west: 'south', north: 'west', east: 'north' }
const DOOR_Y = { east: 0, south: 90, west: 180, north: 270 }
const DOOR_UV = {
  left: { north: [3, 0, 0, 16], south: [0, 0, 3, 16], west: [0, 0, 16, 16], east: [16, 0, 0, 16], down: [[16, 13, 0, 16], 90], up: [[0, 3, 16, 0], 90] },
  left_open: { north: [0, 0, 3, 16], south: [0, 0, 3, 16], west: [16, 0, 0, 16], east: [0, 0, 16, 16], down: [[0, 16, 16, 13], 90], up: [[0, 3, 16, 0], 270] },
  right: { north: [3, 0, 0, 16], south: [0, 0, 3, 16], west: [16, 0, 0, 16], east: [0, 0, 16, 16], down: [[0, 13, 16, 16], 90], up: [[0, 0, 16, 3], 270] },
  right_open: { north: [3, 0, 0, 16], south: [3, 0, 0, 16], west: [0, 0, 16, 16], east: [16, 0, 0, 16], down: [[16, 16, 0, 13], 90], up: [[0, 0, 16, 3], 90] }
}

function doorFacing (props) {
  if (props['minecraft:cardinal_direction']) return DOOR_CARDINAL[props['minecraft:cardinal_direction']] ?? 'east'
  return DOOR_FACING[+(props.direction ?? 0)] ?? 'east'
}

G.Door = (state, ctx) => {
  const { props } = state
  const upper = props.upper_block_bit === '1'
  const right = props.door_hinge_bit === '1'
  const open = props.open_bit === '1'
  const uv = DOOR_UV[(right ? 'right' : 'left') + (open ? '_open' : '')]
  const faces = {}
  for (const side of ['north', 'south', 'west', 'east']) {
    faces[side] = { texture: '#door', uv: uv[side] }
    if (side !== 'east') faces[side].cullface = side
  }
  const end = upper ? 'up' : 'down'
  faces[end] = { texture: '#door', uv: uv[end][0], rotation: uv[end][1], cullface: end }
  const y = (DOOR_Y[doorFacing(props)] + (open ? (right ? 270 : 90) : 0)) % 360
  return result([{ from: [0, 0, 0], to: [3, 16, 16], faces }], { door: ctx.faces[2], particle: ctx.faces[2] }, { ao: false, y })
}

G.Ladder = (state, ctx) => {
  const boxes = state.collision?.length ? stateBoxes(state) : []
  if (boxes.length === 0) return null
  const [[from, to]] = boxes
  const size = [0, 1, 2].map(i => to[i] - from[i])
  const axis = size.indexOf(Math.min(...size))
  const at = from[axis] === 0 ? 0.8 : 15.2
  const f = [...from]
  const t = [...to]
  f[axis] = t[axis] = at
  return result([box(f, t, { texture: 'ladder', cull: false })], { ladder: ctx.faces[2], particle: ctx.faces[2] }, { ao: false })
}

for (const shape of ['CrossTexture', 'DoublesidedWideCrossTexture', 'DoublesidedDoublePlant', 'Seagrass', 'Kelp',
  'WeepingVine', 'TwistingVine', 'CaveVine', 'SweetBerryBush', 'MangrovePropagule', 'BambooSapling', 'Eyeblossom',
  'FireflyBush', 'PitcherPlant', 'PitcherCrop', 'CoralFan', 'Fire', 'Stem', 'SporeBlossom']) {
  G[shape] = (state, ctx) => {
    const texture = ctx.faces[2]
    return result(crossElements('cross', ctx.tintTexture(texture)), { cross: texture, particle: texture }, { ao: false })
  }
}
G.DoublesidedRows = (state, ctx) => {
  const texture = ctx.faces[2]
  return result(rowElements('crop', ctx.tintTexture(texture)), { crop: texture, particle: texture }, { ao: false })
}

const TORCH_UV = { down: [7, 13, 9, 15], up: [7, 6, 9, 8], north: [7, 6, 9, 16], south: [7, 6, 9, 16], west: [7, 6, 9, 16], east: [7, 6, 9, 16] }
function torchElement (from, to, rotation, texture = 'torch') {
  const el = { from, to, shade: false, faces: {} }
  if (rotation) el.rotation = rotation
  const height = to[1] - from[1]
  for (const dir of DIRS) {
    const uv = TORCH_UV[dir]
    el.faces[dir] = { texture: '#' + texture, uv: dir === 'up' || dir === 'down' ? uv : [uv[0], uv[1], uv[2], uv[1] + height] }
  }
  return el
}
G.Torch = (state, ctx) => {
  const facing = state.props.torch_facing_direction
  const textures = { torch: ctx.faces[2], particle: ctx.faces[2] }
  if (!facing || facing === 'top' || facing === 'unknown') {
    return result([torchElement([7, 0, 7], [9, 10, 9])], textures, { ao: false })
  }
  const elements = [torchElement([-1, 3.5, 7], [1, 13.5, 9], { origin: [0, 3.5, 8], axis: 'z', angle: -22.5 })]
  return result(elements, textures, { ao: false, y: fitRotationY(elements, state.outline) })
}

function fitRotation (elements, outline, candidates) {
  if (!outline) return candidates[0]
  const want = [outline[0] + outline[3], outline[1] + outline[4], outline[2] + outline[5]].map(v => v * 8)
  let best = candidates[0]
  let bestDist = Infinity
  for (const c of candidates) {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const el of elements) {
      const [from, to] = rotateBox(el.from, el.to, c.x, c.y)
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], from[i]); hi[i] = Math.max(hi[i], to[i]) }
    }
    const d = Math.hypot(...[0, 1, 2].map(i => (lo[i] + hi[i]) / 2 - want[i]))
    if (d < bestDist - 1e-6) { bestDist = d; best = c }
  }
  return best
}
const PLACEMENTS = [{ x: 0, y: 0 }, { x: 0, y: 90 }, { x: 180, y: 0 }, { x: 180, y: 90 }, { x: 90, y: 0 }, { x: 90, y: 90 }, { x: 90, y: 180 }, { x: 90, y: 270 }]

G.Lever = (state, ctx) => {
  const base = ctx.faces[5]
  const handle = ctx.faces[2]
  const on = state.props.open_bit === '1'
  const elements = [
    box([5, 0, 4], [11, 3, 12], { texture: 'base' }),
    torchElement([7, 1, 7], [9, 11, 9], { origin: [8, 1, 8], axis: 'x', angle: on ? -45 : 45 }, 'handle')
  ]
  const axis = /_east_west$/.test(state.props.lever_direction ?? '') ? 90 : 0
  const candidates = /^(up|down)_/.test(state.props.lever_direction ?? '')
    ? PLACEMENTS.filter(p => p.x !== 90 && p.y === axis)
    : PLACEMENTS.filter(p => p.x === 90)
  const rot = fitRotation(elements.slice(0, 1), state.outline, candidates)
  return result(elements, { base, handle, particle: base }, rot)
}

function diode (state, ctx, torches) {
  const lit = /^powered_/.test(state.name) || state.props.output_lit_bit === '1'
  const torch = ctx.ref(`textures/blocks/redstone_torch_${lit ? 'on' : 'off'}`) ?? ctx.faces[2]
  const elements = [box([0, 0, 0], [16, 2, 16])]
  for (const [x, z, on] of torches) {
    const t = on === undefined ? 'torch' : on ? 'torch_on' : 'torch_off'
    elements.push(torchElement([x - 1, 2, z - 1], [x + 1, 7, z + 1], null, t))
  }
  const textures = { ...textureVars(ctx.faces), torch, torch_on: ctx.ref('textures/blocks/redstone_torch_on') ?? torch, torch_off: ctx.ref('textures/blocks/redstone_torch_off') ?? torch }
  const facing = state.props['minecraft:cardinal_direction'] ?? ['south', 'west', 'north', 'east'][+(state.props.direction ?? 0)]
  const y = { north: 0, east: 90, south: 180, west: 270 }[facing] ?? 0
  return result(elements, textures, { y })
}
G.Repeater = (state, ctx) => diode(state, ctx, [[8, 3], [8, 7 + 2 * +(state.props.repeater_delay ?? 0)]])
G.Comparator = (state, ctx) => diode(state, ctx, [[4, 11], [12, 11], [8, 2, state.props.output_subtract_bit === '1']])

G.Lantern = (state, ctx) => {
  const hanging = state.props.hanging === '1'
  const dy = hanging ? 1 : 0
  const faces = (uvSide, uvTop) => Object.fromEntries(DIRS.map(d => [d, { texture: '#lantern', uv: d === 'up' || d === 'down' ? uvTop : uvSide }]))
  const elements = [
    { from: [5, dy, 5], to: [11, 7 + dy, 11], faces: faces([0, 2, 6, 9], [0, 9, 6, 15]) },
    { from: [6, 7 + dy, 6], to: [10, 9 + dy, 10], faces: faces([1, 0, 5, 2], [1, 10, 5, 14]) }
  ]
  const handle = hanging ? { y0: 10, y1: 16, uv: [11, 1, 14, 7] } : { y0: 9, y1: 11, uv: [11, 10, 14, 12] }
  const rotation = { origin: [8, 8, 8], axis: 'y', angle: 45 }
  elements.push(
    plane([6.5, handle.y0, 8], [9.5, handle.y1, 8], ['north', 'south'], 'lantern', { uv: handle.uv, rotation }),
    plane([8, handle.y0, 6.5], [8, handle.y1, 9.5], ['west', 'east'], 'lantern', { uv: handle.uv, rotation })
  )
  return result(elements, { lantern: ctx.faces[2], particle: ctx.faces[2] })
}

const RAIL_ASCENDING = { 2: 'east', 3: 'west', 4: 'north', 5: 'south' }
const RAIL_CURVES = { 6: ['south', 'east'], 7: ['south', 'west'], 8: ['north', 'west'], 9: ['north', 'east'] }
G.Rail = (state, ctx) => {
  const dir = +(state.props.rail_direction ?? 0)
  const texture = ctx.faces[2]
  const textures = { rail: texture, particle: texture }
  const flat = () => [plane([0, 1, 0], [16, 1, 16], ['up', 'down'], 'rail')]
  if (RAIL_ASCENDING[dir]) {
    const d = 8 * Math.SQRT2
    const elements = [plane([0, 9, 8 - d], [16, 9, 8 + d], ['up', 'down'], 'rail', { rotation: { origin: [8, 9, 8], axis: 'x', angle: -45 } })]
    const y = [0, 90, 180, 270].find(r => rotateDir('north', 0, r) === RAIL_ASCENDING[dir])
    return result(elements, textures, { ao: false, y })
  }
  if (RAIL_CURVES[dir]) {
    const want = RAIL_CURVES[dir]
    const y = [0, 90, 180, 270].find(r => ['south', 'east'].map(s => rotateDir(s, 0, r)).every(s => want.includes(s)))
    return result(flat(), textures, { ao: false, y })
  }
  return result(flat(), textures, { ao: false, y: dir === 1 ? 90 : 0 })
}

G.RedDust = (state, ctx) => {
  const [line, cross] = ctx.faces
  const c = connections(state.props, 'minecraft:connection_') ?? {}
  const on = side => (c[side] ?? 'none') !== 'none'
  const textures = { cross, line, particle: cross }
  const flat = ([x0, z0], [x1, z1], texture, extra) => result([plane([x0, 0.25, z0], [x1, 0.25, z1], ['up', 'down'], texture,
    { uv: [x0, z0, x1, z1], tint: ctx.tintTexture(textures[texture]) })], textures, { ao: false, ...extra })
  const alongZ = on('north') || on('south')
  const alongX = on('east') || on('west')
  const out = []
  if (!alongZ && !alongX) out.push(flat([0, 0], [16, 16], 'cross'))
  else if (!alongX) out.push(flat([0, 0], [16, 16], 'line', { y: 90 }))
  else if (!alongZ) out.push(flat([0, 0], [16, 16], 'line'))
  else {
    out.push(flat([5, 5], [11, 11], 'cross'))
    const arms = { north: [[5, 0], [11, 5]], east: [[11, 5], [16, 11]], south: [[5, 11], [11, 16]], west: [[0, 5], [5, 11]] }
    for (const side of SIDES) if (on(side)) out.push(flat(...arms[side], 'cross'))
  }
  for (const side of SIDES) {
    if (c[side] !== 'up') continue
    const up = plane([0, 0, 0.25], [16, 16, 0.25], ['north', 'south'], 'line', { tint: ctx.tintTexture(line) })
    for (const face of Object.values(up.faces)) face.rotation = 90
    out.push(result([up], textures, { ao: false, y: ARM_Y[side] }))
  }
  return parts(out)
}

G.Lilypad = (state, ctx) => {
  const texture = ctx.faces[1]
  return result([plane([0, 0.25, 0], [16, 0.25, 16], ['up', 'down'], 'pad', { tint: ctx.tintTexture(texture) })], { pad: texture, particle: texture }, { ao: false })
}

for (const shape of ['FlowerBed', 'PaleMossCarpet']) {
  G[shape] = (state, ctx) => {
    const texture = ctx.faces[1]
    return result([plane([0, 1, 0], [16, 1, 16], ['up', 'down'], 'top', { tint: ctx.tintTexture(texture) })], { top: texture, particle: texture }, { ao: false })
  }
}

G.Vine = (state, ctx) => {
  const bits = +(state.props.vine_direction_bits ?? 0)
  const texture = ctx.faces[2]
  const tint = ctx.tintTexture(texture)
  const sides = [['south', 1], ['west', 2], ['north', 4], ['east', 8]].filter(([, b]) => bits & b).map(([d]) => d)
  if (sides.length === 0) sides.push('up')
  return result(sides.map(d => sidePlane(d, 'vine', tint)), { vine: texture, particle: texture }, { ao: false })
}

G.MultifaceBlock = (state, ctx) => {
  const bits = +(state.props.multi_face_direction_bits ?? 0)
  const texture = ctx.faces[2]
  const tint = ctx.tintTexture(texture)
  const sides = DIRS.filter((d, i) => bits & (1 << i))
  if (sides.length === 0) return null
  return result(sides.map(d => sidePlane(d, 'face', tint)), { face: texture, particle: texture }, { ao: false })
}

const SIDES = ['north', 'east', 'south', 'west']
function connections (props, prefix) {
  const known = SIDES.filter(s => props[prefix + s] !== undefined)
  return known.length ? Object.fromEntries(SIDES.map(s => [s, props[prefix + s]])) : null
}

const ARM_Y = { north: 0, east: 90, south: 180, west: 270 }
const parts = list => ({ parts: list })

G.Fence = (state, ctx) => {
  const c = connections(state.props, 'minecraft:connection_')
  const table = ctx.tessellator?.fence
  const post = table?.[0] ?? [[0.375, 0, 0.375, 0.625, 1, 0.625]]
  const toElements = boxes => boxesToElements(boxes.map(toElementBox).filter(Boolean), ctx.tintFaces)
  const out = [result(toElements(post), textureVars(ctx.faces))]
  const key = b => b.join(',')
  const arm = table && (table[1] ?? []).filter(b => !post.some(p => key(p) === key(b)))
  for (const side of SIDES) {
    if (!c || c[side] !== '1' || !arm?.length) continue
    out.push(result(toElements(arm), textureVars(ctx.faces), { y: ARM_Y[side] }))
  }
  return parts(out)
}

G.DoubleSideFence = (state, ctx) => {
  const c = connections(state.props, 'minecraft:connection_')
  const sides = c ? SIDES.filter(s => c[s] === '1') : []
  const texture = { up: 'edge', down: 'edge', north: 'pane', south: 'pane', west: 'pane', east: 'pane' }
  const textures = { pane: ctx.faces[2], edge: ctx.faces[1], particle: ctx.faces[2] }
  const out = [result([box([7, 0, 7], [9, 16, 9], { texture })], textures)]
  for (const side of sides.length ? sides : SIDES) out.push(result([box([7, 0, 0], [9, 16, 7], { texture })], textures, { y: ARM_Y[side] }))
  return parts(out)
}
G.MetalBars = G.DoubleSideFence

G.Wall = (state, ctx) => {
  const p = state.props
  const textures = textureVars(ctx.faces)
  const out = []
  for (const side of SIDES) {
    const kind = p['wall_connection_type_' + side]
    if (!kind || kind === 'none') continue
    out.push(result([box([5, 0, 0], [11, kind === 'tall' ? 16 : 14, 8])], textures, { y: ARM_Y[side] }))
  }
  if (p.wall_post_bit !== '0' || !out.length) out.unshift(result([box([4, 0, 4], [12, 16, 12])], textures))
  return parts(out)
}

G.FenceGate = (state, ctx) => {
  const p = state.props
  const down = p.in_wall_bit === '1' ? 3 : 0
  const b = (from, to) => box([from[0], from[1] - down, from[2]], [to[0], to[1] - down, to[2]], { texture: 'gate' })
  const elements = [b([0, 5, 7], [2, 16, 9]), b([14, 5, 7], [16, 16, 9])]
  if (p.open_bit === '1') {
    elements.push(
      b([0, 6, 13], [2, 15, 15]), b([14, 6, 13], [16, 15, 15]),
      b([0, 6, 9], [2, 9, 13]), b([0, 12, 9], [2, 15, 13]),
      b([14, 6, 9], [16, 9, 13]), b([14, 12, 9], [16, 15, 13]))
  } else {
    elements.push(
      b([6, 6, 7], [8, 15, 9]), b([8, 6, 7], [10, 15, 9]),
      b([2, 6, 7], [6, 9, 9]), b([2, 12, 7], [6, 15, 9]),
      b([10, 6, 7], [14, 9, 9]), b([10, 12, 7], [14, 15, 9]))
  }
  const facing = p['minecraft:cardinal_direction'] ?? ['south', 'west', 'north', 'east'][+(p.direction ?? 0)]
  const y = { south: 0, west: 90, north: 180, east: 270 }[facing] ?? 0
  return result(elements, { gate: ctx.faces[2], particle: ctx.faces[2] }, { y })
}

const FACING_Y = { north: 0, east: 90, south: 180, west: 270 }
const dripleafY = props => FACING_Y[props['minecraft:cardinal_direction'] ?? ['south', 'west', 'north', 'east'][+(props.direction ?? 0)]] ?? 0
const isSet = value => value === '1' || value === 'true'
const stemPlanes = (from, to, uv, [x, z]) => [45, -45].map(angle => plane(from, to, ['north', 'south'], 'stem', { uv, rotation: { origin: [x, 8, z], axis: 'y', angle } }))
const sheet = (from, to, faces) => ({ from, to, shade: false, faces: Object.fromEntries(Object.entries(faces).map(([dir, [texture, uv, rotation]]) => [dir, { texture: '#' + texture, uv, ...(rotation ? { rotation } : {}) }])) })
const sheetBox = (from, to, texture, uv) => sheet(from, to, Object.fromEntries(SIDES.map(dir => [dir, [texture, uv]])))

G.BigDripleaf = (state, ctx) => {
  const [side, tip, stem, top] = ctx.faces
  const textures = { side, tip, stem, top, particle: top }
  const extra = { ao: false, y: dripleafY(state.props) }
  if (!isSet(state.props.big_dripleaf_head)) return result(stemPlanes([5, 0, 12], [11, 16, 12], [3, 0, 14, 16], [8, 12]), textures, extra)
  const leaf = [
    sheet([0, 15, 0], [16, 15, 16], { up: ['top', [0, 0, 16, 16]], down: ['top', [0, 16, 16, 0]] }),
    sheet([0, 11, 0], [16, 15, 0], { north: ['tip', [0, 0, 16, 4]], south: ['tip', [16, 0, 0, 4]] }),
    sheet([0, 11, 0], [0, 15, 16], { west: ['side', [0, 0, 16, 4]], east: ['side', [16, 0, 0, 4]] }),
    sheet([16, 11, 0], [16, 15, 16], { west: ['side', [0, 0, 16, 4]], east: ['side', [16, 0, 0, 4]] })
  ]
  const angle = { partial_tilt: -22.5, full_tilt: -45 }[state.props.big_dripleaf_tilt]
  if (angle) for (const el of leaf) el.rotation = { origin: [8, 15, 16], axis: 'x', angle }
  return result([...leaf, ...stemPlanes([5, 0, 12], [11, 15, 12], [3, 0, 14, 16], [8, 12])], textures, extra)
}

G.SmallDripleaf = (state, ctx) => {
  const [side, top, stemTop, stemBottom] = ctx.faces
  const upper = isSet(state.props.upper_block_bit)
  const textures = { side, top, stem: upper ? stemTop : stemBottom, particle: top }
  const extra = { ao: false, y: dripleafY(state.props) }
  if (!upper) return result(stemPlanes([4.5, 0, 8], [11.5, 16, 8], [5, 0, 12, 16], [8, 8]), textures, extra)
  const edges = (from, to) => sheetBox(from, to, 'side', [0, 0, 8, 1])
  return result([
    sheet([8, 3, 8], [15, 3, 15], { down: ['top', [8, 0, 0, 8]], up: ['top', [8, 8, 0, 0]] }),
    sheet([1, 8.02, 1], [8, 8.02, 8], { down: ['top', [0, 8, 8, 0]], up: ['top', [0, 0, 8, 8]] }),
    sheet([1, 12.02, 8], [8, 12.02, 15], { down: ['top', [8, 0, 0, 8], 270], up: ['top', [0, 0, 8, 8], 270] }),
    edges([8, 2, 8], [15, 3, 15]),
    edges([1, 7.02, 1], [8, 8.02, 8]),
    edges([1, 11.02, 8], [8, 12.02, 15]),
    ...stemPlanes([4.5, 0, 8], [11.5, 14, 8], [4, 0, 12, 14], [8, 8])
  ], textures, extra)
}

G.Azalea = (state, ctx) => {
  const plant = ctx.faces.find(f => /(^|[/:])azalea_plant$/.test(f)) ?? ctx.faces[0]
  const textures = { top: ctx.faces[1], side: ctx.faces[2], plant, particle: ctx.faces[1] }
  const side = [0, 0, 16, 11]
  const back = [16, 0, 0, 11]
  return result([
    sheet([0, 16, 0], [16, 16, 16], { up: ['top', [0, 0, 16, 16]], down: ['top', [0, 16, 16, 0]] }),
    sheet([0, 5, 0], [16, 16, 0], { north: ['side', side], south: ['side', back] }),
    sheet([0, 5, 16], [16, 16, 16], { south: ['side', side], north: ['side', back] }),
    sheet([0, 5, 0], [0, 16, 16], { west: ['side', side], east: ['side', back] }),
    sheet([16, 5, 0], [16, 16, 16], { east: ['side', side], west: ['side', back] }),
    ...crossElements('plant', false, 15.9)
  ], textures, { ao: false })
}

G.Beacon = (state, ctx) => {
  const [base, core, shell] = ctx.faces
  return result([
    box([0, 0, 0], [16, 16, 16], { texture: 'shell' }),
    box([2, 0.1, 2], [14, 3, 14], { texture: 'base', cull: false }),
    box([3, 3, 3], [13, 14, 13], { texture: 'core', cull: false })
  ], { shell, base, core, particle: core })
}

const SEA_PICKLES = [
  [[6, 6, 6]],
  [[3, 3, 6], [8, 8, 4]],
  [[6, 9, 6], [2, 2, 4], [8, 4, 6]],
  [[2, 2, 6], [9, 10, 4], [9, 2, 6], [2, 8, 7]]
]
G.SeaPickle = (state, ctx) => {
  const alive = !isSet(state.props.dead_bit)
  const elements = []
  for (const [x, z, h] of SEA_PICKLES[+(state.props.cluster_count ?? 0)] ?? SEA_PICKLES[0]) {
    elements.push(sheet([x, 0, z], [x + 4, h, z + 4], {
      down: ['pickle', [8, 1, 12, 5]],
      up: ['pickle', [4, 1, 8, 5]],
      north: ['pickle', [4, 5, 8, 5 + h]],
      south: ['pickle', [0, 5, 4, 5 + h]],
      west: ['pickle', [8, 5, 12, 5 + h]],
      east: ['pickle', [12, 5, 16, 5 + h]]
    }))
    if (!alive) continue
    elements.push(
      sheet([x, h - 0.05, z], [x + 4, h - 0.05, z + 4], { up: ['pickle', [8, 1, 12, 5]] }),
      sheet([x + 1.5, h - 0.8, z + 2], [x + 2.5, h + 2.7, z + 2], { north: ['pickle', [1, 0, 3, 5]], south: ['pickle', [3, 0, 1, 5]] }),
      sheet([x + 2, h - 0.8, z + 1.5], [x + 2, h + 2.7, z + 2.5], { west: ['pickle', [13, 0, 15, 5]], east: ['pickle', [15, 0, 13, 5]] })
    )
  }
  return result(elements, { pickle: ctx.faces[2], particle: ctx.faces[2] })
}

const PISTON_FACING = ['down', 'up', 'south', 'north', 'east', 'west']
G.Piston = (state, ctx) => {
  const [bottom, inner, side] = ctx.faces
  const sticky = /sticky/i.test(state.name)
  const normal = ctx.ref('textures/blocks/piston_top_normal') ?? inner
  const head = sticky ? ctx.ref('textures/blocks/piston_top_sticky') ?? normal : normal
  const out = 16 * Math.min(1, Math.max(0, +(state.props['block_entity.Progress'] ?? 0) || 0))
  const face = (texture, uv, extra) => ({ texture: '#' + texture, ...(uv ? { uv } : {}), ...extra })
  const around = (texture, uv, extra = () => ({})) => Object.fromEntries(SIDES.map(d => [d, face(texture, uv, extra(d))]))
  const cull = d => out ? {} : { cullface: d }
  const elements = [
    { from: [0, 0, 0], to: [16, 12, 16], faces: { down: face('bottom', null, { cullface: 'down' }), up: face('inner'), ...around('side', [0, 4, 16, 16], d => ({ cullface: d })) } },
    { from: [0, 12 + out, 0], to: [16, 16 + out, 16], faces: { up: face('head', null, cull('up')), down: face('plate'), ...around('side', [0, 0, 16, 4], cull) } }
  ]
  if (out) elements.push({ from: [6, 12, 6], to: [10, 12 + out, 10], faces: around('side', [0, 0, out, 4], () => ({ rotation: 90 })) })
  const facing = PISTON_FACING[+(state.props.facing_direction ?? 1)] ?? 'up'
  return result(elements, { bottom, inner, side, head, plate: normal, particle: side }, { ao: false, ...rotationBetween('up', facing) })
}

const DRIPSTONE_FACE = { tip: 2, frustum: 0, middle: 3, base: 1, merge: 4 }
G.PointedDripstone = (state, ctx) => {
  const texture = ctx.faces[DRIPSTONE_FACE[state.props.dripstone_thickness] ?? 2]
  return result(crossElements('cross', false), { cross: texture, particle: texture }, { ao: false })
}

function fallback (state, ctx) {
  if (state.collision?.length) return boxShape(state, ctx)
  const shape = state.outline
  if (!shape) return null
  const [[from, to]] = [shape].map(toElementBox).filter(Boolean).concat([[[0, 0, 0], [16, 16, 16]]])
  if (to[1] - from[1] <= 3.2) return result([box(from, to, { tint: ctx.tintFaces })], textureVars(ctx.faces))
  const texture = ctx.faces[2]
  return result(crossElements('cross', ctx.tintTexture(texture)), { cross: texture, particle: texture }, { ao: false })
}

const RENDERERS = [
  [/^(standing|wall)_banner$/, entity.banner],
  [/^decorated_pot$/, entity.decoratedPot],
  [/copper_golem_statue$/, entity.statue]
]

function generate (state, ctx) {
  const renderer = ctx.geometry && RENDERERS.find(([pattern]) => pattern.test(state.name))?.[1]
  const drawn = renderer && renderer(state, ctx)
  if (drawn) return drawn
  const generator = ctx.shape ? G[ctx.shape] : null
  return generator ? generator(state, ctx) : fallback(state, ctx)
}

module.exports = { generate, generators: G, stateBoxes, crossElements }
