/* eslint-env mocha */
const assert = require('assert')
const zlib = require('zlib')
const { encodePng, decodePng, crc32 } = require('../lib/image/png')

function chunk (type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])))
  return Buffer.concat([len, Buffer.from(type), data, crc])
}

// an Adam7 interlaced RGBA PNG, every row unfiltered (some of the Bedrock packs' textures are interlaced)
function interlaced ({ width, height, rgba }) {
  const passes = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
  const rows = []
  for (const [x0, y0, dx, dy] of passes) {
    for (let y = y0; y < height; y += dy) {
      const row = [0]
      for (let x = x0; x < width; x += dx) row.push(...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4))
      if (row.length > 1) rows.push(Buffer.from(row))
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[12] = 1
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

function image (width, height) {
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37 + (i >> 2) * 11) & 255
  return { width, height, rgba }
}

describe('PNG', () => {
  it('decodes what it encodes', () => {
    const img = image(16, 16)
    assert.deepStrictEqual(decodePng(encodePng(img)).rgba, img.rgba)
  })

  for (const [w, h] of [[16, 16], [5, 3], [1, 1], [16, 48]]) {
    it(`decodes an interlaced ${w} x ${h} PNG`, () => {
      const img = image(w, h)
      const out = decodePng(interlaced(img))
      assert.strictEqual(out.width, w)
      assert.strictEqual(out.height, h)
      assert.deepStrictEqual(out.rgba, img.rgba)
    })
  }
})
