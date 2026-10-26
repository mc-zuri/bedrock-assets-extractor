const MAGIC = Buffer.from([0x7f, 0x4d, 0x43, 0x42]) // \x7fMCB

const isCompiled = buf => buf.length >= 4 && buf.subarray(0, 4).equals(MAGIC)

const fnv1a = s => {
  let h = 0x811c9dc5
  for (const c of Buffer.from(s, 'utf8')) { h ^= c; h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}

const leb128 = n => {
  const out = []
  do {
    let b = n & 0x7f
    n >>>= 7
    if (n) b |= 0x80
    out.push(b)
  } while (n)
  return Buffer.from(out)
}

const encoded = s => Buffer.concat([leb128(Buffer.byteLength(s, 'utf8')), Buffer.from(s, 'utf8')])

function compiledIdentifier (buf) {
  let i = 4 + 2 + 2 + 4 // magic, version, header
  const strings = []
  while (strings.length < 2 && i < buf.length) {
    let n = 0
    let shift = 0
    let c
    do { c = buf[i++]; n |= (c & 0x7f) << shift; shift += 7 } while (c & 0x80 && i < buf.length)
    strings.push(buf.subarray(i, i + n).toString('utf8'))
    i += n
  }
  return strings[0] === 'particle_effect' ? strings[1] ?? null : null
}

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i
const channels = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)

function walk (v, strings = [], numbers = [], key = null) {
  if (typeof v === 'string') {
    if (HEX.test(v)) numbers.push(...channels(v))
    else strings.push(v)
  } else if (typeof v === 'number') numbers.push(v)
  else if (Array.isArray(v)) v.forEach(x => walk(x, strings, numbers))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (key === 'gradient' && Number.isFinite(Number(k))) strings.push(Number(k).toFixed(6))
      else if (key === 'curves' || key === 'events' || /^(variable|v)\./.test(k)) strings.push(k)
      walk(x, strings, numbers, k)
    }
  }
  return [strings, numbers]
}

function matchesCompiled (buf, effect) {
  const diffs = []
  const d = effect.description ?? {}
  const brp = d.basic_render_parameters ?? {}
  for (const s of [d.identifier, brp.material, brp.texture]) {
    if (typeof s === 'string' && buf.indexOf(encoded(s)) === -1) diffs.push(`header ${s}`)
  }
  for (const name of Object.keys(effect.components ?? {})) {
    if (buf.indexOf(Buffer.from(Uint32Array.of(fnv1a(name)).buffer)) === -1) diffs.push(`component ${name}`)
  }
  const [strings, numbers] = walk(effect)
  const rest = Buffer.from(buf)
  rest.fill(0, 0, 12)
  for (const s of [...new Set(strings)].sort((a, b) => b.length - a.length)) {
    const e = encoded(s)
    let at = rest.indexOf(e)
    const raw = Buffer.from(s, 'utf8')
    if (at === -1 && rest.indexOf(raw) === -1) { diffs.push(`string ${JSON.stringify(s).slice(0, 60)}`); continue }
    while (at !== -1) { rest.fill(0, at, at + e.length); at = rest.indexOf(e, at + e.length) }
  }
  rest.fill(0, 12, 12 + 1 + 'particle_effect'.length)
  const leftover = /[\x20-\x7e]{6,}/.exec(rest.toString('latin1'))
  if (leftover) diffs.push(`text the compiled file has and the text lacks: ${JSON.stringify(leftover[0].slice(0, 60))}`)
  for (const n of new Set(numbers)) {
    if (n === 0 || n === 1) continue
    const asFloat = buf.indexOf(Buffer.from(Float32Array.of(n).buffer)) !== -1
    const asInt = Number.isInteger(n) && Math.abs(n) < 2 ** 31 && buf.indexOf(Buffer.from(Int32Array.of(n).buffer)) !== -1
    if (!asFloat && !asInt) diffs.push(`number ${n}`)
  }
  return diffs
}

module.exports = { isCompiled, compiledIdentifier, matchesCompiled, fnv1a, MAGIC }
