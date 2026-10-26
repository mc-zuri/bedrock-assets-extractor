/* eslint-env mocha */
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { PackStack } = require('../lib/pack/stack')
const { exportEntities } = require('../lib/entities')
const { resolveGeometry, geometryEntries } = require('../lib/entities/geometry')
const { materialsFor } = require('../lib/entities/materialsTable')
const { legacyEntities, exportEntityAssets } = require('../lib/entities/write')
const { encodePng } = require('../lib/image/png')

// a pack stack of in-memory layers: [{ name, files: { path: content } }]
function stackOf (layers) {
  return new PackStack(layers.map(({ name, files }) => ({
    name,
    files: new Map(Object.entries(files).map(([p, c]) => [p, () => Buffer.isBuffer(c) ? c : Buffer.from(typeof c === 'string' ? c : JSON.stringify(c))]))
  })))
}

describe('entities', () => {
  const stack = stackOf([
    {
      name: 'vanilla',
      files: {
        'entity/cow.entity.json': { format_version: '1.8.0', 'minecraft:client_entity': { description: { identifier: 'minecraft:cow', min_engine_version: '1.8.0', materials: { default: 'cow' }, textures: { default: 'textures/entity/cow/cow' }, geometry: { default: 'geometry.cow' }, render_controllers: ['controller.render.default'] } } },
        'entity/cow.v1.0.entity.json': { 'minecraft:client_entity': { description: { identifier: 'minecraft:cow', materials: { default: 'old' } } } },
        'models/mobs.json': '{ "geometry.quadruped": { "texturewidth": 64, "textureheight": 32, "bones": [ { "name": "body", "pivot": [0, 19, 2], "bind_pose_rotation": [90, 0, 0], "cubes": [ { "origin": [-6, 11, -5], "size": [12, 18, 10], "uv": [28, 8] } ] }, { "name": "head", "pivot": [0, 20, -6] } ] }, "geometry.cow:geometry.quadruped": { "bones": [ { "name": "head", "pivot": [0, 20, -8] } ] } }',
        'render_controllers/default.json': { render_controllers: { 'controller.render.default': { geometry: 'Geometry.default' } } },
        'materials/entity.material': '{ "materials": { "version": "1.0.0", "entity_static": { "+defines": ["USE_OVERLAY"], "states": ["DisableCulling"] }, "cow:entity_static": { "+defines": ["ALPHA_TEST"], "-states": ["DisableCulling"], "blendSrc": "One" } } }'
      }
    },
    {
      name: 'vanilla_1.20',
      files: { 'entity/cow.entity.json': { 'minecraft:client_entity': { description: { identifier: 'minecraft:cow', min_engine_version: '1.8.0', spawn_egg: { texture: 'spawn_egg', texture_index: 1 } } } } }
    }
  ])
  const { out } = exportEntities({ version: '1.0.0', stack, source: { kind: 'client', build: '1.0.0.1', match: 'exact' } })

  it('takes the highest engine version, each pack\'s copy merged over the ones below', () => {
    assert.deepStrictEqual(out.entities['minecraft:cow'].materials, { default: 'cow' })
    assert.deepStrictEqual(out.entities['minecraft:cow'].spawn_egg, { texture: 'spawn_egg', texture_index: 1 })
    assert.strictEqual(out.files['minecraft:cow'], 'entity/cow.entity.json')
  })
  it('resolves 1.8 geometry inheritance and bind poses', () => {
    const g = out.geometry['geometry.cow']
    assert.strictEqual(g.texture_width, 64)
    assert.strictEqual(g.texture_height, 32)
    assert.deepStrictEqual(g.bones.map(b => [b.name, b.pivot, b.bind]), [['body', [0, 19, 2], [90, 0, 0]], ['head', [0, 20, -8], undefined]])
    assert.throws(() => resolveGeometry('geometry.a', new Map(geometryEntries({ 'geometry.a:geometry.b': { bones: [] } }).map(e => [e.id, e]))), /no parent/)
  })
  it('resolves materials through their parents and lists what the packs lack', () => {
    assert.deepStrictEqual(out.materials.cow, { defines: ['ALPHA_TEST', 'USE_OVERLAY'], states: [], blendSrc: 'One' })
    assert.deepStrictEqual(out.missing, { geometry: [], render_controllers: [], animations: [] })
    assert.deepStrictEqual(out.problems, [])
  })
  it('takes the materials from the table when the packs have none', () => {
    const bare = stackOf([{ name: 'v', files: { 'entity/a.json': { 'minecraft:client_entity': { description: { identifier: 'minecraft:a', materials: { default: 'cow', other: 'gone' } } } } } }])
    const r = exportEntities({ version: '1.0.0', stack: bare, source: {}, materialsTable: { cow: { defines: ['X'], states: [] } } })
    assert.strictEqual(r.materialsFrom, 'data/entity_materials.json')
    assert.deepStrictEqual(r.out.materials, { cow: { defines: ['X'], states: [] }, gone: { defines: [], states: [] } })
  })
})

describe('geometry inheritance', () => {
  const { geometryEntries, resolveGeometry } = require('../lib/entities/geometry')
  it('merges a child bone into its parent\'s, keeping the cubes unless it gives its own or resets them', () => {
    const file = {
      'geometry.zombie': { texturewidth: 64, textureheight: 64, bones: [{ name: 'head', pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }] }, { name: 'body', pivot: [0, 24, 0], cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }] }] },
      'geometry.armor:geometry.zombie': { bones: [{ name: 'head', inflate: 1 }, { name: 'body', reset: true }, { name: 'extra', pivot: [1, 2, 3] }] }
    }
    const defs = new Map(geometryEntries(file).map(e => [e.id, e]))
    const g = resolveGeometry('geometry.armor', defs)
    assert.deepStrictEqual(g.bones.map(b => [b.name, b.pivot, b.inflate, b.cubes?.length ?? 0]), [['head', [0, 24, 0], 1, 1], ['body', [0, 24, 0], undefined, 0], ['extra', [1, 2, 3], undefined, 0]])
  })
  it('keeps every field of a bone and a cube, binding and texture_meshes among them', () => {
    const { droppedFields } = require('../lib/entities/geometry')
    const shield = { name: 'shield', pivot: [0, 0, 0], binding: 'q.item_slot_to_bone_name(c.item_slot)', render_group_id: 1, texture_meshes: [{ texture: 'default', position: [0, 0, 0] }], cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: { north: { uv: [0, 0], uv_size: [1, 1], material_instance: 'x' } }, reset: false }] }
    const file = { 'minecraft:geometry': [{ description: { identifier: 'geometry.shield', texture_width: 64, texture_height: 64 }, bones: [shield] }] }
    const g = resolveGeometry('geometry.shield', new Map(geometryEntries(file).map(e => [e.id, e])))
    const [bone] = g.bones
    assert.strictEqual(bone.binding, shield.binding)
    assert.deepStrictEqual(bone.texture_meshes, shield.texture_meshes)
    assert.strictEqual(bone.render_group_id, 1)
    assert.strictEqual(bone.cubes[0].reset, false)
    assert.deepStrictEqual(bone.cubes[0].uv, shield.cubes[0].uv)
    assert.deepStrictEqual(droppedFields(shield, bone), [])
    // a child's binding over its parent's bone
    const legacy = { 'geometry.a': { bones: [{ name: 'b', pivot: [0, 1, 0], binding: 'x' }] }, 'geometry.c:geometry.a': { bones: [{ name: 'b', binding: 'y', bind_pose_rotation: [0, 0, 0] }] } }
    assert.strictEqual(resolveGeometry('geometry.c', new Map(geometryEntries(legacy).map(e => [e.id, e]))).bones[0].binding, 'y')
    // what is lost, and what is normalized on purpose (a zero rotation, a zero bind pose)
    assert.deepStrictEqual(droppedFields({ name: 'b', binding: 'x', rotation: [0, 0, 0], bind_pose_rotation: [0, 0, 0] }, { name: 'b' }), ['binding'])
  })
})

describe('entity materials table', () => {
  it('takes what the ranges give the nearest version at or below', () => {
    const table = { versions: ['1.16.0', '1.18.0'], materials: { cow: [{ versions: ['1.16.0'], defines: ['A'], states: [] }, { versions: ['1.18.0'], defines: ['B'], states: [] }] } }
    assert.deepStrictEqual(materialsFor(table, '1.17.0'), { cow: { defines: ['A'], states: [] } })
    assert.deepStrictEqual(materialsFor(table, '1.26.0'), { cow: { defines: ['B'], states: [] } })
  })
})

describe('legacy entities', () => {
  const png = encodePng({ width: 1, height: 1, rgba: Buffer.from([1, 2, 3, 255]) })
  const reference = {
    entities: {
      'minecraft:cow': { identifier: 'minecraft:cow', textures: { default: 'textures/entity/cow/cow' }, geometry: { default: 'geometry.cow.v1.8' } },
      'minecraft:drowned': { identifier: 'minecraft:drowned', textures: { default: 'textures/entity/zombie/drowned' }, geometry: { default: 'geometry.zombie' } }
    },
    files: {},
    geometry: { 'geometry.cow.v1.8': { texture_width: 64, texture_height: 32, bones: [] }, 'geometry.zombie': { bones: [] } },
    render_controllers: {},
    animations: { 'animation.cow.setup': {} },
    animation_controllers: {},
    materials: {},
    attachables: {}
  }
  const own = stackOf([{ name: 'vanilla', files: { 'textures/mob/cow.png': png, 'models/mobs.json': { 'geometry.cow': { texturewidth: 64, textureheight: 32, bones: [{ name: 'head', pivot: [0, 20, -8] }] } } } }])

  it('takes the reference entities the version has textures of, with its own textures and geometry', () => {
    const out = legacyEntities(reference, own, [own], { kind: 'client' }, '0.14')
    assert.deepStrictEqual(Object.keys(out.entities), ['minecraft:cow'])
    assert.deepStrictEqual(out.entities['minecraft:cow'].textures, { default: 'textures/mob/cow' })
    assert.deepStrictEqual(out.geometry['geometry.cow.v1.8'].bones.map(b => b.name), ['head'])
    assert.deepStrictEqual(out.animations, reference.animations)
  })

  it('writes entities.json and the textures it names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entities-'))
    const r = exportEntityAssets({ version: '0.14', own, source: {}, dir, legacy: { referenceOut: reference, geometrySources: [own] } })
    assert.strictEqual(r.entities, 1)
    assert(fs.existsSync(path.join(dir, 'mob', 'cow.png')))
    assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'entities.json'), 'utf8')).entities), ['minecraft:cow'])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
