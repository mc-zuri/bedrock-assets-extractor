const { PackStack } = require('../pack/stack')
const { compareVersions, parseVersion, family, minor } = require('../pack/versions')
const { clientSources } = require('./client')
const { samplesSources, ztechSources, checkoutGitSource } = require('./git')

const KIND_RANK = { client: 0, 'bedrock-samples': 1, MCBVanillaResourcePack: 2 }

function listSources ({ clientsDir, cacheDir, refresh = false, kinds = Object.keys(KIND_RANK) }) {
  return [
    ...(kinds.includes('client') ? clientSources(clientsDir) : []),
    ...(kinds.includes('bedrock-samples') ? samplesSources(cacheDir, refresh).values() : []),
    ...(kinds.includes('MCBVanillaResourcePack') ? ztechSources(cacheDir, refresh).values() : [])
  ]
}

function pickSource (version, sources) {
  if (!sources.length) throw new Error('no sources: give --clients, or let the public sources be fetched')
  const byRank = (x, y) => (KIND_RANK[x.kind] - KIND_RANK[y.kind]) ||
    Math.abs(parseVersion(x.version)[2] - parseVersion(version)[2]) - Math.abs(parseVersion(y.version)[2] - parseVersion(version)[2]) ||
    compareVersions(x.version, y.version)
  const exact = sources.filter(s => compareVersions(s.version, version) === 0).sort(byRank)
  if (exact.length) return { ...exact[0], match: 'exact' }
  const sameFamily = sources.filter(s => family(s.version) === family(version)).sort(byRank)
  if (sameFamily.length) return { ...sameFamily[0], match: 'hotfix' }
  const newestFirst = (x, y) => compareVersions(y.version, x.version) || KIND_RANK[x.kind] - KIND_RANK[y.kind]
  const oldestFirst = (x, y) => compareVersions(x.version, y.version) || KIND_RANK[x.kind] - KIND_RANK[y.kind]
  const sameMinor = sources.filter(s => minor(s.version) === minor(version))
  const olderMinor = sameMinor.filter(s => compareVersions(s.version, version) < 0).sort(newestFirst)
  if (olderMinor.length) return { ...olderMinor[0], match: 'older' }
  const newerMinor = sameMinor.sort(oldestFirst)
  if (newerMinor.length) return { ...newerMinor[0], match: 'newer' }
  const before = sources.filter(s => compareVersions(s.version, version) < 0).sort(newestFirst)
  if (before.length) return { ...before[0], match: 'older' }
  return { ...[...sources].sort(oldestFirst)[0], match: 'closest-newer' }
}

function pickSupplement (version, sources) {
  const clients = sources.filter(s => s.kind === 'client' && s.hasBlocksJson)
  const distance = s => {
    const [a, b, c] = parseVersion(s.version)
    const [x, y, z] = parseVersion(version)
    return Math.abs((a * 1000 + b) * 1000 + c - ((x * 1000 + y) * 1000 + z))
  }
  return clients.sort((p, q) => distance(p) - distance(q) || compareVersions(p.version, q.version))[0] ?? null
}

function pickLater (version, sources, source) {
  const newer = sources.filter(s => s.kind === 'client' && s.hasBlocksJson && compareVersions(s.version, version) > 0 && s !== source)
    .sort((p, q) => compareVersions(p.version, q.version))
  return newer.length ? [...new Set([newer[newer.length - 1], newer[0]])] : []
}

function planVersion (version, sources) {
  const source = pickSource(version, sources)
  const supplement = source.kind === 'client' && source.hasBlocksJson ? null : pickSupplement(version, sources)
  return { version, source, supplement, later: pickLater(version, sources, source) }
}

function openSource (source, cacheDir, supplement = null, later = []) {
  let own
  if (source.kind === 'client') {
    own = PackStack.fromInstall(source.dir)
    own.behavior = PackStack.behaviorFromInstall(source.dir)
  } else {
    const { dir, behavior } = checkoutGitSource(source, cacheDir)
    own = PackStack.fromDir(dir)
    own.behavior = behavior ? PackStack.fromDir(behavior) : null
  }
  const below = [...later, supplement].filter(Boolean)
  if (!below.length) return own
  const layers = below.flatMap(c => PackStack.fromInstall(c.dir).layers.map(l => ({ ...l, name: `${c.build}/${l.name}` })))
  const stack = new PackStack([...layers, ...own.layers])
  stack.behavior = own.behavior ?? (supplement && PackStack.behaviorFromInstall(supplement.dir))
  return stack
}

function describeSource (s) {
  return s.kind === 'client'
    ? { kind: s.kind, build: s.build, match: s.match }
    : { kind: s.kind, build: s.build, ref: s.ref, match: s.match }
}

module.exports = { listSources, pickSource, pickSupplement, pickLater, planVersion, openSource, describeSource, KIND_RANK }
