const { readFileSync, readdirSync, statSync, existsSync } = require('fs')
const { join } = require('path')
const { readBrarchive } = require('./brarchive')
const { parseJsonc } = require('./jsonc')
const { compareVersions } = require('./versions')
const { decodeTga } = require('../image/tga')
const { encodePng } = require('../image/png')

function readPackDir (dir, remap = null) {
  const files = new Map()
  const archived = new Map()
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      const a = join(abs, name)
      const r = rel ? rel + '/' + name : name
      if (statSync(a).isDirectory()) {
        if (name === 'sounds' && !r.startsWith('__brarchive')) continue
        walk(a, r)
      } else if (r.startsWith('__brarchive/') && name.endsWith('.brarchive')) {
        const prefix = r.slice('__brarchive/'.length, -'.brarchive'.length)
        const buf = readFileSync(a)
        if (buf.length < 16) continue
        for (const e of readBrarchive(buf)) {
          const path = prefix + '/' + e.name
          if (e.data().length) archived.set(path, e.data)
        }
      } else if (!r.startsWith('__brarchive/')) {
        const key = remap && r.startsWith(remap.from + '/') ? remap.to + r.slice(remap.from.length) : r
        files.set(key, () => readFileSync(a))
      }
    }
  }
  walk(dir, '')
  for (const [path, read] of archived) if (!files.has(path)) files.set(path, read)
  return files
}

function readPocketAtlases (imagesDir) {
  const files = new Map()
  const atlas = (meta, image, folder, jsonPath) => {
    const metaFile = join(imagesDir, meta)
    const imageFile = join(imagesDir, image + '.tga')
    if (!existsSync(metaFile) || !existsSync(imageFile)) return
    const img = decodeTga(readFileSync(imageFile))
    const textureData = {}
    for (const { name, uvs } of JSON.parse(readFileSync(metaFile, 'utf8'))) {
      const paths = uvs.map(([x0, y0, x1, y1, w, h], i) => {
        const sx = img.width / w
        const sy = img.height / h
        const px = Math.round(x0 * sx)
        const py = Math.round(y0 * sy)
        const width = Math.max(1, Math.round((x1 - x0) * sx))
        const height = Math.max(1, Math.round((y1 - y0) * sy))
        const rgba = Buffer.alloc(width * height * 4)
        for (let y = 0; y < height; y++) {
          const from = ((py + y) * img.width + px) * 4
          img.rgba.copy(rgba, y * width * 4, from, from + width * 4)
        }
        const path = `textures/${folder}/${name}${i ? '_' + i : ''}`
        const png = encodePng({ width, height, rgba })
        files.set(path + '.png', () => png)
        return path
      })
      textureData[name] = { textures: paths.length === 1 ? paths[0] : paths }
    }
    const json = Buffer.from(JSON.stringify({ texture_data: textureData }))
    files.set(jsonPath, () => json)
  }
  for (const [path, read] of readPackDir(imagesDir)) {
    if (/^(terrain-atlas|items-opaque)|\.(meta|images)$/.test(path)) continue
    files.set('textures/' + path, read)
  }
  atlas('terrain.meta', 'terrain-atlas', 'blocks', 'textures/terrain_texture.json')
  atlas('items.meta', 'items-opaque', 'items', 'textures/item_texture.json')
  return files
}

function clientPackStack (resourcePacks) {
  const versioned = readdirSync(resourcePacks)
    .map(name => /^vanilla_(\d+(?:\.\d+)*)$/.exec(name))
    .filter(Boolean)
    .sort((a, b) => compareVersions(a[1], b[1]))
    .map(m => m[0])

  const experimental = readdirSync(resourcePacks).filter(name => name.startsWith('experimental_')).sort()
  return [...experimental, 'vanilla', ...versioned].filter(name => existsSync(join(resourcePacks, name)))
}

const TEXTURE_EXT = /\.(png|tga|jpg)$/

class PackStack {
  constructor (layers) {
    this.layers = layers // [{ name, files }]
    this.files = new Map()
    for (const { files } of layers) for (const [path, read] of files) this.files.set(path, read)
  }

  static fromClient (resourcePacks) {
    return new PackStack(clientPackStack(resourcePacks).map(name => ({ name, files: readPackDir(join(resourcePacks, name)) })))
  }

  static fromDir (dir, name = 'vanilla', remap = null) {
    return new PackStack([{ name, files: readPackDir(dir, remap) }])
  }

  static fromInstall (dataDir) {
    if (existsSync(join(dataDir, 'resource_packs'))) return PackStack.fromClient(join(dataDir, 'resource_packs'))
    if (existsSync(join(dataDir, 'resourcepacks', 'vanilla'))) {
      return PackStack.fromDir(join(dataDir, 'resourcepacks', 'vanilla'), 'vanilla', { from: 'images', to: 'textures' })
    }
    return new PackStack([{ name: 'images', files: readPocketAtlases(join(dataDir, 'images')) }])
  }

  static behaviorFromInstall (dataDir) {
    const dir = join(dataDir, 'behavior_packs')
    return existsSync(dir) ? PackStack.fromClient(dir) : null
  }

  has (path) { return this.files.has(path) }
  read (path) { return this.files.get(path)?.() }

  json (path) {
    const buf = this.read(path)
    return buf ? parseJsonc(buf.toString('utf8')) : undefined
  }

  jsonLayers (path) {
    const out = []
    for (const { name, files } of this.layers) {
      const read = files.get(path)
      if (!read) continue
      try {
        out.push(parseJsonc(read().toString('utf8')))
      } catch (err) {
        throw new Error(`${name}/${path}: ${err.message}`)
      }
    }
    return out
  }

  textureData (path) {
    const merged = {}
    for (const layer of this.jsonLayers(path)) Object.assign(merged, layer.texture_data)
    return merged
  }

  blocks () {
    const merged = {}
    for (const layer of this.jsonLayers('blocks.json')) {
      for (const [key, value] of Object.entries(layer)) {
        if (key === 'format_version') continue
        merged[key.replace(/^minecraft:/, '')] = value
      }
    }
    return merged
  }

  flipbooks () {
    const byTile = new Map()
    for (const layer of this.jsonLayers('textures/flipbook_textures.json')) {
      for (const entry of layer) byTile.set(entry.atlas_tile, entry)
    }
    return [...byTile.values()]
  }

  biomesClient () {
    const merged = {}
    for (const layer of this.jsonLayers('biomes_client.json')) Object.assign(merged, layer.biomes)
    return { biomes: merged }
  }

  pbrLayers () {
    const layers = new Set()
    for (const path of this.files.keys()) {
      if (!path.endsWith('.texture_set.json')) continue
      let set
      try { set = this.json(path)?.['minecraft:texture_set'] } catch { continue }
      if (!set) continue
      const dir = path.slice(0, path.lastIndexOf('/') + 1)
      for (const key of ['metalness_emissive_roughness', 'metalness_emissive_roughness_subsurface', 'normal', 'heightmap']) {
        const v = set[key]
        if (typeof v === 'string' && !v.startsWith('#')) layers.add((v.includes('/') ? v : dir + v).replace(TEXTURE_EXT, ''))
      }
    }
    return layers
  }

  resolveTexture (path) {
    if (this.resourceIds === undefined) {
      this.resourceIds = new Map()
      for (const layer of this.jsonLayers('resources.json')) {
        for (const [id, file] of Object.entries(layer.resources?.textures ?? {})) this.resourceIds.set(id, file.replace(TEXTURE_EXT, ''))
      }
    }
    path = this.resourceIds.get(path) ?? path
    if (path?.startsWith('images/')) path = 'textures/' + path.slice('images/'.length) // 0.15's packs
    if (!this.textureStems) {
      this.textureStems = new Map()
      for (const { files } of this.layers) {
        for (const file of files.keys()) {
          const m = /^(textures\/.+)\.(png|tga|jpg)$/.exec(file)
          if (m) this.textureStems.set(m[1], file)
        }
      }
    }
    return this.textureStems.get(path) ?? (this.files.has(path) ? path : null)
  }

  textureImages () {
    this.resolveTexture('')
    return this.textureStems
  }
}

module.exports = { PackStack, readPackDir, readPocketAtlases, clientPackStack, TEXTURE_EXT }
