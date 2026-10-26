// .brarchive: magic (8 bytes), entry count (u32), version (u32 = 1), then per entry 256 bytes: name length (u8), name
// (247 bytes), offset (u32) and size (u32) into the data that follows the entry table.
const ENTRY = 256
const HEADER = 16

function readBrarchive (buf) {
  const count = buf.readUInt32LE(8)
  const version = buf.readUInt32LE(12)
  if (version !== 1) throw new Error(`unknown brarchive version ${version}`)
  const base = HEADER + count * ENTRY
  const entries = []
  for (let i = 0; i < count; i++) {
    const o = HEADER + i * ENTRY
    const name = buf.toString('utf8', o + 1, o + 1 + buf[o])
    const offset = buf.readUInt32LE(o + 248)
    const size = buf.readUInt32LE(o + 252)
    entries.push({ name, data: () => buf.subarray(base + offset, base + offset + size) })
  }
  return entries
}

module.exports = { readBrarchive }
