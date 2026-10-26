const { compareVersions } = require('../pack/versions')

function inRanges (ranges, index, versions) {
  for (const r of ranges) {
    const [a, b = a] = r.split('-')
    const i = versions.indexOf(a)
    const j = versions.indexOf(b)
    if (i !== -1 && index >= i && index <= j) return true
  }
  return false
}

function itemIconsFor (table, version) {
  if (!table?.versions?.length) return null
  let index = table.versions.indexOf(version)
  if (index === -1) index = table.versions.filter(v => compareVersions(v, version) < 0).length - 1
  const entry = index < 0 ? null : table.entries.find(e => inRanges(e.versions, index, table.versions))
  return entry?.icons ? new Map(Object.entries(entry.icons)) : null
}

module.exports = { itemIconsFor }
