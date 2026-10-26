const fs = require('fs')
const path = require('path')
const { exportEntities, entityTextures, geometryDefinitions } = require('./index')
const { resolveGeometry } = require('./geometry')
const { exportParticles, textEffects } = require('../particles')
const { decodePng, encodePng } = require('../image/png')
const { decodeTga } = require('../image/tga')
const { substituteFor } = require('../textures/substitute')

class TextureWriter {
  constructor (stack, dir) {
    this.stack = stack
    this.dir = dir
    this.written = new Map()
  }

  image (texturePath) {
    const file = this.stack.resolveTexture(texturePath.replace(/\.(png|tga)$/, ''))
    if (!file || !/\.(png|tga)$/.test(file)) return null
    try {
      const buf = this.stack.read(file)
      return file.endsWith('.tga') ? decodeTga(buf) : decodePng(buf)
    } catch {
      return null
    }
  }

  copy (texturePath, as = texturePath) {
    const key = as.replace(/\.(png|tga)$/, '')
    const attempt = key + '\u0000' + texturePath
    if (this.written.get(key) === true) return true
    if (!this.written.has(attempt)) {
      const img = this.image(texturePath)
      if (img) {
        const file = path.join(this.dir, key.replace(/^textures\//, '') + '.png')
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, encodePng(img))
        this.written.set(key, true)
      }
      this.written.set(attempt, !!img)
    }
    return this.written.get(attempt)
  }
}

// a reference version's texture path in a 0.14 - 1.0 pack: the same path, else the one under textures/mob/ (0.14,
// 0.15), else (armour) under textures/armor/
function legacyTexture (stack) {
  return texturePath => {
    const rest = texturePath.replace(/^textures\/entity\//, '')
    const parts = rest.split('/')
    const candidates = [texturePath, 'textures/mob/' + rest, 'textures/mob/' + parts[parts.length - 1],
      texturePath.replace(/^textures\/models\/armor\//, 'textures/armor/')]
    return candidates.find(p => stack.resolveTexture(p)) ?? null
  }
}

// a 0.14 - 1.0 version's entities.json: the reference's (refOut), its textures and geometry the version's own where it
// has them; geometrySources: the stacks to take geometry from, in order (its own, then, for 0.14, its nearest newer
// client's)
function legacyEntities (refOut, own, geometrySources, source, version) {
  const find = legacyTexture(own)
  const entities = {}
  for (const [id, e] of Object.entries(refOut.entities)) {
    const textures = {}
    for (const [key, texture] of Object.entries(e.textures ?? {})) {
      const found = typeof texture === 'string' && texture.startsWith('textures/') ? find(texture) : null
      if (found) textures[key] = found
    }
    if (!Object.keys(textures).length || (e.textures?.default && !textures.default)) continue
    entities[id] = { ...e, textures }
  }
  const geometry = { ...refOut.geometry }
  const defs = geometrySources.map(stack => geometryDefinitions(stack, []))
  const used = new Set(Object.values(entities).flatMap(e => Object.values(e.geometry ?? {})))
  for (const id of used) {
    const plain = id.replace(/\.v\d+(\.\d+)*$/, '')
    for (const d of defs) {
      const hit = [plain, id].find(g => d.has(g))
      if (!hit) continue
      try {
        geometry[id] = resolveGeometry(hit, d)
        break
      } catch { }
    }
  }
  const files = Object.fromEntries(Object.keys(entities).map(id => [id, refOut.files?.[id]]))
  return { ...refOut, version, source, entities, files, attachables: {}, attachable_files: {}, geometry, entity_properties: {} }
}

// the text of the particle effects of the bedrock-samples release of a version's hotfix family (the version's own,
// else the newest), for the compiled ones: identifier -> { effect, source }
function compiledTextOf (version, sources, cacheDir, { checkoutGitSource, family, compareVersions }) {
  return () => {
    const samples = sources.filter(s => s.kind === 'bedrock-samples' && family(s.version) === family(version))
      .sort((a, b) => (compareVersions(a.version, version) === 0 ? -1 : 0) - (compareVersions(b.version, version) === 0 ? -1 : 0) || compareVersions(b.version, a.version))
    const same = samples[0]
    if (!same) return new Map()
    const dir = path.join(checkoutGitSource(same, cacheDir).dir, 'particles')
    const files = []
    const walk = (abs, rel) => {
      for (const name of fs.existsSync(abs) ? fs.readdirSync(abs) : []) {
        const a = path.join(abs, name)
        if (fs.statSync(a).isDirectory()) walk(a, rel + name + '/')
        else if (name.endsWith('.json')) files.push([rel + name, fs.readFileSync(a, 'utf8')])
      }
    }
    walk(dir, 'particles/')
    return textEffects(files, `bedrock-samples ${same.ref}`)
  }
}

// options: { version, own (the version's own packs), source (describeSource of its source), dir, materialsTable,
// compiledText, legacy: { referenceOut, geometrySources } for 0.14 - 1.0 }
function exportEntityAssets ({ version, own, source, dir, materialsTable = null, compiledText = null, legacy = null }) {
  const writer = new TextureWriter(own, dir)
  const write = (file, value) => fs.writeFileSync(path.join(dir, file), JSON.stringify(value) + '\n')
  let out = null
  if (legacy?.referenceOut) out = legacyEntities(legacy.referenceOut, own, legacy.geometrySources, source, version)
  else out = exportEntities({ version, stack: own, source, materialsTable })?.out ?? null
  const missingTextures = []
  if (out) {
    // (a texture the packs name but lack is written as its nearest: ../textures/substitute.js)
    const stems = [...own.files.keys()].filter(f => /^textures\/.+\.(png|tga)$/.test(f)).map(f => f.replace(/\.(png|tga)$/, ''))
    for (const p of [...entityTextures(out.entities, out.attachables)].sort()) {
      if (writer.copy(p)) continue
      const from = substituteFor(p, q => !!own.resolveTexture(q), stems)
      if (!from || !writer.copy(from, p)) missingTextures.push(p)
    }
    // (the players' skins of the packs: Steve and Alex, under textures/entity/, where a 0.14 or 0.15 pack has them
    // under textures/mob/)
    for (const name of ['steve', 'alex']) writer.copy(`textures/entity/${name}`) || writer.copy(`textures/mob/${name}`, `textures/entity/${name}`)
    // (and its armour's textures: before 1.26.10 the client drew armour in code, with them; the viewer draws it with
    // the newest version's attachables, where the version has their textures)
    for (const file of own.files.keys()) {
      const m = /^(textures\/models\/armor\/[^/]+?)\.(png|tga)$/.exec(file)
      if (m && !/_(mers|normal|heightmap)$/.test(m[1])) writer.copy(m[1])
    }
    // (its version and source are meta.json's: versions whose resources are the same share a folder)
    const { version: _, source: __, ...resources } = out
    write('entities.json', resources)
  }
  const particles = exportParticles({ stack: own, textures: { ref: p => writer.copy(p) ? p : null, isPng: () => true }, compiledText })
  if (particles) write('particles.json', particles.out)
  return {
    entities: out ? Object.keys(out.entities).length : 0,
    attachables: out ? Object.keys(out.attachables).length : 0,
    animations: out ? Object.keys(out.animations).length : 0,
    entitiesMissing: out?.missing,
    missingTextures,
    particles: particles ? Object.keys(particles.out.particles).length : 0,
    particlesCompiled: particles ? { from: particles.compiled.from, unmatched: Object.keys(particles.compiled.unmatched).length } : undefined
  }
}

module.exports = { exportEntityAssets, compiledTextOf, legacyEntities, TextureWriter }
