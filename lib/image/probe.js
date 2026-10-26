function meanSaturation ({ width, rgba }, y0, y1) {
  let sum = 0
  let n = 0
  for (let i = y0 * width * 4; i < y1 * width * 4; i += 4) {
    if (rgba[i + 3] < 16) continue
    const max = Math.max(rgba[i], rgba[i + 1], rgba[i + 2])
    const min = Math.min(rgba[i], rgba[i + 1], rgba[i + 2])
    sum += max === 0 ? 0 : (max - min) / max
    n++
  }
  return n ? sum / n : null
}

function isGrey (image, frame = [0, image.height]) {
  const saturation = meanSaturation(image, frame[0], Math.min(frame[1], image.height))
  return saturation !== null && saturation < 0.12
}

module.exports = { isGrey, meanSaturation }
