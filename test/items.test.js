/* eslint-env mocha */
const assert = require('assert')
const { itemModel } = require('../lib/items')

describe('items', () => {
  const block = (name, shape) => ({ path: 'textures/blocks/' + name, source: 'block', block: { name, shape } })

  it('a block item the client draws as its block is modelled by that block', () => {
    assert.strictEqual(itemModel('oak_log', block('oak_log', 'Tree')), 'minecraft:block/oak_log')
    assert.strictEqual(itemModel('chest', block('chest', 'Chest')), 'minecraft:block/chest')
    // (a block of no known shape is drawn as a block)
    assert.strictEqual(itemModel('stone', block('stone', null)), 'minecraft:block/stone')
  })

  it('a block item of a shape drawn flat, and an item with an icon of its own, keep their name', () => {
    assert.strictEqual(itemModel('torch', block('torch', 'Torch')), 'torch')
    assert.strictEqual(itemModel('poppy', block('poppy', 'DoublesidedWideCrossTexture')), 'poppy')
    assert.strictEqual(itemModel('glass_pane', block('glass_pane', 'DoubleSideFence')), 'glass_pane')
    assert.strictEqual(itemModel('cake', { path: 'textures/items/cake', source: 'item_texture:cake' }), 'cake')
    assert.strictEqual(itemModel('camera', null), 'camera')
  })
})
