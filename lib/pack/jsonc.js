function parseJsonc (text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(stripJsonc(text))
  }
}

function stripJsonc (text) {
  const out = []
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      out.push(c)
      if (c === '\\') out.push(text[++i])
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
      out.push(c)
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out.push('\n')
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else if (c === '}' || c === ']') {
      let k = out.length - 1
      while (k >= 0 && /\s/.test(out[k])) k--
      if (k >= 0 && out[k] === ',') out[k] = ''
      out.push(c)
    } else {
      out.push(c)
    }
  }
  return out.join('')
}

module.exports = { parseJsonc }
