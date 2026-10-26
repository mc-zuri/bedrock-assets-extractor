// '1.21.100' -> [1, 21, 100]
const parseVersion = v => v.split('.').map(Number)

function compareVersions (a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}

const family = v => { const [a, b, c = 0] = parseVersion(v); return `${a}.${b}.${Math.floor(c / 10)}` }
const minor = v => { const [a, b] = parseVersion(v); return `${a}.${b}` }

module.exports = { parseVersion, compareVersions, family, minor }
