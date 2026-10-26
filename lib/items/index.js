const { itemResolver } = require('./resolve')
const { itemIconsFor } = require('./icons')
const { encodePng } = require('../image/png')

const hex = c => parseInt(String(c).replace(/^#/, ''), 16)

function tint (img, color, mask = null) {
  const rgba = Buffer.from(img.rgba)
  const r = (color >> 16) & 255
  const g = (color >> 8) & 255
  const b = color & 255
  for (let i = 0; i < rgba.length; i += 4) {
    if (mask && mask.rgba[i + 3] < 128) continue
    rgba[i] = rgba[i] * r / 255
    rgba[i + 1] = rgba[i + 1] * g / 255
    rgba[i + 2] = rgba[i + 2] * b / 255
  }
  return { ...img, rgba }
}

function over (a, b) {
  const rgba = Buffer.from(a.rgba)
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = b.rgba[i + 3] / 255
    if (!alpha) continue
    for (let c = 0; c < 3; c++) rgba[i + c] = b.rgba[i + c] * alpha + rgba[i + c] * (1 - alpha)
    rgba[i + 3] = Math.max(rgba[i + 3], b.rgba[i + 3])
  }
  return { ...a, rgba }
}

const STAND_INS = { photo_item: 'camera' }
const PLAIN_EGG = { path: 'textures/items/spawn_egg', overlay: 'textures/items/spawn_egg_overlay', tint: { base: 'ffffff', overlay: 'ffffff' } }

const FLAT_SHAPES = new Set([
  'Torch', 'DoublesidedWideCrossTexture', 'DoublesidedDoublePlant', 'DoublesidedRows', 'Rail', 'Ladder', 'Vine', 'MetalBars',
  'DoubleSideFence', 'Lever', 'Tripwire', 'TripwireHook', 'Door', 'Sign', 'Lilypad', 'Seagrass', 'Kelp', 'CoralFan',
  'CrystalCluster', 'PointedDripstone', 'Fire', 'RedDust', 'Repeater', 'Comparator', 'Stem', 'CaveVine', 'WeepingVine',
  'TwistingVine', 'Bamboo', 'BambooSapling', 'SweetBerryBush', 'MultifaceBlock', 'Eyeblossom', 'FireflyBush', 'PitcherCrop',
  'PitcherPlant', 'FlowerBed', 'MangrovePropagule', 'SmallDripleaf', 'BigDripleaf', 'SporeBlossom', 'Cocoa', 'Chain',
  'Candle', 'Lantern', 'CameraFacingSprite', 'StructureVoid', 'Water', 'Invisible', 'BubbleColumn', 'FrogSpawn', 'Bed',
  'Bell', 'BrewingStand', 'Cauldron', 'Hopper', 'FlowerPot', 'ItemFrame', 'GlowItemFrame', 'Campfire', 'EndGateway',
  'EndPortal', 'BlockActorRendererOnly'
])

function itemModel (name, icon) {
  const block = icon?.block && !FLAT_SHAPES.has(icon.block.shape) ? icon.block.name : null
  return block ? 'minecraft:block/' + block : name
}

const LEGACY_NAMES = { steak: 'cooked_beef', redstone_comparator: 'comparator' }
function legacyItemNames (mcData, reference) {
  const byDisplayName = new Map(reference.itemsArray.map(item => [item.displayName.toLowerCase(), item.name]))
  return item => [LEGACY_NAMES[item.name], byDisplayName.get(item.displayName.toLowerCase()), mcData.blocks[item.id]?.name].filter(Boolean)
}

const firstFrame = img => img.height > img.width && img.height % img.width === 0
  ? { width: img.width, height: img.width, rgba: img.rgba.subarray(0, img.width * img.width * 4) }
  : img

function exportItems ({ version, stack, mcData, store, itemBlocks, resolveBlock, itemIcons, reference = null }) {
  const resolve = itemResolver({ stack, blocks: itemBlocks, blockResolver: resolveBlock, packIcons: itemIconsFor(itemIcons, version) })
  const itemsTextures = []
  const textureContent = []
  const unresolved = []
  const imageOf = path => {
    const stem = store.stemOf(path)
    return stem ? store.image(stem) : null
  }
  const legacyNames = reference ? legacyItemNames(mcData, reference) : () => []
  const iconOf = name => {
    let icon = resolve(name)
    if (icon && !imageOf(icon.path) && itemBlocks.get(name)) icon = { path: itemBlocks.get(name).north, colors: itemBlocks.get(name).colors }
    return icon && imageOf(icon.path) ? icon : null
  }
  for (const item of mcData.itemsArray) {
    const name = item.name
    let icon = iconOf(name)
    for (const other of icon ? [] : legacyNames(item)) {
      icon = iconOf(other)
      if (icon) break
    }
    if (!icon && STAND_INS[name]) icon = iconOf(STAND_INS[name])
    if (!icon && /_spawn_egg$/.test(name) && imageOf(PLAIN_EGG.path)) icon = PLAIN_EGG
    let texture = null
    let image = null
    if (icon) {
      const base = imageOf(icon.path)
      if (base && (icon.tint || icon.colors)) {
        let img = firstFrame(base)
        if (icon.tint?.base) img = tint(img, hex(icon.tint.base))
        const overlay = icon.overlay && imageOf(icon.overlay)
        if (overlay && overlay.width === img.width) img = over(img, icon.tint?.overlay ? tint(firstFrame(overlay), hex(icon.tint.overlay)) : firstFrame(overlay))
        if (icon.colors?.tint_color) img = tint(img, hex(icon.colors.tint_color))
        if (icon.colors?.overlay_color) {
          const opaque = { ...img, rgba: Buffer.from(img.rgba) }
          for (let i = 3; i < opaque.rgba.length; i += 4) opaque.rgba[i] = 255
          img = tint(opaque, hex(icon.colors.overlay_color), img)
        }
        texture = 'minecraft:items/' + store.add(name, img, 'items', icon.path)
        image = img
      } else if (base) {
        const folder = icon.path.startsWith('textures/blocks/') ? 'blocks' : 'items'
        const ref = store.ref(icon.path, folder)
        texture = folder === 'blocks' ? 'minecraft:block/' + ref : 'minecraft:items/' + ref
        image = firstFrame(base)
      }
    }
    if (!texture) unresolved.push(name)
    itemsTextures.push({ name, model: texture ? itemModel(name, icon) : name, texture })
    textureContent.push({ name, texture: image ? 'data:image/png;base64,' + encodePng(image).toString('base64') : null })
  }
  return { itemsTextures, textureContent, unresolved }
}

module.exports = { exportItems, itemModel }
