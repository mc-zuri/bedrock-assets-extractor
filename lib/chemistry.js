const NAMES = new Set([
  'chemical_heat', 'chemistry_table', 'compound_creator', 'element_constructor', 'lab_table', 'material_reducer',
  'hard_glass', 'hard_glass_pane', 'hard_stained_glass', 'hard_stained_glass_pane',
  'colored_torch_rg', 'colored_torch_bp', 'colored_torch_red', 'colored_torch_green', 'colored_torch_blue', 'colored_torch_purple',
  'underwater_torch', 'underwater_tnt',
  'compound', 'bleach', 'medicine', 'balloon', 'ice_bomb', 'rapid_fertilizer', 'sparkler', 'glow_stick'
])

function isChemistry (name) {
  const bare = String(name).replace(/^minecraft:/, '')
  return NAMES.has(bare) || /^element_\d+$/.test(bare) || /^hard_[a-z_]+_stained_glass(_pane)?$/.test(bare)
}

module.exports = { isChemistry }
