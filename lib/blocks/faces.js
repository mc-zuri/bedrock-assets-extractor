const { FACES } = require('./resolve')

const NON_TEXTURE_PROPS = new Set([
  'minecraft:cardinal_direction', 'minecraft:facing_direction', 'facing_direction', 'direction', 'weirdo_direction',
  'upside_down_bit', 'minecraft:corner', 'pillar_axis', 'persistent_bit', 'update_bit', 'redstone_signal',
  'button_pressed_bit', 'door_hinge_bit', 'open_bit', 'minecraft:vertical_half', 'torch_facing_direction',
  'rail_direction', 'rail_data_bit', 'ground_sign_direction', 'orientation', 'in_wall_bit', 'attached_bit',
  'coral_direction', 'stability', 'stability_check', 'minecraft:block_face', 'vine_direction_bits',
  'multi_face_direction_bits', 'wall_post_bit', 'head_piece_bit', 'occupied_bit', 'toggle_bit', 'attachment',
  'minecraft:connection_north', 'minecraft:connection_east', 'minecraft:connection_south', 'minecraft:connection_west',
  'wall_connection_type_north', 'wall_connection_type_east', 'wall_connection_type_south', 'wall_connection_type_west'
])
const DOOR_PROPS = new Set(['upper_block_bit'])
const TYPE_PROP = /(_type|_color|^color)$/

function isFunctionOf (states, props) {
  const seen = new Map()
  for (const s of states) {
    const key = props.map(p => s.props[p]).join('|')
    const faces = s.faces.join('|')
    if (seen.has(key) && seen.get(key) !== faces) return false
    seen.set(key, faces)
  }
  return true
}

function canonicalFaces (states, shape, baseFaces, texturePick = null) {
  const result = new Map()
  const withFaces = states.filter(s => s.faces)
  if (withFaces.length === 0) return result
  const first = withFaces.reduce((a, b) => (b.data < a.data ? b : a))
  const base = baseFaces ?? first.faces
  const candidates = Object.keys(first.props).filter(p => p === texturePick || (!NON_TEXTURE_PROPS.has(p) && !(shape === 'Door' && DOOR_PROPS.has(p))))
  if (candidates.length === 0) {
    for (const s of states) result.set(s, base)
    return result
  }
  const distinct = new Set(withFaces.map(s => s.faces.join('|')))
  let ownFaces = distinct.size === 1
  for (let i = 0; i < candidates.length && !ownFaces; i++) {
    if (isFunctionOf(withFaces, [candidates[i]])) ownFaces = true
    for (let j = i + 1; j < candidates.length && !ownFaces; j++) {
      if (isFunctionOf(withFaces, [candidates[i], candidates[j]])) ownFaces = true
    }
  }
  if (ownFaces) {
    for (const s of states) result.set(s, s.faces ?? base)
    return result
  }
  const types = candidates.filter(p => TYPE_PROP.test(p))
  if (types.length) {
    const firstOfType = new Map()
    for (const s of withFaces) {
      const t = types.map(p => s.props[p]).join('|')
      if (!firstOfType.has(t) || s.data < firstOfType.get(t).data) firstOfType.set(t, s)
    }
    for (const s of states) result.set(s, firstOfType.get(types.map(p => s.props[p]).join('|'))?.faces ?? base)
    return result
  }
  for (const s of states) result.set(s, base)
  return result
}

function doorWood (name, faces, hasTexture) {
  const wood = name.replace(/_door$/, '')
  if (!faces || name === 'wooden_door' || wood === name) return faces
  return faces.map(p => {
    const own = p.replace(/\/door_wood_/, `/door_${wood}_`)
    return own !== p && hasTexture(own) ? own : p
  })
}

const LEGACY_DOORS = { wooden_door: 'wood', spruce_door: 'spruce', birch_door: 'birch', jungle_door: 'jungle', acacia_door: 'acacia', dark_oak_door: 'dark_oak', iron_door: 'iron' }

const CURVED_RAIL = d => +d >= 6

function drawnFaces (state, shape, faces, hasTexture) {
  const p = state.props
  const all = t => FACES.map(() => t)
  switch (shape) {
    case 'Torch': case 'Lantern': case 'Vine': case 'MultifaceBlock': case 'Ladder': case 'FenceGate': case 'DoublesidedRows':
      return all(faces[2])
    case 'Rail':
      return all(CURVED_RAIL(p.rail_direction ?? 0) || p.rail_data_bit === '1' ? faces[1] : faces[0])
    case 'Lilypad': case 'FlowerBed': case 'PaleMossCarpet':
      return all(faces[1])
    case 'Door': {
      const half = p.upper_block_bit === '1' ? 'upper' : 'lower'
      const legacy = LEGACY_DOORS[state.name] && `textures/blocks/door_${LEGACY_DOORS[state.name]}_${half}`
      return all(legacy && hasTexture(legacy) ? legacy : half === 'upper' ? faces[2] : faces[0])
    }
  }
  if (CROSS_SHAPES.has(shape)) return all(p.upper_block_bit !== undefined ? (p.upper_block_bit === '1' ? faces[1] : faces[0]) : faces[2])
  return faces
}

const CROSS_SHAPES = new Set(['CrossTexture', 'DoublesidedWideCrossTexture', 'DoublesidedDoublePlant', 'Seagrass', 'Kelp',
  'WeepingVine', 'TwistingVine', 'CaveVine', 'SweetBerryBush', 'MangrovePropagule', 'BambooSapling', 'Eyeblossom',
  'FireflyBush', 'PitcherPlant', 'PitcherCrop', 'CoralFan', 'Fire', 'Stem', 'SporeBlossom'])

module.exports = { canonicalFaces, doorWood, drawnFaces, NON_TEXTURE_PROPS, LEGACY_DOORS, CROSS_SHAPES }
