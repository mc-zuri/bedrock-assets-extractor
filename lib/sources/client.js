const { existsSync, readdirSync } = require('fs')
const { join } = require('path')

function clientSources (clientsDir) {
  if (!clientsDir || !existsSync(clientsDir)) return []
  return readdirSync(clientsDir)
    .map(name => /^Minecraft-(\d+\.\d+\.\d+)\.(\d+)$/.exec(name))
    .filter(Boolean)
    .map(m => ({ kind: 'client', version: m[1], build: `${m[1]}.${m[2]}`, dir: join(clientsDir, m[0], 'data') }))
    .map(s => ({
      ...s,
      hasBlocksJson: existsSync(join(s.dir, 'resource_packs', 'vanilla', 'blocks.json')) ||
        existsSync(join(s.dir, 'resourcepacks', 'vanilla', 'blocks.json'))
    }))
    .filter(s => s.hasBlocksJson || existsSync(join(s.dir, 'images', 'terrain.meta')))
}

module.exports = { clientSources }
