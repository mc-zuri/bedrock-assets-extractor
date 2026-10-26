const zlib = require('zlib')

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32 (buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk (type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng ({ width, height, rgba }) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function pngSize (buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]

function decodePng (buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let o = 8
  let width, height, depth, colorType, interlace
  let palette = null
  let transparency = null
  const idat = []
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o)
    const type = buf.toString('ascii', o + 4, o + 8)
    const data = buf.subarray(o + 8, o + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') transparency = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    o += 12 + len
  }
  const channels = CHANNELS[colorType]
  if (!channels) throw new Error(`PNG color type ${colorType}`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = Math.max(1, channels * depth / 8)
  const key = transparency && (colorType === 0 || colorType === 2)
    ? Array.from({ length: colorType === 0 ? 1 : 3 }, (_, i) => transparency.readUInt16BE(i * 2))
    : null
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1

  function image (offset, w, h) {
    const stride = Math.ceil(w * channels * depth / 8)
    const px = Buffer.alloc(h * stride)
    for (let y = 0; y < h; y++) {
      const row = offset + y * (stride + 1)
      const filter = raw[row]
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? px[y * stride + x - bpp] : 0
        const b = y ? px[(y - 1) * stride + x] : 0
        const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0
        let v = raw[row + 1 + x]
        if (filter === 1) v += a
        else if (filter === 2) v += b
        else if (filter === 3) v += (a + b) >> 1
        else if (filter === 4) {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        }
        px[y * stride + x] = v & 255
      }
    }

    const sample = depth === 8
      ? (y, i) => px[y * stride + i]
      : depth === 16
        ? (y, i) => px[y * stride + i * 2]
        : (y, i) => (px[y * stride + ((i * depth) >> 3)] >> (8 - depth - ((i * depth) & 7))) & ((1 << depth) - 1)
    const full = (y, i) => depth === 16 ? px.readUInt16BE(y * stride + i * 2) : sample(y, i)
    const rgba = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4
        const s = x * channels
        if (colorType === 3) {
          const index = sample(y, s)
          rgba[d] = palette[index * 3]
          rgba[d + 1] = palette[index * 3 + 1]
          rgba[d + 2] = palette[index * 3 + 2]
          rgba[d + 3] = transparency && index < transparency.length ? transparency[index] : 255
        } else if (colorType === 0 || colorType === 4) {
          const g = Math.round(sample(y, s) * scale)
          rgba[d] = rgba[d + 1] = rgba[d + 2] = g
          rgba[d + 3] = colorType === 4 ? sample(y, s + 1) : (key && full(y, s) === key[0] ? 0 : 255)
        } else {
          rgba[d] = sample(y, s)
          rgba[d + 1] = sample(y, s + 1)
          rgba[d + 2] = sample(y, s + 2)
          rgba[d + 3] = colorType === 6
            ? sample(y, s + 3)
            : (key && full(y, s) === key[0] && full(y, s + 1) === key[1] && full(y, s + 2) === key[2] ? 0 : 255)
        }
      }
    }
    return { rgba, size: h * (stride + 1) }
  }

  if (!interlace) return { width, height, rgba: image(0, width, height).rgba }
  const rgba = Buffer.alloc(width * height * 4)
  let offset = 0
  for (const [x0, y0, dx, dy] of ADAM7) {
    const w = Math.ceil((width - x0) / dx)
    const h = Math.ceil((height - y0) / dy)
    if (w <= 0 || h <= 0) continue
    const pass = image(offset, w, h)
    offset += pass.size
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) pass.rgba.copy(rgba, ((y0 + y * dy) * width + x0 + x * dx) * 4, (y * w + x) * 4, (y * w + x) * 4 + 4)
    }
  }
  return { width, height, rgba }
}

module.exports = { encodePng, decodePng, pngSize, crc32 }
