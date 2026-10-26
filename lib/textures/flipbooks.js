function flipbooksByTexture (entries) {
  const byTexture = new Map()
  for (const f of entries ?? []) if (f.flipbook_texture) byTexture.set(f.flipbook_texture, f)
  return byTexture
}

function mcmetaOf (flipbook, count) {
  if (!flipbook || count <= 1) return null
  const animation = { frametime: flipbook.ticks_per_frame || 1 }
  if (flipbook.frames?.length) {
    const frames = flipbook.frames.map(i => i % count)
    if (frames.length !== count || frames.some((f, i) => f !== i)) animation.frames = frames
  }
  return { animation }
}

function firstFrame (flipbook, width, height) {
  const count = Math.floor(height / width)
  if (!flipbook || count <= 1) return [0, height]
  const first = flipbook.frames?.length ? flipbook.frames[0] % count : 0
  return [first * width, (first + 1) * width]
}

module.exports = { flipbooksByTexture, mcmetaOf, firstFrame }
