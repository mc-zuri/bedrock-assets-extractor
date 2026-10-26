//
const { stateKey } = require('./states')

function pack (order, props, values) {
  let data = 0
  for (const k of order) {
    const list = values[k]
    data = data * 2 ** Math.ceil(Math.log2(list.length)) + list.indexOf(props[k])
  }
  return data
}

function legacyData (states, layouts = new Map()) {
  const permutation = new Map()
  return states.map(({ name, props }) => {
    const index = permutation.get(name) ?? 0
    permutation.set(name, index + 1)
    const layout = layouts.get(name)
    const exact = layout?.exact?.get(stateKey(props))
    if (exact !== undefined) return exact
    const keys = Object.keys(props)
    if (layout?.order && keys.length === layout.order.length && keys.every(k => layout.values[k]?.includes(props[k]))) {
      return pack(layout.order, props, layout.values)
    }
    return index
  })
}

module.exports = { legacyData }
