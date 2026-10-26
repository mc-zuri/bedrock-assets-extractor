const DIRS = ['down', 'up', 'north', 'south', 'west', 'east']
const DIR_VEC = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0]
}
const OPPOSITE = { down: 'up', up: 'down', north: 'south', south: 'north', west: 'east', east: 'west' }
const AXIS = { west: 0, east: 0, down: 1, up: 1, north: 2, south: 2 }

const round = v => (Math.round(v * 1e4) / 1e4) || 0

function box (from, to, { texture, cull = true, tint = false, uvFlip = false } = {}) {
  const el = { from, to, faces: {} }
  const size = [0, 1, 2].map(i => to[i] - from[i])
  for (const dir of DIRS) {
    const axis = AXIS[dir]
    const flatAxis = size.findIndex(s => s === 0)
    if (flatAxis !== -1 && flatAxis !== axis) continue
    const face = { texture: '#' + (typeof texture === 'string' ? texture : (texture?.[dir] ?? dir)) }
    const onEdge = ['down', 'north', 'west'].includes(dir) ? from[axis] === 0 : to[axis] === 16
    if (cull && onEdge && flatAxis === -1) face.cullface = dir
    if (tint === true || (tint && tint[dir])) face.tintindex = 0
    if (uvFlip && axis !== 1) face.uv = flipUv(dir, from, to)
    el.faces[dir] = face
  }
  return el
}

function flipUv (dir, from, to) {
  const uv = {
    north: [to[0], 16 - to[1], from[0], 16 - from[1]],
    east: [from[2], 16 - to[1], to[2], 16 - from[1]],
    south: [from[0], 16 - to[1], to[0], 16 - from[1]],
    west: [from[2], 16 - to[1], to[2], 16 - from[1]]
  }[dir]
  return [uv[2], uv[1], uv[0], uv[3]]
}

function toElementBox (b) {
  const from = [b[0], b[1], b[2]].map(v => round(Math.min(Math.max(v, 0), 1) * 16))
  const to = [b[3], b[4], b[5]].map(v => round(Math.min(Math.max(v, 0), 1) * 16))
  if (to[0] - from[0] <= 0 || to[1] - from[1] <= 0 || to[2] - from[2] <= 0) return null
  return [from, to]
}

function stateBoxes (state, { preferOutline = false } = {}) {
  const collision = state.collision?.length ? state.collision : null
  const outline = state.outline ? [state.outline] : null
  const boxes = (preferOutline ? (outline || collision) : (collision || outline)) || [[0, 0, 0, 1, 1, 1]]
  return boxes.map(toElementBox).filter(Boolean)
}

const isFullBox = boxes => boxes.length === 1 && boxes[0][0].every(v => v === 0) && boxes[0][1].every(v => v === 16)

function sidePlane (dir, texture, tint) {
  const e = 0.8
  const planes = {
    north: [[0, 0, e], [16, 16, e]],
    south: [[0, 0, 16 - e], [16, 16, 16 - e]],
    west: [[e, 0, 0], [e, 16, 16]],
    east: [[16 - e, 0, 0], [16 - e, 16, 16]],
    down: [[0, e, 0], [16, e, 16]],
    up: [[0, 16 - e, 0], [16, 16 - e, 16]]
  }
  const [from, to] = planes[dir]
  return box(from, to, { texture, cull: false, tint })
}

function textureVars (faces) {
  const textures = {}
  DIRS.forEach((d, i) => { textures[d] = faces[i] })
  textures.particle = faces[1]
  return textures
}

function model (elements, textures, extra = {}) {
  return { textures, elements, ao: extra.ao ?? true, ...extra }
}

const cube = tint => [box([0, 0, 0], [16, 16, 16], { tint })]
const boxesToElements = (boxes, tint, opts = {}) => boxes.map(([from, to]) => box(from, to, { tint, ...opts }))

module.exports = { DIRS, DIR_VEC, OPPOSITE, AXIS, round, box, flipUv, toElementBox, stateBoxes, isFullBox, sidePlane, textureVars, model, cube, boxesToElements }
