const fs = require('fs')
const path = require('path')
const { decodePng, encodePng } = require('../image/png')
const { decodeTga } = require('../image/tga')
const { flipbooksByTexture, mcmetaOf, firstFrame } = require('./flipbooks')
const { isGrey } = require('../image/probe')

const FOLDERS = { 'textures/blocks/': 'blocks', 'textures/items/': 'items' }

class TextureStore {
  constructor (stack) {
    this.stack = stack
    this.flipbooks = flipbooksByTexture(stack.flipbooks())
    this.pbr = stack.pbrLayers()
    this.images = new Map()
    this.out = { blocks: new Map(), items: new Map() }
    this.byStem = new Map()
    this.taken = new Map()
    this.missing = new Set()
    this.greyCache = new Map()
  }

  stemOf (texturePath) {
    const file = texturePath && this.stack.resolveTexture(texturePath.replace(/\.(png|tga|jpg)$/, ''))
    if (!file || !/\.(png|tga)$/.test(file)) return null
    const stem = file.replace(/\.(png|tga)$/, '')
    return this.pbr.has(stem) ? null : stem
  }

  image (stem) {
    if (!this.images.has(stem)) {
      const file = this.stack.resolveTexture(stem)
      let img = null
      try {
        const buf = this.stack.read(file)
        img = file.endsWith('.tga') ? decodeTga(buf) : decodePng(buf)
      } catch { }
      this.images.set(stem, img)
    }
    return this.images.get(stem)
  }

  nameFor (stem, folder) {
    const root = Object.keys(FOLDERS).find(r => stem.startsWith(r) && FOLDERS[r] === folder)
    const base = stem.slice(stem.lastIndexOf('/') + 1)
    const rel = root ? stem.slice(root.length) : stem.replace(/^textures\//, '')
    for (const candidate of root ? [base, rel.replace(/\//g, '__')] : [rel.replace(/\//g, '__')]) {
      const owner = this.taken.get(folder + '/' + candidate)
      if (!owner || owner === stem) return candidate
    }
    let i = 2
    while (this.taken.has(`${folder}/${base}_${i}`)) i++
    return `${base}_${i}`
  }

  ref (texturePath, folder = 'blocks') {
    const stem = this.stemOf(texturePath)
    if (!stem || !this.image(stem)) {
      if (texturePath) this.missing.add(texturePath)
      return null
    }
    const key = folder + '\u0000' + stem
    if (this.byStem.has(key)) return this.byStem.get(key)
    const name = this.nameFor(stem, folder)
    this.taken.set(folder + '/' + name, stem)
    this.byStem.set(key, name)
    this.out[folder].set(name, { stem })
    return name
  }

  imageOf (name, folder = 'blocks') {
    const entry = this.out[folder].get(name)
    if (!entry) return null
    return entry.image ?? this.image(entry.stem)
  }

  isGrey (name) {
    if (this.greyCache.has(name)) return this.greyCache.get(name)
    const entry = this.out.blocks.get(name)
    const img = this.imageOf(name)
    const grey = !!img && isGrey(img, firstFrame(entry?.stem && this.flipbooks.get(entry.stem), img.width, img.height))
    this.greyCache.set(name, grey)
    return grey
  }

  add (name, image, folder = 'blocks', from = null) {
    let out = name
    for (let i = 2; this.out[folder].has(out) && this.out[folder].get(out).from !== from; i++) out = `${name}_${i}`
    if (!this.out[folder].has(out)) {
      this.out[folder].set(out, { image, from })
      this.taken.set(folder + '/' + out, '#generated')
    }
    return out
  }

  splitOverlay (name) {
    const overlay = name + '_overlay'
    if (!this.out.blocks.has(overlay)) {
      const img = this.imageOf(name)
      const base = Buffer.from(img.rgba)
      const over = Buffer.from(img.rgba)
      for (let i = 3; i < img.rgba.length; i += 4) {
        base[i] = 255
        over[i] = img.rgba[i] > 127 ? 255 : 0
      }
      const entry = this.out.blocks.get(name)
      this.out.blocks.set(name, { ...entry, image: { ...img, rgba: base } })
      this.add(overlay, { ...img, rgba: over }, 'blocks', name)
    }
    return [name, overlay]
  }

  tinted (name, color) {
    const hex = color.toString(16).padStart(6, '0')
    const out = `${name}_${hex}`
    if (!this.out.blocks.has(out)) {
      const img = this.imageOf(name)
      if (!img) return name
      const rgba = Buffer.from(img.rgba)
      const r = (color >> 16) & 255
      const g = (color >> 8) & 255
      const b = color & 255
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = rgba[i] * r / 255
        rgba[i + 1] = rgba[i + 1] * g / 255
        rgba[i + 2] = rgba[i + 2] * b / 255
      }
      this.add(out, { ...img, rgba }, 'blocks', name)
      const stem = this.out.blocks.get(name)?.stem
      if (stem) this.out.blocks.get(out).stem = stem
    }
    return out
  }

  write (dir) {
    for (const folder of Object.keys(this.out)) {
      const target = path.join(dir, folder)
      if (this.out[folder].size) fs.mkdirSync(target, { recursive: true })
      for (const [name, entry] of [...this.out[folder]].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
        const file = path.join(target, name + '.png')
        if (entry.image) {
          fs.writeFileSync(file, encodePng(entry.image))
        } else {
          const src = this.stack.resolveTexture(entry.stem)
          fs.writeFileSync(file, src.endsWith('.png') ? this.stack.read(src) : encodePng(this.image(entry.stem)))
        }
        const img = entry.image ?? this.image(entry.stem)
        const mcmeta = entry.stem && mcmetaOf(this.flipbooks.get(entry.stem), Math.floor(img.height / img.width))
        if (mcmeta) fs.writeFileSync(file + '.mcmeta', JSON.stringify(mcmeta, null, 2) + '\n')
      }
    }
  }
}

module.exports = { TextureStore }
