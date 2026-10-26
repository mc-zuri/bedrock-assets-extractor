const { DIRS } = require('./boxes')
const { rotationBetween } = require('./orient')

function boxUv ([u, v], [w, h, d]) {
  return {
    north: [u + d, v + d, u + d + w, v + d + h],
    east: [u, v + d, u + d, v + d + h],
    south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
    west: [u + d + w, v + d, u + 2 * d + w, v + d + h],
    up: [u + d, v, u + d + w, v + d],
    down: [u + d + w, v + d, u + d + 2 * w, v]
  }
}

function element (from, to, uv, sheet, texture, { faces = DIRS, rotation } = {}) {
  const el = { from, to, faces: {} }
  if (rotation) el.rotation = rotation
  for (const dir of faces) {
    const [u0, v0, u1, v1] = uv[dir]
    el.faces[dir] = { texture: '#' + texture, uv: [u0 * 16 / sheet[0], v0 * 16 / sheet[1], u1 * 16 / sheet[0], v1 * 16 / sheet[1]] }
  }
  return el
}

const round = v => Math.round(v * 1000) / 1000

const flipped = uv => ({ north: uv.south, south: uv.north, east: uv.west, west: uv.east, up: uv.up, down: uv.down })

function geometryIndex (stack) {
  const index = new Map()
  for (const path of stack.files.keys()) {
    if (!/^models\/.+\.json$/.test(path)) continue
    let json
    try { json = stack.json(path) } catch { continue }
    for (const [key, g] of Object.entries(json ?? {})) {
      if (key.startsWith('geometry.')) index.set(key.split(':')[0], { sheet: [g.texturewidth ?? 64, g.textureheight ?? 64], bones: g.bones ?? [] })
    }
    for (const g of json?.['minecraft:geometry'] ?? []) {
      const d = g.description ?? {}
      if (d.identifier) index.set(d.identifier.split(':')[0], { sheet: [d.texture_width ?? 64, d.texture_height ?? 64], bones: g.bones ?? [] })
    }
  }
  return index
}

const FACING = { 2: 'north', 3: 'south', 4: 'west', 5: 'east' }
const DIRECTION = ['south', 'west', 'north', 'east']
const TURN = { north: 0, east: 90, south: 180, west: 270 }

function facingOf (props) {
  return props['minecraft:cardinal_direction'] ?? FACING[props.facing_direction] ?? DIRECTION[+(props.direction ?? 2)] ?? 'north'
}

const LID_STEPS = 9
const SIDES = ['north', 'east', 'south', 'west']

function boxPart (from, to, uv, x0, x1) {
  const out = {}
  const span = to[0] - from[0]
  for (const [dir, [u0, v0, u1, v1]] of Object.entries(uv)) {
    if (dir === 'east' || dir === 'west') {
      if ((dir === 'east' ? x1 === to[0] : x0 === from[0])) out[dir] = [u0, v0, u1, v1]
      continue
    }
    const fromEast = dir === 'north' || dir === 'down'
    const at = x => u0 + (fromEast ? (to[0] - x) : (x - from[0])) / span * (u1 - u0)
    out[dir] = fromEast ? [at(x1), v0, at(x0), v1] : [at(x0), v0, at(x1), v1]
  }
  return out
}

function chest (state, ctx) {
  const name = state.name.replace(/^waxed_/, '')
  const stage = { exposed: 'exposed', weathered: 'weathered', oxidized: 'oxidized' }[name.split('_')[0]] ?? 'default'
  let sheet = 'normal'
  if (/ender/.test(name)) sheet = 'ender'
  else if (/trapped/.test(name)) sheet = 'trapped'
  else if (/copper/.test(name)) sheet = 'copper_' + stage
  const facing = facingOf(state.props)
  const pair = state.props['block_entity.pair'] ?? 'none'
  const side = pair === 'none' ? null : SIDES[(SIDES.indexOf(pair) - TURN[facing] / 90 + 4) % 4]
  const half = side === 'east' ? 'west' : side === 'west' ? 'east' : null
  const double = half && ctx.ref(`textures/entity/chest/${{ normal: 'double_normal', trapped: 'trapped_double' }[sheet] ?? sheet + '_double'}`)
  const texture = double || ctx.ref(`textures/entity/chest/${sheet}`)
  if (!texture) return null
  const step = Math.min(LID_STEPS, Math.max(0, +(state.props['block_entity.lid'] ?? 0)))
  const rotation = step ? { origin: [8, 9, 15], axis: 'x', angle: round(step * 90 / LID_STEPS) } : undefined
  let elements
  if (double) {
    const [x0, x1] = half === 'west' ? [0, 16] : [16, 32]
    const part = (from, to, uv, opts) => {
      const a = Math.max(from[0], x0)
      const b = Math.min(to[0], x1)
      const cut = boxPart(from, to, uv, a, b)
      return element([a - x0, from[1], from[2]], [b - x0, to[1], to[2]], cut, [128, 64], 'chest', { faces: Object.keys(cut), ...opts })
    }
    elements = [
      part([1, 0, 1], [31, 10, 15], boxUv([0, 19], [30, 10, 14])),
      part([1, 9, 1], [31, 14, 15], boxUv([0, 0], [30, 5, 14]), { rotation }),
      part([15, 7, 0], [17, 11, 1], boxUv([0, 0], [2, 4, 1]), { rotation })
    ]
  } else {
    const s = [64, 64]
    elements = [
      element([1, 0, 1], [15, 10, 15], boxUv([0, 19], [14, 10, 14]), s, 'chest'),
      element([1, 9, 1], [15, 14, 15], boxUv([0, 0], [14, 5, 14]), s, 'chest', { rotation }),
      element([7, 7, 0], [9, 11, 1], boxUv([0, 0], [2, 4, 1]), s, 'chest', { rotation })
    ]
  }
  return { elements, textures: { chest: texture, particle: texture }, ao: true, y: TURN[facing] }
}

// a shulker box as the client draws it: the shulker's shell (geometry.shulker: a base 8 high, a lid 12 high over it)
// on the colour's sheet, turned by its block entity's facing (0 down, 1 up, 2 north, 3 south, 4 west, 5 east); open,
// the lid rises half a block, turning three quarters round. (The base is a hair narrower, so that the lid's sides
// where they overlap it are drawn over it.)
const SHULKER_FACING = ['down', 'up', 'north', 'south', 'west', 'east']

function shulkerBox (state, ctx) {
  const color = state.props.color ?? (state.name.replace(/_?shulker_box$/, '') || 'undyed')
  const texture = ctx.ref(`textures/entity/shulker/shulker_${color === 'light_gray' ? 'silver' : color}`)
  if (!texture) return null
  const step = Math.min(LID_STEPS, Math.max(0, +(state.props['block_entity.lid'] ?? 0)))
  const lift = 8 * step / LID_STEPS
  const rotation = step ? { origin: [8, 8, 8], axis: 'y', angle: round(270 * step / LID_STEPS) } : undefined
  const s = [64, 64]
  const elements = [
    element([0.01, 0, 0.01], [15.99, 8, 15.99], boxUv([0, 28], [16, 8, 16]), s, 'shulker'),
    element([0, round(4 + lift), 0], [16, round(16 + lift), 16], boxUv([0, 0], [16, 12, 16]), s, 'shulker', { rotation })
  ]
  const { x, y } = rotationBetween('up', SHULKER_FACING[+(state.props['block_entity.facing'] ?? 1)] ?? 'up')
  return { elements, textures: { shulker: texture, particle: texture }, ao: true, x, y }
}

const BED_COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'silver', 'cyan',
  'purple', 'blue', 'brown', 'green', 'red', 'black']

function bed (state, ctx) {
  const geometry = ctx.geometry('geometry.bed')
  const texture = ctx.ref(`textures/entity/bed/${BED_COLORS[state.props['block_entity.color'] ?? 14] ?? 'red'}`)
  if (!geometry || !texture) return null
  const head = state.props.head_piece_bit === '1'
  const z0 = head ? 16 : 0
  const elements = []
  for (const bone of geometry.bones) {
    for (const cube of bone.cubes ?? []) {
      const [ox, oy, oz] = cube.origin
      const [w, h, d] = cube.size
      const from = [ox, 9 - (oz + d), oy]
      const to = [ox + w, 9 - oz, oy + h]
      const lo = Math.max(from[2], z0)
      const hi = Math.min(to[2], z0 + 16)
      if (hi <= lo) continue
      const uv = boxUv(cube.uv, cube.size)
      const along = ([u0, v0, u1, v1], from2, to2) => {
        const t0 = (lo - from2) / (to2 - from2)
        const t1 = (hi - from2) / (to2 - from2)
        return [u0, v1 - (v1 - v0) * t0, u1, v1 - (v1 - v0) * t1]
      }
      const faces = {
        up: along(uv.north, from[2], to[2]),
        down: along(uv.south, from[2], to[2]),
        west: along(uv.east, from[2], to[2]),
        east: along(uv.west, from[2], to[2]),
        north: uv.down,
        south: uv.up
      }
      const keep = DIRS.filter(dir => (dir !== 'north' || lo === from[2]) && (dir !== 'south' || hi === to[2]))
      elements.push(element([from[0], from[1], lo - z0].map(round), [to[0], to[1], hi - z0].map(round), faces, geometry.sheet, 'bed', { faces: keep }))
    }
  }
  const facing = DIRECTION[+(state.props.direction ?? 0)]
  return { elements, textures: { bed: texture, particle: texture }, ao: true, y: (TURN[facing] + 180) % 360 }
}

const HEADS = {
  skeleton_skull: 'skeleton',
  wither_skeleton_skull: 'wither',
  zombie_head: 'zombie',
  player_head: 'steve',
  creeper_head: 'creeper',
  dragon_head: 'dragon',
  piglin_head: 'piglin'
}
const SKULL_TYPES = ['skeleton', 'wither', 'zombie', 'steve', 'creeper', 'dragon', 'piglin']

function sixteenths (n) {
  const step = ((n % 16) + 16) % 16
  return { y: (Math.floor(step / 4) * 90 + 180) % 360, rotation: { origin: [8, 8, 8], axis: 'y', angle: -(step % 4) * 22.5 } }
}

function skull (state, ctx) {
  const type = HEADS[state.name] ?? SKULL_TYPES[state.props['block_entity.SkullType'] ?? 0] ?? 'skeleton'
  const entity = ctx.clientEntity('minecraft:skull')
  const geometry = ctx.geometry(entity?.geometry?.[type] ?? 'geometry.mob_head')
  const texture = ctx.ref(entity?.textures?.[type] ?? `textures/entity/skulls/${type}`)
  if (!geometry || !texture) return null
  const bones = geometry.bones.filter(b => /head/i.test(b.name) && b.cubes?.length)
  const cubes = (bones.length ? bones : geometry.bones).flatMap(b => b.cubes ?? [])
  if (!cubes.length) return null
  const lo = [0, 1, 2].map(i => Math.min(...cubes.map(c => c.origin[i])))
  const hi = [0, 1, 2].map(i => Math.max(...cubes.map(c => c.origin[i] + c.size[i])))
  const scale = Math.min(1, 12 / Math.max(...[0, 1, 2].map(i => hi[i] - lo[i])))
  const wall = FACING[state.props.facing_direction]
  const turn = wall ? { y: TURN[wall] } : sixteenths(Math.round(+(state.props['block_entity.Rotation'] ?? 0) / 22.5))
  const elements = cubes.map(c => {
    const from = [0, 1, 2].map(i => (c.origin[i] - (i === 1 ? lo[1] : (lo[i] + hi[i]) / 2)) * scale)
    const to = [0, 1, 2].map(i => from[i] + c.size[i] * scale)
    const shift = [8, wall ? 4 : 0, wall ? 16 - (hi[2] - lo[2]) * scale / 2 : 8]
    return element(from.map((v, i) => round(v + shift[i])), to.map((v, i) => round(v + shift[i])), boxUv(c.uv, c.size), geometry.sheet, 'head',
      { rotation: turn.rotation?.angle ? turn.rotation : undefined })
  })
  return { elements, textures: { head: texture, particle: texture }, ao: true, y: turn.y }
}

function signSheet (name) {
  const wood = name.replace(/_?(standing|wall)_sign$/, '') || 'oak'
  if (wood === 'oak') return ['textures/entity/sign']
  return [`textures/entity/sign_${wood}`, `textures/entity/${wood === 'darkoak' ? 'dark_oak' : wood}_sign`]
}

function sign (state, ctx) {
  if (/hanging/.test(state.name)) return hangingSign(state, ctx)
  const texture = signSheet(state.name).map(p => ctx.ref(p)).find(Boolean)
  if (!texture) return null
  const s = [64, 32]
  const k = 2 / 3
  const wall = /wall_sign$/.test(state.name)
  const board = boxUv([0, 0], [24, 12, 2])
  if (wall) {
    const facing = FACING[state.props.facing_direction] ?? 'north'
    const elements = [element([0, 4.333, 16 - 2 * k].map(round), [16, 12.333, 16], board, s, 'sign')]
    return { elements, textures: { sign: texture, particle: texture }, ao: true, y: TURN[facing] }
  }
  const { y, rotation } = sixteenths(+(state.props.ground_sign_direction ?? 0))
  const elements = [
    element([0, 9.333, 8 - k].map(round), [16, 17.333, 8 + k].map(round), board, s, 'sign', { rotation }),
    element([8 - k, 0, 8 - k].map(round), [8 + k, 9.333, 8 + k].map(round), boxUv([0, 14], [2, 14, 2]), s, 'sign', { rotation })
  ]
  return { elements, textures: { sign: texture, particle: texture }, ao: true, y }
}

function hangingSign (state, ctx) {
  const texture = ctx.ref(`textures/entity/${state.name}`)
  if (!texture) return null
  const s = [64, 32]
  const box = (from, to, uv, opts) => element([8 + from[0], 10 - to[1], 8 - to[2]], [8 + to[0], 10 - from[1], 8 - from[2]], flipped(uv), s, 'sign', opts)
  const plane = (from, to, uv, opts) => box(from, to, uv, { faces: ['north', 'south'], ...opts })
  const hanging = state.props.hanging === '1'
  const attached = hanging && state.props.attached_bit === '1'
  const elements = [box([-7, 0, -1], [7, 10, 1], boxUv([0, 12], [14, 10, 2]))]
  if (!hanging) elements.push(box([-8, -6, -2], [8, -4, 2], boxUv([0, 0], [16, 2, 4])))
  if (attached) elements.push(plane([-6, -6, 0], [6, 0, 0], boxUv([14, 6], [12, 6, 0])))
  else {
    for (const x of [-5, 5]) {
      for (const [u, angle] of [[0, 45], [6, -45]]) {
        elements.push(plane([x - 1.5, -6, 0], [x + 1.5, 0, 0], boxUv([u, 6], [3, 6, 0]), { rotation: { origin: [8 + x, 10, 8], axis: 'y', angle } }))
      }
    }
  }
  const turn = attached
    ? sixteenths(+(state.props.ground_sign_direction ?? 0))
    : { y: TURN[FACING[state.props.facing_direction] ?? 'south'] }
  if (turn.rotation?.angle) for (const el of elements) el.rotation ??= turn.rotation
  return { elements, textures: { sign: texture, particle: texture }, ao: true, y: (turn.y + 180) % 360 }
}

function banner (state, ctx) {
  const texture = ctx.ref('textures/entity/banner/banner_base')
  if (!texture) return null
  const s = [64, 64]
  const k = 2 / 3
  const wall = state.name === 'wall_banner'
  const at = wall ? [8, -23 / 3, 1] : [8, 8, 8]
  const box = (from, to, uv, opts) => element(
    [at[0] + from[0] * k, at[1] - to[1] * k, at[2] - to[2] * k].map(round),
    [at[0] + to[0] * k, at[1] - from[1] * k, at[2] - from[2] * k].map(round), flipped(uv), s, 'banner', opts)
  const turn = wall
    ? { y: TURN[FACING[state.props.facing_direction] ?? 'south'] }
    : sixteenths(+(state.props.ground_sign_direction ?? 0))
  const rotation = turn.rotation?.angle ? turn.rotation : undefined
  const elements = [
    box([-10, -32, -2], [10, 8, -1], boxUv([0, 0], [20, 40, 1]), { rotation }),
    box([-10, -32, -1], [10, -30, 1], boxUv([0, 42], [20, 2, 2]), { rotation })
  ]
  if (!wall) elements.push(box([-1, -30, -1], [1, 12, 1], boxUv([44, 0], [2, 42, 2]), { rotation }))
  return { elements, textures: { banner: texture, particle: texture }, ao: true, y: (turn.y + 180) % 360 }
}

function decoratedPot (state, ctx) {
  const side = ctx.ref(ctx.clientEntity('minecraft:decorated_pot')?.textures?.brick ?? 'textures/blocks/decorated_pot_side')
  const base = ctx.ref('textures/blocks/decorated_pot_base')
  if (!side || !base) return null
  const b = [32, 32]
  const sheet = ([u0, v0, u1, v1]) => [u0 * 16 / b[0], v0 * 16 / b[1], u1 * 16 / b[0], v1 * 16 / b[1]]
  const body = { from: [1, 0, 1], to: [15, 16, 15], faces: {} }
  for (const dir of ['north', 'east', 'south', 'west']) body.faces[dir] = { texture: '#side', uv: [1, 0, 15, 16] }
  body.faces.up = { texture: '#base', uv: sheet([14, 27, 28, 13]) }
  body.faces.down = { texture: '#base', uv: sheet([0, 13, 14, 27]) }
  const elements = [
    body,
    element([4.8, 15.8, 4.8], [11.2, 17.2, 11.2], flipped(boxUv([0, 5], [6, 1, 6])), b, 'base'),
    element([4.1, 17.1, 4.1], [11.9, 19.9, 11.9], flipped(boxUv([0, 0], [8, 3, 8])), b, 'base')
  ]
  return { elements, textures: { side, base, particle: side }, ao: true }
}

function statue (state, ctx) {
  const geometry = ctx.geometry('geometry.copper_golem')
  const stage = /^(?:waxed_)?(exposed|weathered|oxidized)_/.exec(state.name)?.[1]
  const texture = ctx.ref(`textures/entity/copper_golem/copper_golem${stage ? '_' + stage : ''}`)
  if (!geometry || !texture) return null
  const elements = geometry.bones.flatMap(bone => (bone.cubes ?? []).filter(c => Array.isArray(c.uv)).map(c =>
    element([8 + c.origin[0], c.origin[1], 8 + c.origin[2]].map(round), [8 + c.origin[0] + c.size[0], c.origin[1] + c.size[1], 8 + c.origin[2] + c.size[2]].map(round),
      boxUv(c.uv, c.size), geometry.sheet, 'golem')))
  return { elements, textures: { golem: texture, particle: texture }, ao: true, y: TURN[facingOf(state.props)] }
}

module.exports = { chest, shulkerBox, bed, skull, sign, banner, decoratedPot, statue, geometryIndex, boxUv, boxPart, LID_STEPS }
