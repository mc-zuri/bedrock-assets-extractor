const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { compareVersions } = require('./pack/versions')

function digest (dir) {
  const hash = crypto.createHash('sha1')
  const walk = rel => {
    for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
      const r = rel ? rel + '/' + name : name
      if (r === 'meta.json') continue
      const abs = path.join(dir, r)
      if (fs.statSync(abs).isDirectory()) walk(r)
      else hash.update(r + '\0').update(fs.readFileSync(abs)).update('\0')
    }
  }
  walk('')
  return hash.digest('hex')
}

function aliasVersions (out, log = console.log) {
  const indexFile = path.join(out, 'versions.json')
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {}
  const folders = fs.readdirSync(out).filter(v => /^\d/.test(v) && fs.statSync(path.join(out, v)).isDirectory()).sort(compareVersions)
  let previous = null
  for (const version of folders) {
    const d = digest(path.join(out, version))
    if (previous && previous.digest === d) {
      fs.rmSync(path.join(out, version), { recursive: true, force: true })
      index[version] = previous.version
      log(`bedrock ${version}: the same as ${previous.version}`)
      continue
    }
    index[version] = version
    previous = { version, digest: d }
  }

  for (const [version, folder] of Object.entries(index)) {
    if (!fs.existsSync(path.join(out, folder))) index[version] = index[folder] !== folder ? index[folder] : undefined
  }
  const sorted = Object.fromEntries(Object.keys(index).filter(v => index[v]).sort(compareVersions).map(v => [v, index[v]]))
  fs.writeFileSync(indexFile, JSON.stringify(sorted, null, 2) + '\n')
  return sorted
}

module.exports = { aliasVersions }
