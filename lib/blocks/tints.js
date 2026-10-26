const fs = require('fs')
const path = require('path')
const { decodePng } = require('../image/png')

const COLORMAPS = {
  grass: 'grass',
  foliage: 'foliage',
  birch: 'birch',
  evergreen: 'evergreen',
  dry: 'dry_foliage',
  swampGrass: 'swamp_grass',
  swampFoliage: 'swamp_foliage',
  mangroveFoliage: 'mangrove_swamp_foliage'
}
const METHODS = ['grass', 'foliage', 'birch', 'evergreen', 'dry', 'water']

function loadColormap (dir, name) {
  const file = path.join(dir, name + '.png')
  if (!fs.existsSync(file)) return null
  try { return decodePng(fs.readFileSync(file)) } catch { return null }
}

function sample (map, temperature, downfall) {
  if (!map) return null
  const t = Math.min(Math.max(temperature, 0), 1)
  const d = Math.min(Math.max(downfall, 0), 1) * t
  const x = Math.min(map.width - 1, Math.floor((1 - t) * (map.width - 1)))
  const y = Math.min(map.height - 1, Math.floor((1 - d) * (map.height - 1)))
  const i = (y * map.width + x) * 4
  return (map.rgba[i] << 16) | (map.rgba[i + 1] << 8) | map.rgba[i + 2]
}

const hexColor = hex => parseInt(String(hex).replace(/^#?(0x)?/i, '').slice(0, 6), 16)

function redstoneTable () {
  const data = []
  for (let power = 0; power <= 15; power++) {
    const f = power / 15
    const r = f * 0.6 + (f > 0 ? 0.4 : 0.3)
    const g = Math.min(Math.max(f * f * 0.7 - 0.5, 0), 1)
    const b = Math.min(Math.max(f * f * 0.6 - 0.7, 0), 1)
    data.push({ keys: [String(power)], color: (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255) })
  }
  return { data, default: data[0].color }
}

function stemTable () {
  const data = []
  for (let growth = 0; growth <= 7; growth++) data.push({ keys: [String(growth)], color: (growth * 32 << 16) | ((255 - growth * 8) << 8) | growth * 4 })
  return { data, default: data[7].color }
}

function group (colors) {
  const byColor = new Map()
  for (const [key, color] of colors) {
    if (color === null) continue
    if (!byColor.has(color)) byColor.set(color, [])
    byColor.get(color).push(key)
  }
  return [...byColor].map(([color, keys]) => ({ keys: keys.sort(), color })).sort((a, b) => a.keys[0].localeCompare(b.keys[0]))
}

function buildTints ({ colormapDir, biomesClient, biomes, constants = {} }) {
  const maps = {}
  for (const [key, file] of Object.entries(COLORMAPS)) maps[key] = loadColormap(colormapDir, file)
  const clientBiomes = biomesClient?.biomes ?? biomesClient ?? {}
  const defaultWater = clientBiomes.default?.water_surface_color ?? '#44AFF5'
  const byMethod = Object.fromEntries(METHODS.map(m => [m, []]))
  let plains = null
  for (const biome of biomes) {
    const temperature = biome.temperature ?? 0.8
    const downfall = biome.rainfall ?? 0.4
    const swamp = /swamp/.test(biome.name)
    const mangrove = /mangrove/.test(biome.name)
    const client = clientBiomes['minecraft:' + biome.name] ?? clientBiomes[biome.name]
    const colors = {
      grass: sample(swamp && maps.swampGrass ? maps.swampGrass : maps.grass, temperature, downfall),
      foliage: sample(mangrove && maps.mangroveFoliage ? maps.mangroveFoliage : swamp && maps.swampFoliage ? maps.swampFoliage : maps.foliage, temperature, downfall),
      birch: sample(maps.birch, temperature, downfall),
      evergreen: sample(maps.evergreen, temperature, downfall),
      dry: sample(maps.dry, temperature, downfall),
      water: hexColor(client?.water_surface_color ?? defaultWater)
    }
    for (const m of METHODS) byMethod[m].push([biome.name, colors[m]])
    if (biome.name === 'plains' || (!plains && biome.id === 1)) plains = colors
  }
  plains ??= Object.fromEntries(METHODS.map(m => [m, byMethod[m].find(([, c]) => c !== null)?.[1] ?? 0xffffff]))
  const tints = {}
  for (const m of METHODS) tints[m] = { data: group(byMethod[m]), default: plains[m] ?? 0xffffff }
  tints.redstone = redstoneTable()
  tints.stem = stemTable()
  tints.constant = { data: group(Object.entries(constants).map(([name, hex]) => [name, hexColor(hex)])) }
  return tints
}

module.exports = { buildTints, sample, redstoneTable, stemTable, hexColor, COLORMAPS }
