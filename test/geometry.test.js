/* eslint-env mocha */
const assert = require('assert')
const { generate } = require('../lib/blocks/geometry')
const { rotateBox } = require('../lib/blocks/geometry/orient')

const faces = ['bottom', 'top', 'north', 'south', 'west', 'east']
const ctx = (shape, extra = {}) => ({ shape, faces, tintFaces: false, tintTexture: () => false, ref: () => null, ...extra })
const bounds = elements => [0, 1, 2].map(i => [Math.min(...elements.map(e => e.from[i])), Math.max(...elements.map(e => e.to[i]))])

describe('geometry', () => {
  it('draws a stair as its collision boxes', () => {
    const state = { name: 'oak_stairs', props: { weirdo_direction: '0', upside_down_bit: '0' }, collision: [[0, 0, 0, 1, 0.5, 1], [0.5, 0.5, 0, 1, 1, 1]] }
    const m = generate(state, ctx('Stairs'))
    assert.deepStrictEqual(m.elements.map(e => [e.from, e.to]), [[[0, 0, 0], [16, 8, 16]], [[8, 8, 0], [16, 16, 16]]])
    assert.strictEqual(m.textures.up, 'top')
  })

  it('draws a full block as a cube with its faces', () => {
    const m = generate({ name: 'stone', props: {}, collision: [[0, 0, 0, 1, 1, 1]] }, ctx('Block'))
    assert.strictEqual(m.elements.length, 1)
    assert.deepStrictEqual(Object.keys(m.elements[0].faces).sort(), ['down', 'east', 'north', 'south', 'up', 'west'])
    assert.strictEqual(m.elements[0].faces.down.cullface, 'down')
    assert.strictEqual(m.textures.west, 'west')
  })

  it('turns a log to its pillar axis', () => {
    const m = generate({ name: 'oak_log', props: { pillar_axis: 'x' }, collision: [[0, 0, 0, 1, 1, 1]] }, ctx('Tree'))
    assert.deepStrictEqual([m.x, m.y], [90, 90])
  })

  it('draws a plant as two crossed planes of its texture', () => {
    const m = generate({ name: 'short_grass', props: {}, collision: [], outline: [0.1, 0, 0.1, 0.9, 0.8, 0.9] }, ctx('DoublesidedWideCrossTexture'))
    assert.strictEqual(m.elements.length, 2)
    assert.strictEqual(m.textures.cross, 'north')
    assert(m.elements.every(e => e.rotation.angle === 45))
  })

  it('leans a wall torch out from the side its selection box is on', () => {
    for (const [outline, side] of [[[0, 0.2, 0.35, 0.3, 0.8, 0.65], 0], [[0.7, 0.2, 0.35, 1, 0.8, 0.65], 16]]) {
      const m = generate({ name: 'torch', props: { torch_facing_direction: 'east' }, collision: [], outline }, ctx('Torch'))
      const [from, to] = rotateBox(m.elements[0].from, m.elements[0].to, 0, m.y ?? 0)
      assert(Math.abs((side ? to[0] : from[0]) - side) <= 1, `the torch's foot at x = ${side}`)
    }
  })

  it('draws a wall as its post and an arm to each connected side', () => {
    const props = { wall_post_bit: '1', wall_connection_type_north: 'short', wall_connection_type_east: 'tall', wall_connection_type_south: 'none', wall_connection_type_west: 'none' }
    const { parts } = generate({ name: 'cobblestone_wall', props, collision: [] }, ctx('Wall'))
    assert.strictEqual(parts.length, 3)
    assert.deepStrictEqual(bounds(parts[0].elements), [[4, 12], [0, 16], [4, 12]])
    assert.deepStrictEqual([parts[1].y, bounds(parts[1].elements)[1][1]], [0, 14])
    assert.deepStrictEqual([parts[2].y, bounds(parts[2].elements)[1][1]], [90, 16])
  })

  it('draws a fence with the tessellator boxes of its connections', () => {
    const tessellator = { fence: { 0: [[0.375, 0, 0.375, 0.625, 1, 0.625]], 1: [[0.375, 0, 0.375, 0.625, 1, 0.625], [0.4375, 0.75, 0, 0.5625, 0.9375, 0.5625]] } }
    const props = { 'minecraft:connection_north': '0', 'minecraft:connection_east': '1', 'minecraft:connection_south': '0', 'minecraft:connection_west': '0' }
    const { parts } = generate({ name: 'oak_fence', props, collision: [] }, ctx('Fence', { tessellator }))
    assert.strictEqual(parts.length, 2)
    assert.strictEqual(parts[1].y, 90)
  })

  it('draws nothing of an invisible block', () => {
    assert.strictEqual(generate({ name: 'barrier', props: {}, collision: [[0, 0, 0, 1, 1, 1]] }, ctx('Invisible')), null)
  })

  it('draws water as a liquid of its still texture', () => {
    const m = generate({ name: 'water', props: { liquid_depth: '0' }, collision: [] }, ctx('Water'))
    assert.deepStrictEqual([m.elements.length, m.textures.particle, m.liquid], [0, 'top', true])
  })

  const dust = (north, east, south, west) => generate({
    name: 'redstone_wire',
    props: { redstone_signal: '0', 'minecraft:connection_north': north, 'minecraft:connection_east': east, 'minecraft:connection_south': south, 'minecraft:connection_west': west },
    collision: []
  }, ctx('RedDust')).parts

  it('draws redstone dust as its connections', () => {
    const lone = dust('none', 'none', 'none', 'none')
    assert.deepStrictEqual([lone.length, Object.values(lone[0].elements[0].faces)[0].texture, bounds(lone[0].elements)], [1, '#cross', [[0, 16], [0.25, 0.25], [0, 16]]])
    const line = dust('side', 'none', 'none', 'none')
    assert.deepStrictEqual([line.length, Object.values(line[0].elements[0].faces)[0].texture, line[0].y], [1, '#line', 90])
    // a corner: the middle of the cross and its north and east arms
    const corner = dust('side', 'side', 'none', 'none')
    assert.deepStrictEqual(corner.map(p => bounds(p.elements).filter((_, i) => i !== 1)), [[[5, 11], [5, 11]], [[5, 11], [0, 5]], [[11, 16], [5, 11]]])
    // up the block to the west: a line up its face, turned to the west
    const up = dust('none', 'side', 'none', 'up')
    assert.deepStrictEqual([up.length, up[up.length - 1].y, bounds(up[up.length - 1].elements)[1]], [2, 270, [0, 16]])
  })

  const sheets = {
    'textures/entity/bed/white': 'bed_white',
    'textures/entity/bed/red': 'bed_red',
    'textures/entity/skulls/skeleton': 'skeleton',
    'textures/entity/skulls/creeper': 'creeper'
  }
  const entityCtx = shape => ctx(shape, {
    ref: p => sheets[p] ?? null,
    geometry: id => ({
      'geometry.bed': { sheet: [64, 64], bones: [{ cubes: [{ origin: [0, 0, 0], size: [16, 32, 6], uv: [0, 0] }] }] },
      'geometry.mob_head': { sheet: [64, 32], bones: [{ name: 'head', cubes: [{ origin: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] }] }] }
    })[id] ?? null,
    clientEntity: () => null
  })

  it('draws a bed on the sheet of its block entity colour, red without one', () => {
    const bed = props => generate({ name: 'bed', props: { direction: '0', head_piece_bit: '0', ...props }, collision: [] }, entityCtx('Bed'))
    assert.strictEqual(bed({ 'block_entity.color': '0' }).textures.bed, 'bed_white')
    assert.strictEqual(bed({}).textures.bed, 'bed_red')
  })

  it('turns a head on the floor by its block entity rotation, the skull block to its type', () => {
    const head = props => generate({ name: 'skull', props: { facing_direction: '1', ...props }, collision: [] }, entityCtx('Skull'))
    assert.deepStrictEqual([head({}).y, head({}).elements[0].rotation], [180, undefined])
    const turned = head({ 'block_entity.Rotation': '-22.5', 'block_entity.SkullType': '4' })
    assert.deepStrictEqual([turned.y, turned.elements[0].rotation.angle, turned.textures.head], [90, -67.5, 'creeper'])
    assert.strictEqual(head({ 'block_entity.Rotation': '90' }).y, 270)
  })
})

describe('doors and chests', () => {
  const door = props => generate({ name: 'wooden_door', props: { door_hinge_bit: '0', open_bit: '0', upper_block_bit: '0', ...props }, collision: [[0, 0, 0, 1, 1, 0.1875]] }, ctx('Door'))

  it('lays a door out as the client does, by its facing, hinge and openness (not its collision shape)', () => {
    // (a slab 3 thick at the west side of a door facing east; the legacy direction 0 is east, the cardinal south)
    const closed = door({ direction: '0' })
    assert.deepStrictEqual([closed.elements[0].from, closed.elements[0].to, closed.y ?? 0], [[0, 0, 0], [3, 16, 16], 0])
    assert.strictEqual(door({ 'minecraft:cardinal_direction': 'south' }).y ?? 0, 0)
    assert.strictEqual(door({ 'minecraft:cardinal_direction': 'east' }).y, 270)
    // (open: a quarter turn about its hinge, the other way for a right hinge)
    assert.strictEqual(door({ direction: '0', open_bit: '1' }).y, 90)
    assert.strictEqual(door({ direction: '0', open_bit: '1', door_hinge_bit: '1' }).y, 270)
    // (the bottom half's end is its bottom, the upper half's its top)
    assert.ok(door({}).elements[0].faces.down && !door({}).elements[0].faces.up)
    assert.ok(door({ upper_block_bit: '1' }).elements[0].faces.up)
  })

  const chestCtx = ctx('Chest', { geometry: () => null, ref: p => /chest\/(normal|double_normal)$/.test(p) ? p.replace(/^textures\//, '') : null })
  const chest = props => generate({ name: 'chest', props: { 'minecraft:cardinal_direction': 'north', ...props }, collision: [[0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375]] }, chestCtx)

  it('draws a single chest on the single sheet, its lid turned up about its hinge by the lid step', () => {
    const shut = chest({})
    assert.strictEqual(shut.textures.chest, 'entity/chest/normal')
    assert.strictEqual(shut.elements.length, 3)
    assert.strictEqual(shut.elements[1].rotation, undefined)
    const open = chest({ 'block_entity.lid': '9' })
    assert.deepStrictEqual(open.elements[1].rotation, { origin: [8, 9, 15], axis: 'x', angle: 90 })
    assert.deepStrictEqual(open.elements[2].rotation, open.elements[1].rotation)
    assert.strictEqual(open.elements[0].rotation, undefined)
  })

  it('draws a paired chest as its half of the double chest, the latch between the halves', () => {
    // (facing north, the other half to the east: this is the west half, from x 1 to 16)
    const west = chest({ 'block_entity.pair': 'east' })
    assert.strictEqual(west.textures.chest, 'entity/chest/double_normal')
    assert.deepStrictEqual(bounds(west.elements)[0], [1, 16])
    assert.ok(west.elements[0].faces.west && !west.elements[0].faces.east)
    // (its front's u runs from the middle of the double front, at the seam, outward)
    assert.strictEqual(west.elements[0].faces.north.uv[0], 29 * 16 / 128)
    const east = chest({ 'block_entity.pair': 'west' })
    assert.deepStrictEqual(bounds(east.elements)[0], [0, 15])
    // (a chest facing south with its other half to the east is the east half, turned)
    const south = chest({ 'minecraft:cardinal_direction': 'south', 'block_entity.pair': 'east' })
    assert.deepStrictEqual([bounds(south.elements)[0], south.y], [[0, 15], 180])
    // (a side that is not across its facing pairs it with nothing)
    assert.strictEqual(chest({ 'block_entity.pair': 'north' }).textures.chest, 'entity/chest/normal')
  })
})

describe('shapes the client lays out itself', () => {
  it('draws a big dripleaf as its stem and leaf, the leaf tilted by its tilt and turned to its facing', () => {
    const leaf = props => generate({ name: 'big_dripleaf', props: { big_dripleaf_head: '1', 'minecraft:cardinal_direction': 'north', ...props }, collision: [] }, ctx('BigDripleaf'))
    const flat = leaf({ big_dripleaf_tilt: 'none' })
    assert.strictEqual(flat.textures.top, 'south')
    assert.strictEqual(flat.elements[0].rotation, undefined)
    // (fully tilted it has no collision box, yet is drawn)
    const full = leaf({ big_dripleaf_tilt: 'full_tilt' })
    assert.deepStrictEqual(full.elements[0].rotation, { origin: [8, 15, 16], axis: 'x', angle: -45 })
    assert.strictEqual(leaf({ big_dripleaf_tilt: 'partial_tilt' }).elements[0].rotation.angle, -22.5)
    // (legacy direction 0 is south)
    assert.strictEqual(generate({ name: 'big_dripleaf', props: { big_dripleaf_head: '0', direction: '0' }, collision: [[0.3, 0, 0.1, 0.7, 1, 0.5]] }, ctx('BigDripleaf')).y, 180)
  })

  it('draws a small dripleaf as a stem below and leaves above, not its whole-block box', () => {
    const half = upper => generate({ name: 'small_dripleaf_block', props: { upper_block_bit: upper, direction: '2' }, collision: [], outline: [0, 0, 0, 1, 1, 1] }, ctx('SmallDripleaf'))
    assert.ok(half('0').elements.every(e => e.rotation?.axis === 'y'))
    assert.strictEqual(half('0').textures.stem, 'south')
    assert.strictEqual(half('1').textures.stem, 'north')
    assert.ok(half('1').elements.some(e => e.faces.up?.texture === '#top'))
  })

  it('draws sea pickles by their count, dead ones without their tufts', () => {
    const pickles = props => generate({ name: 'sea_pickle', props, collision: [[0, 0, 0, 1, 0.5, 1]] }, ctx('SeaPickle'))
    assert.strictEqual(pickles({ cluster_count: '0', dead_bit: '0' }).elements.length, 4)
    assert.strictEqual(pickles({ cluster_count: '3', dead_bit: '0' }).elements.length, 16)
    assert.strictEqual(pickles({ cluster_count: '3', dead_bit: '1' }).elements.length, 4)
  })

  it('draws a pointed dripstone as crossed planes of its thickness texture', () => {
    const m = generate({ name: 'pointed_dripstone', props: { dripstone_thickness: 'frustum', hanging: '1' }, collision: [[0.3, 0, 0.3, 0.7, 1, 0.7]] }, ctx('PointedDripstone'))
    assert.strictEqual(m.textures.cross, 'bottom')
    assert.ok(m.elements.every(e => e.rotation.angle === 45))
  })

  it('draws an azalea with the plant among its faces inside it, not the potted textures', () => {
    const potted = ['potted_azalea_bush_top', 'azalea_top', 'azalea_side', 'potted_azalea_bush_side', 'potted_azalea_bush_plant', 'azalea_plant'].map(t => 'textures/blocks/' + t)
    const m = generate({ name: 'azalea', props: {}, collision: [[0, 0.5, 0, 1, 1, 1]] }, ctx('Azalea', { faces: potted }))
    assert.deepStrictEqual([m.textures.top, m.textures.side, m.textures.plant], ['textures/blocks/azalea_top', 'textures/blocks/azalea_side', 'textures/blocks/azalea_plant'])
  })

  it('draws a beacon as its shell, base and core', () => {
    const m = generate({ name: 'beacon', props: {}, collision: [[0, 0, 0, 1, 1, 1]] }, ctx('Beacon'))
    assert.deepStrictEqual([m.textures.base, m.textures.core, m.textures.shell], ['bottom', 'top', 'north'])
    assert.strictEqual(m.elements.length, 3)
  })
})

describe('pistons', () => {
  const ref = p => p.replace('textures/blocks/', '')
  const piston = (name, props) => generate({ name, props, collision: [[0, 0, 0, 1, 1, 1]] }, ctx('Piston', { ref }))
  const { rotateDir } = require('../lib/blocks/geometry/orient')

  it('draws a retracted piston as its base and its head in front, the head sticky or not by its name', () => {
    const m = piston('piston', { facing_direction: '1' })
    assert.deepStrictEqual(m.elements.map(e => [e.from[1], e.to[1]]), [[0, 12], [12, 16]])
    assert.deepStrictEqual([m.textures.inner, m.textures.head], ['top', 'piston_top_normal'])
    assert.strictEqual(m.elements[1].faces.up.cullface, 'up')
    assert.strictEqual(piston('sticky_piston', { facing_direction: '1' }).textures.head, 'piston_top_sticky')
  })

  it('pushes the head out on its rod by its block entity progress', () => {
    const m = piston('piston', { facing_direction: '1', 'block_entity.Progress': '1' })
    assert.deepStrictEqual(m.elements.map(e => [e.from[1], e.to[1]]), [[0, 12], [28, 32], [12, 28]])
    assert.strictEqual(m.elements[1].faces.up.cullface, undefined)
    assert.strictEqual(piston('piston', { facing_direction: '1', 'block_entity.Progress': '0.5' }).elements[1].from[1], 20)
  })

  it('turns to its facing_direction, horizontal ones the other way round from other blocks (2 south)', () => {
    for (const [value, facing] of [['0', 'down'], ['1', 'up'], ['2', 'south'], ['3', 'north'], ['4', 'east'], ['5', 'west']]) {
      const m = piston('piston', { facing_direction: value })
      assert.strictEqual(rotateDir('up', m.x ?? 0, m.y ?? 0), facing, value)
    }
  })
})
