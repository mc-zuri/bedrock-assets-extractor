function buildBlockState (states) {
  const partKeys = states.map(s => s.parts.map(p => JSON.stringify(p)))
  const props = Object.keys(states[0]?.props ?? {})
  if (partKeys.every(keys => keys.length <= 1)) {
    const value = i => partKeys[i][0] ?? null
    const subset = determiningProps(states, props, value)
    const variants = {}
    states.forEach((s, i) => {
      const key = subset.map(k => `${k}=${s.props[k]}`).join(',')
      if (!(key in variants)) variants[key] = value(i) === null ? { model: 'minecraft:block/air' } : JSON.parse(value(i))
    })
    return { variants }
  }
  const multipart = []
  const distinct = [...new Set(partKeys.flat())]
  for (const part of distinct) {
    const has = partKeys.map(keys => keys.includes(part))
    const entry = { apply: JSON.parse(part) }
    if (!has.every(Boolean)) {
      const subset = determiningProps(states, props, i => has[i])
      entry.when = whenOf(subset, states.filter((s, i) => has[i]).map(s => s.props))
    }
    multipart.push(entry)
  }
  return { multipart }
}

function determiningProps (states, props, value) {
  for (let size = 0; size <= props.length; size++) {
    for (const subset of combinations(props, size)) {
      const seen = new Map()
      let ok = true
      for (let i = 0; i < states.length && ok; i++) {
        const key = subset.map(k => String(states[i].props[k])).join('\u0000')
        const v = value(i)
        if (!seen.has(key)) seen.set(key, v)
        else if (seen.get(key) !== v) ok = false
      }
      if (ok) return subset
    }
  }
  return props
}

function * combinations (list, size, start = 0, prefix = []) {
  if (prefix.length === size) { yield prefix; return }
  for (let i = start; i < list.length; i++) yield * combinations(list, size, i + 1, [...prefix, list[i]])
}

function whenOf (subset, propsList) {
  const rows = [...new Map(propsList.map(p => {
    const row = subset.map(k => String(p[k]))
    return [row.join('\u0000'), row]
  })).values()]
  return compact(subset, rows)
}

function compact (subset, rows) {
  const values = subset.map((_, i) => [...new Set(rows.map(r => r[i]))])
  const product = values.reduce((n, v) => n * v.length, 1)
  if (product === rows.length) {
    return Object.fromEntries(subset.map((k, i) => [k, values[i].join('|')]))
  }

  const groups = new Map()
  for (const row of rows) {
    const head = row.slice(0, -1).join('\u0000')
    if (!groups.has(head)) groups.set(head, { head: row.slice(0, -1), last: [] })
    groups.get(head).last.push(row[row.length - 1])
  }
  const last = subset[subset.length - 1]
  return {
    OR: [...groups.values()].map(g => ({
      ...Object.fromEntries(subset.slice(0, -1).map((k, i) => [k, g.head[i]])),
      [last]: g.last.join('|')
    }))
  }
}

module.exports = { buildBlockState, determiningProps, whenOf }
