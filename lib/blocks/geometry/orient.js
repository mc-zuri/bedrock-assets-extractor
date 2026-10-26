const { DIRS, DIR_VEC, OPPOSITE, round } = require('./boxes')

function buildRotationMatrix (axis, degree) {
  const radians = degree / 180 * Math.PI
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const axis0 = { x: 0, y: 1, z: 2 }[axis]
  const axis1 = (axis0 + 1) % 3
  const axis2 = (axis0 + 2) % 3
  const matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  matrix[axis0][axis0] = 1
  matrix[axis1][axis1] = cos
  matrix[axis1][axis2] = -sin
  matrix[axis2][axis1] = +sin
  matrix[axis2][axis2] = cos
  return matrix
}

function matmul3 (matrix, vector) {
  if (!matrix) return vector
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2]
  ]
}

function matmulmat3 (a, b) {
  const te = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]

  const a11 = a[0][0]; const a12 = a[1][0]; const a13 = a[2][0]
  const a21 = a[0][1]; const a22 = a[1][1]; const a23 = a[2][1]
  const a31 = a[0][2]; const a32 = a[1][2]; const a33 = a[2][2]

  const b11 = b[0][0]; const b12 = b[1][0]; const b13 = b[2][0]
  const b21 = b[0][1]; const b22 = b[1][1]; const b23 = b[2][1]
  const b31 = b[0][2]; const b32 = b[1][2]; const b33 = b[2][2]

  te[0][0] = a11 * b11 + a12 * b21 + a13 * b31
  te[1][0] = a11 * b12 + a12 * b22 + a13 * b32
  te[2][0] = a11 * b13 + a12 * b23 + a13 * b33

  te[0][1] = a21 * b11 + a22 * b21 + a23 * b31
  te[1][1] = a21 * b12 + a22 * b22 + a23 * b32
  te[2][1] = a21 * b13 + a22 * b23 + a23 * b33

  te[0][2] = a31 * b11 + a32 * b21 + a33 * b31
  te[1][2] = a31 * b12 + a32 * b22 + a33 * b32
  te[2][2] = a31 * b13 + a32 * b23 + a33 * b33

  return te
}

function rotationMatrix (x = 0, y = 0) {
  let m = null
  if (x) m = buildRotationMatrix('x', -x)
  if (y) m = m ? matmulmat3(m, buildRotationMatrix('y', -y)) : buildRotationMatrix('y', -y)
  return m
}

function rotateDir (dir, x, y) {
  const v = matmul3(rotationMatrix(x, y), DIR_VEC[dir]).map(Math.round)
  return DIRS.find(d => DIR_VEC[d].every((c, i) => c === v[i]))
}

function rotationBetween (from, to) {
  for (const x of [0, 90, 270, 180]) {
    for (const y of [0, 90, 180, 270]) {
      if (rotateDir(from, x, y) === to) return { x, y }
    }
  }
  return { x: 0, y: 0 }
}

function rotatePoint (p, x, y) {
  const m = rotationMatrix(x, y)
  return m ? matmul3(m, p.map(c => c - 8)).map(c => round(c + 8)) : p
}

function unrotateBox (from, to, x, y) {
  const m = rotationMatrix(x, y)
  if (!m) return [from, to]
  const inv = [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]]
  const corners = [from, to].map(p => matmul3(inv, p.map(c => c - 8)).map(c => round(c + 8)))
  return [
    [0, 1, 2].map(i => Math.min(corners[0][i], corners[1][i])),
    [0, 1, 2].map(i => Math.max(corners[0][i], corners[1][i]))
  ]
}

function rotateBox (from, to, x, y) {
  const corners = [from, to].map(p => rotatePoint(p, x, y))
  return [
    [0, 1, 2].map(i => Math.min(corners[0][i], corners[1][i])),
    [0, 1, 2].map(i => Math.max(corners[0][i], corners[1][i]))
  ]
}

function rotY (from, to, deg) {
  let a = [from[0], from[2]]
  let b = [to[0], to[2]]
  for (let i = 0; i < ((deg / 90) % 4 + 4) % 4; i++) {
    a = [16 - a[1], a[0]]
    b = [16 - b[1], b[0]]
  }
  return [
    [Math.min(a[0], b[0]), from[1], Math.min(a[1], b[1])],
    [Math.max(a[0], b[0]), to[1], Math.max(a[1], b[1])]
  ]
}

function rotateElements (elements, x, y, { renameVars = false } = {}) {
  const out = []
  for (const el of elements) {
    if (el.rotation) return null
    const [from, to] = rotateBox(el.from, el.to, x, y)
    const faces = {}
    for (const [dir, face] of Object.entries(el.faces)) {
      if (face.uv || face.rotation) return null
      const turned = rotateDir(dir, x, y)
      const f = { ...face }
      if (renameVars && f.texture === '#' + dir) f.texture = '#' + turned
      if (renameVars && f.texture === '#overlay_' + dir) f.texture = '#overlay_' + turned
      if (f.cullface) f.cullface = rotateDir(f.cullface, x, y)
      faces[turned] = f
    }
    out.push({ ...el, from, to, faces: orderFaces(faces) })
  }
  return out
}

const orderFaces = faces => Object.fromEntries(DIRS.filter(d => d in faces).map(d => [d, faces[d]]))

function stateFacing (props) {
  if (props['minecraft:cardinal_direction']) return props['minecraft:cardinal_direction']
  if (props['minecraft:facing_direction']) return props['minecraft:facing_direction']
  if (props.facing_direction !== undefined) return DIRS[+props.facing_direction]
  if (props.direction !== undefined) return ['south', 'west', 'north', 'east'][+props.direction]
  if (props.orientation) return props.orientation.split('_')[0]
  return null
}

const FRONT_PATTERNS = [/front/, /_face/, /observer_front/, /inner/, /barrel_top/, /_top_open/]
function baseFront (faces) {
  if (new Set(faces).size === 1) return null
  for (const pattern of FRONT_PATTERNS) {
    const order = [3, 2, 4, 5, 1, 0]
    for (const i of order) {
      if (pattern.test(faces[i]) && !/vertical/.test(faces[i])) return DIRS[i]
    }
  }
  return null
}

function fitRotationY (elements, outline) {
  if (!outline) return 0
  const target = [outline[0] + outline[3], outline[2] + outline[5]].map(v => v * 8)
  let best = 0
  let bestDist = Infinity
  for (const y of [0, 90, 180, 270]) {
    const m = rotationMatrix(0, y)
    let cx = 0
    let cz = 0
    let n = 0
    for (const el of elements) {
      for (const p of [el.from, el.to]) {
        const r = m ? matmul3(m, p.map(c => c - 8)).map(c => c + 8) : p
        cx += r[0]
        cz += r[2]
        n++
      }
    }
    const d = Math.hypot(cx / n - target[0], cz / n - target[1])
    if (d < bestDist) {
      bestDist = d
      best = y
    }
  }
  return best
}

module.exports = { buildRotationMatrix, matmul3, matmulmat3, rotationMatrix, rotateDir, rotationBetween, unrotateBox, rotateBox, rotateElements, orderFaces, rotY, stateFacing, baseFront, fitRotationY, OPPOSITE }
