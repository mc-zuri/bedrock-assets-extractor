const fs = require('fs')
const path = require('path')

const DATA = path.join(__dirname, '..', 'data')
const read = name => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'))
const withoutMeta = ({ _meta, ...rest }) => rest

function loadTables () {
  const layouts = new Map()
  for (const [name, l] of Object.entries(read('data_layouts.json').blocks)) {
    layouts.set(name, { order: l.order, values: l.values, exact: new Map(Object.entries(l.exact ?? {})) })
  }
  return {
    render: new Map(Object.entries(read('block_render.json').blocks)),
    overrides: read('block_render_overrides.json'),
    flattening: read('flattening.json').blocks,
    layouts,
    tessellator: withoutMeta(read('tessellator_shapes.json')),
    legacyKeys: new Map(Object.entries(read('legacy_keys.json').blocks)),
    itemIcons: read('item_icons.json'),
    entityMaterials: read('entity_materials.json')
  }
}

module.exports = { loadTables }
