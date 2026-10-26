const fs = require('fs')
const path = require('path')
const { planVersion, openSource, describeSource } = require('./sources')
const { checkoutGitSource } = require('./sources/git')
const { compareVersions, family } = require('./pack/versions')
const { TextureStore } = require('./textures/store')
const { exportBlocks } = require('./blocks')
const { exportItems } = require('./items')
const { exportEntities } = require('./entities')
const { exportEntityAssets, compiledTextOf } = require('./entities/write')
const { materialsFor } = require('./entities/materialsTable')
const { PackStack } = require('./pack/stack')

function ownStack (stack, plan) {
  const later = plan.later.map(c => c.build + '/')
  return new PackStack(stack.layers.filter(l => !later.some(prefix => l.name.startsWith(prefix))))
}

function writeJson (file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function exportVersion ({ version, out, sources, cacheDir, mcDataModule, tables, reference, newest, log = console.log }) {
  const mcData = mcDataModule('bedrock_' + version)
  if (!mcData?.blocksArray) throw new Error(`minecraft-data has no blocks of bedrock ${version}`)
  const legacy = mcData.blockStates ? null : { blocks: mcDataModule.legacy.bedrock.blocks, reference: mcDataModule('bedrock_' + reference) }
  const plan = planVersion(version, sources)
  const stack = openSource(plan.source, cacheDir, plan.supplement, plan.later)
  const store = new TextureStore(stack)
  const blocks = exportBlocks({ stack, mcData, store, tables, legacy, newest: mcDataModule('bedrock_' + newest) })
  const items = exportItems({ version, stack, mcData, store, itemBlocks: blocks.itemBlocks, resolveBlock: blocks.resolveBlock, itemIcons: tables.itemIcons, reference: legacy?.reference })

  const dir = path.join(out, version)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const own = ownStack(stack, plan)
  const materialsTable = materialsFor(tables.entityMaterials, version)
  let legacyEntities = null
  if (legacy) {
    const referencePlan = planVersion(reference, sources)
    const referenceOwn = ownStack(openSource(referencePlan.source, cacheDir, referencePlan.supplement, referencePlan.later), referencePlan)
    const nearestNewer = plan.later.length ? openSource(plan.later[plan.later.length - 1], cacheDir) : null
    legacyEntities = {
      referenceOut: exportEntities({ version: reference, stack: referenceOwn, source: describeSource(referencePlan.source), materialsTable: materialsFor(tables.entityMaterials, reference) })?.out,
      geometrySources: [own, nearestNewer].filter(Boolean)
    }
  }
  const entities = exportEntityAssets({
    version,
    own,
    source: describeSource(plan.source),
    dir,
    materialsTable,
    compiledText: compiledTextOf(version, sources, cacheDir, { checkoutGitSource, family, compareVersions }),
    legacy: legacyEntities
  })
  writeJson(path.join(dir, 'blocks_states.json'), blocks.blocksStates)
  writeJson(path.join(dir, 'blocks_models.json'), blocks.blocksModels)
  writeJson(path.join(dir, 'blocks_textures.json'), blocks.blocksTextures)
  writeJson(path.join(dir, 'items_textures.json'), items.itemsTextures)
  writeJson(path.join(dir, 'texture_content.json'), items.textureContent)
  store.write(dir)

  const meta = {
    version,
    source: describeSource(plan.source),
    supplement: plan.supplement ? describeSource(plan.supplement) : undefined,
    later: plan.later.length ? plan.later.map(describeSource) : undefined,
    blocks: Object.keys(blocks.blocksStates).length,
    states: mcData.blockStates?.length ?? Object.values(blocks.blocksStates).length,
    models: Object.keys(blocks.blocksModels).length,
    textures: store.out.blocks.size,
    items: items.itemsTextures.length,
    itemTextures: store.out.items.size,
    itemsWithoutIcon: items.unresolved,
    entities: entities.entities,
    entitiesMissing: entities.entitiesMissing,
    entityTexturesMissing: entities.missingTextures,
    attachables: entities.attachables,
    animations: entities.animations,
    particles: entities.particles,
    particlesCompiled: entities.particlesCompiled,
    shapes: blocks.report.shapes,
    missingTile: blocks.report.missingTile,
    unrendered: blocks.report.unrendered,
    missingTextures: blocks.report.missingTextures,
    failed: blocks.report.failed
  }
  writeJson(path.join(dir, 'meta.json'), meta)
  log(`bedrock ${version}: ${meta.blocks} blocks, ${meta.models} models, ${meta.textures} textures from ` +
    `${plan.source.kind} ${plan.source.build} (${plan.source.match}); ${meta.missingTile.length} drawn as missing_tile, ` +
    `${meta.unrendered.length} without render facts, ${meta.failed.length} failed; ` +
    `${meta.items} items, ${meta.itemsWithoutIcon.length} without an icon; ${meta.entities} entities, ` +
    `${meta.animations} animations, ${meta.attachables} attachables, ${meta.particles} particle effects`)
  return meta
}

module.exports = { exportVersion }
