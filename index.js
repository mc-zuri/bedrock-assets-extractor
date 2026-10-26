// Export Minecraft Bedrock Edition block assets into minecraft-assets' layout (data/bedrock/<version>/), in the format
// prismarine-viewer reads, from Bedrock's own data: minecraft-data's Bedrock block states and shapes, and the Bedrock
// resource packs.
const path = require('path')
const { listSources, planVersion } = require('./lib/sources')
const { loadTables } = require('./lib/tables')
const { exportVersion } = require('./lib/export')
const { aliasVersions } = require('./lib/alias')
const { compareVersions } = require('./lib/pack/versions')

function minecraftData () {
  return require('minecraft-data')
}

// the Bedrock versions minecraft-data has blocks of: with their block states (1.16.201 on), or (0.14 - 1.0) ids and data
// values its legacy table names the states of
// (named as minecraft-data's data folders are: 0.14, 1.0, 1.21.0)
function bedrockVersions (mcDataModule = minecraftData(), { withStates = false } = {}) {
  const dataPaths = require(path.join(path.dirname(require.resolve('minecraft-data/package.json')), 'minecraft-data', 'data', 'dataPaths.json'))
  return Object.keys(dataPaths.bedrock)
    .filter(v => {
      try {
        const data = mcDataModule('bedrock_' + v)
        return withStates ? !!data?.blockStates : !!data?.blocksArray
      } catch { return false }
    })
    .sort(compareVersions)
}

function defaultOut () {
  return path.join(path.dirname(require.resolve('minecraft-assets/package.json')), 'minecraft-assets', 'data', 'bedrock')
}

function sourcesOf ({ cacheDir, clientsDir, kinds }) {
  return listSources({ cacheDir, clientsDir, kinds })
}

function plan ({ versions, cacheDir, clientsDir, kinds }) {
  const sources = sourcesOf({ cacheDir, clientsDir, kinds })
  return (versions ?? bedrockVersions()).map(v => planVersion(v, sources))
}

function extract ({ versions, out = defaultOut(), cacheDir, clientsDir, kinds, log = console.log }) {
  const mcDataModule = minecraftData()
  const sources = sourcesOf({ cacheDir, clientsDir, kinds })
  const tables = loadTables()
  const withStates = bedrockVersions(mcDataModule, { withStates: true })
  const [reference, newest] = [withStates[0], withStates[withStates.length - 1]]
  const metas = (versions ?? bedrockVersions(mcDataModule)).map(version =>
    exportVersion({ version, out, sources, cacheDir, mcDataModule, tables, reference, newest, log }))
  aliasVersions(out, log)
  return metas
}

module.exports = { extract, plan, bedrockVersions }
