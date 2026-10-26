/* eslint-env mocha */
const assert = require('assert')
const { isChemistry } = require('../lib/chemistry')

describe('chemistry', () => {
  it('the chemistry blocks, items and entities are left out', () => {
    for (const name of ['element_0', 'element_118', 'chemistry_table', 'compound_creator', 'lab_table', 'chemical_heat',
      'hard_glass', 'hard_stained_glass_pane', 'hard_light_blue_stained_glass', 'colored_torch_rg', 'colored_torch_purple',
      'underwater_torch', 'underwater_tnt', 'compound', 'bleach', 'glow_stick', 'minecraft:balloon', 'minecraft:ice_bomb']) {
      assert.strictEqual(isChemistry(name), true, name)
    }
  })

  it('the blocks they resemble are not', () => {
    for (const name of ['glass', 'glass_pane', 'light_blue_stained_glass', 'stained_glass_pane', 'torch', 'tnt', 'element', 'minecraft:creeper', 'camera']) {
      assert.strictEqual(isChemistry(name), false, name)
    }
  })
})
