/* eslint-env mocha */
const assert = require('assert')
const { buildBlockState } = require('../lib/blocks/blockstate')

const part = (model, y) => y ? { model, y } : { model }

describe('buildBlockState', () => {
  it('keys variants by the fewest properties that tell the models apart', () => {
    const states = []
    for (const dir of [0, 1, 2, 3]) {
      for (const up of [0, 1]) states.push({ props: { weirdo_direction: dir, upside_down_bit: up }, parts: [part(up ? 'top' : 'bottom', dir * 90)] })
    }
    const { variants } = buildBlockState(states)
    assert.deepStrictEqual(Object.keys(variants).sort(), states.map(s => `weirdo_direction=${s.props.weirdo_direction},upside_down_bit=${s.props.upside_down_bit}`).sort())
    assert.deepStrictEqual(variants['weirdo_direction=2,upside_down_bit=1'], part('top', 180))
  })

  it('keys a block of one model by nothing', () => {
    const states = [{ props: { a: 0 }, parts: [part('m')] }, { props: { a: 1 }, parts: [part('m')] }]
    assert.deepStrictEqual(buildBlockState(states), { variants: { '': part('m') } })
  })

  it('draws a state with no parts as air', () => {
    const { variants } = buildBlockState([{ props: { a: 0 }, parts: [] }, { props: { a: 1 }, parts: [part('m')] }])
    assert.deepStrictEqual(variants, { 'a=0': { model: 'minecraft:block/air' }, 'a=1': part('m') })
  })

  it('writes several parts as a multipart with the properties each part depends on', () => {
    const states = []
    for (const post of [0, 1]) {
      for (const north of ['none', 'short']) {
        const parts = []
        if (post) parts.push(part('post'))
        if (north !== 'none') parts.push(part('side'))
        states.push({ props: { wall_post_bit: post, wall_connection_type_north: north }, parts })
      }
    }
    const { multipart } = buildBlockState(states)
    assert.deepStrictEqual(multipart.sort((a, b) => a.apply.model < b.apply.model ? -1 : 1), [
      { apply: part('post'), when: { wall_post_bit: '1' } },
      { apply: part('side'), when: { wall_connection_type_north: 'short' } }
    ])
  })

  it('joins the values of a when that are not every combination with OR', () => {
    const states = []
    for (const a of [0, 1]) for (const b of [0, 1]) states.push({ props: { a, b }, parts: a !== b ? [part('x'), part('y')] : [part('y')] })
    const { multipart } = buildBlockState(states)
    assert.deepStrictEqual(multipart, [
      { apply: part('y') },
      { apply: part('x'), when: { OR: [{ a: '0', b: '1' }, { a: '1', b: '0' }] } }
    ])
  })
})
