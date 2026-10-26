const { encodePng } = require('./png')

function decodeTga (buf) {
  const idLength = buf[0]
  const colorMapType = buf[1]
  const imageType = buf[2]
  const colorMapLength = buf.readUInt16LE(5)
  const colorMapDepth = buf[7]
  const width = buf.readUInt16LE(12)
  const height = buf.readUInt16LE(14)
  const depth = buf[16]
  const descriptor = buf[17]

  if (buf.toString('latin1', 0, 4) === '8BPS') throw new Error('not a TGA: a Photoshop document, broken in the game\'s own pack')
  if (![1, 2, 9, 10].includes(imageType)) throw new Error(`unsupported TGA image type ${imageType}`)
  const mapped = imageType === 1 || imageType === 9
  if (mapped ? depth !== 8 : depth !== 24 && depth !== 32) throw new Error(`unsupported TGA depth ${depth}`)
  const bpp = depth / 8
  let offset = 18 + idLength
  let palette = null
  const entryBytes = Math.ceil(colorMapDepth / 8)
  if (colorMapType) {
    palette = buf.subarray(offset, offset + colorMapLength * entryBytes)
    offset += colorMapLength * entryBytes
  }
  const pixels = width * height
  const raw = Buffer.alloc(pixels * bpp)
  if (imageType === 1 || imageType === 2) {
    buf.copy(raw, 0, offset, offset + raw.length)
  } else {
    let p = 0
    while (p < pixels) {
      const header = buf[offset++]
      const count = (header & 0x7f) + 1
      if (header & 0x80) {
        for (let i = 0; i < count; i++) buf.copy(raw, (p + i) * bpp, offset, offset + bpp)
        offset += bpp
      } else {
        buf.copy(raw, p * bpp, offset, offset + count * bpp)
        offset += count * bpp
      }
      p += count
    }
  }
  const topFirst = (descriptor & 0x20) !== 0
  const rightFirst = (descriptor & 0x10) !== 0
  const rgba = Buffer.alloc(pixels * 4)
  for (let y = 0; y < height; y++) {
    const srcRow = topFirst ? y : height - 1 - y
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4
      let src = raw
      let s = (srcRow * width + (rightFirst ? width - 1 - x : x)) * bpp
      let alpha = bpp === 4
      if (mapped) {
        src = palette
        s = raw[s] * entryBytes
        alpha = entryBytes === 4
      }
      rgba[d] = src[s + 2]
      rgba[d + 1] = src[s + 1]
      rgba[d + 2] = src[s]
      rgba[d + 3] = alpha ? src[s + 3] : 255
    }
  }
  return { width, height, rgba }
}

const tgaToPng = buf => encodePng(decodeTga(buf))

module.exports = { decodeTga, tgaToPng }
