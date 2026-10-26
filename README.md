# bedrock-assets-extractor

Exports the block and item assets of Minecraft Bedrock Edition into
[minecraft-assets](https://github.com/PrismarineJS/minecraft-assets) (`data/bedrock/<version>/`), in the format its
Java versions already have, so that [prismarine-viewer](https://github.com/PrismarineJS/prismarine-viewer) draws
Bedrock worlds with the code it draws Java worlds with. It is to Bedrock what
[minecraft-jar-extractor](https://github.com/PrismarineJS/minecraft-jar-extractor) is to Java.

Everything it writes comes from Bedrock itself — no Bedrock state is mapped to a Java one, and no Java asset is used:

- the block states: minecraft-data's Bedrock palette of the version (`blockStates.json`), and for 0.14 - 1.0, which
  have none, the block ids and data values minecraft-data's legacy table (`bedrock/common/legacy.json`) names the
  Bedrock state of;
- the geometry: each state's own Bedrock shapes (minecraft-data's `blockCollisionShapes.json` and
  `blockSelectionShapes.json`; for 0.14 - 1.0, which minecraft-data has no shapes of, those of the same Bedrock state
  in the oldest version it has them of, 1.16.201) laid out as the client's tessellator draws that block
  (`data/block_render.json`);
- the textures: the Bedrock resource packs' `blocks.json` and `terrain_texture.json` (a list of textures indexed by
  the state's legacy data value, `data/data_layouts.json`), `item_texture.json`, `flipbook_textures.json` and the
  texture files.

It ships no Minecraft assets (see [NOTICE.md](NOTICE.md)): it reads them from an installed client or from Mojang's
published packs, and writes them for you.

## Usage

```
npx bedrock-assets-extractor [versions...] [--out <dir>] [--cache <dir>] [--clients <dir>]
  [--sources client,bedrock-samples,MCBVanillaResourcePack] [--plan]
```

- `versions`: minecraft-data's Bedrock versions (`1.21.0`, `0.14`); all of them by default.
- `--out`: where the versions go, `data/bedrock` of the installed minecraft-assets by default.
- `--cache`: where the public sources are cloned (`.cache`).
- `--clients`: installed clients, as MCLauncher keeps them: `<dir>/Minecraft-<a.b.c.d>/` (or `BEDROCK_CLIENTS_DIR`).
- `--sources`: the kinds of source to choose from.
- `--plan`: print the source each version takes, and stop.

A version takes the pack of an installed client of its own build, else of its hotfix family, else the nearest of its
minor; a git source (a release tag of [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples), 1.19.30 on,
or a commit of [ZtechNetwork/MCBVanillaResourcePack](https://github.com/ZtechNetwork/MCBVanillaResourcePack)) is
supplemented by the nearest client where there is one. Below them all lie the nearest client newer than the version
and the newest client, which only fill what the version's own packs lack: a server's blocks its client has no
textures of yet (1.18.30's mud and mangrove, 1.17.30's sculk, behind experiments until 1.19.0). The public sources are
blobless clones; only the files a version reads are checked out.

After the versions it writes `versions.json`: each version's folder. A version whose files are all the same as the
version before it shares that one's folder (`"1.21.2": "1.21.0"`).

## Output, per version

| File | Content |
|---|---|
| `blocks_states.json` | Java blockstates keyed by Bedrock block name. A variant key is the Bedrock state's properties as `getProperties()` of prismarine-block gives them (`weirdo_direction=2,upside_down_bit=1`, a byte as `0`/`1`), over the fewest properties that tell the block's models apart. Walls, fences and panes are `multipart`: the post and an arm turned to each connected side (`wall_connection_type_north=short`, `minecraft:connection_east=1`). |
| `blocks_models.json` | Java models. Geometry is in parents (`cube`, `geometry_<n>`), each state's textures in a child. Faces carry `cullface`, and `tintindex: 0` where the client tints them. |
| `blocks/*.png` | The Bedrock textures the models name, PNG (TGA converted), animated strips with the `.mcmeta` of their flipbook. A texture whose alpha is the mask the client tints (`grass_side`) is an opaque base and `<name>_overlay`. |
| `blocks_textures.json` | `[{ name, blockState, model, texture }]`, each block's default state. |
| `items_textures.json` | `[{ name, model, texture }]` of every minecraft-data item: `minecraft:items/<file>` or `minecraft:block/<file>`. `model` is the item's name, or `minecraft:block/<block>` for a block item the client draws as its block (a log, a slab, a chest): that block of `blocks_states.json`, in its default state. A block item of a shape the client draws flat (a torch, a flower, a rail, a pane) keeps its name, and is drawn as its icon. |
| `items/*.png` | Item icons: the item's definition, its `item_texture.json` entry, the icons the client names in code; a spawn egg in its mob's colours and a block item's carried texture in its fixed colours, baked. A legacy item (0.14 - 1.0), which minecraft-data names by its display name (`leather_cap`), takes the icon of the item of that display name (`leather_helmet`); a photo, which has no icon of its own, the camera's. |
| `texture_content.json` | `[{ name, texture }]`: each item's icon as a data URL. |
| `entities.json` | The client entity resources of the version's packs, as the client reads them: `entities` (each client entity description, the file of the highest `min_engine_version`, every pack's copy of it merged), `attachables` (what an item worn or held is drawn with), `geometry` (every format as one, inheritance resolved), `render_controllers`, `animations`, `animation_controllers`, `materials` (each resolved through its parents), `entity_properties` (the behaviour pack's), `missing`, `problems`. |
| `particles.json` | `{ format_version: 1, particles: { identifier: effect }, files, missing }`: the particle effects as the packs write them (Molang, curves, events). |
| `entity/`, `models/armor/`, `particle/`... | The textures those name, as PNG at their path below `textures/`; one the packs name but lack is the nearest they have (`lib/textures/substitute.js`). |
| `meta.json` | The source, counts, and what was not resolved. |

### How blocks are drawn

The generator of a state is chosen by the tessellator shape the client reports for its block (`Block`, `Stairs`,
`Fence`, `Torch`, `DoublesidedWideCrossTexture`, ...):

- box shapes (slabs, stairs, trapdoors, cakes, hoppers, cauldrons, anvils, beds, chests, ...): the state's own
  collision boxes, else its selection box, each face textured by its side;
- doors: as the client lays a door out (the classic door models: a slab 3 thick, turned to the door's facing, a quarter
  turn further about its hinge when open), not their collision boxes, which are the same for every state. A door's
  lower half holds its direction and openness and its upper half its hinge; prismarine-viewer gives each half the
  other's;
- a block with a front (furnace, dispenser, observer, carved pumpkin, glazed terracotta): turned to its facing;
- logs, basalt, chains: turned to their pillar axis;
- plants: two crossed planes; crops four in a #; torches (leaning off the wall their selection box is on), lanterns,
  rails (flat, ascending, curved), ladders, vines, glow lichen, redstone dust, lily pads, fence gates, levers,
  repeaters and comparators: as their tessellator lays them out;
- big dripleaves (the leaf tilted by its tilt), small dripleaves, azaleas, beacons (shell, base and core), sea pickles
  (by count, dead ones without their tufts) and pointed dripstone (crossed planes of the texture of its thickness,
  hanging or standing): as the client lays them out, not their boxes (a small dripleaf's is the whole block, a fully
  tilted leaf has none);
- pistons: the base 12 deep with the inside of its front, and the arm the client's block entity renderer draws, the
  head pushed out on its rod by the block entity's progress (`block_entity.Progress`); the arm's collision block draws
  nothing, as in the client. A piston's `facing_direction` runs 0 down, 1 up, 2 south, 3 north, 4 east, 5 west;
- fences: the client's fence tessellator boxes (`data/tessellator_shapes.json`); walls: post and arms from their
  states; panes and bars: a sheet to each connected side, across both axes when unconnected;
- chests, beds, heads, signs, hanging signs, banners, decorated pots and copper golem statues, which the client draws
  with block entity renderers: beds with the packs' `geometry.bed` laid flat across their two halves, heads with the
  geometry and texture the `minecraft:skull` client entity gives their type, statues with `geometry.copper_golem`,
  the others as their renderers lay them out (the classic chest's base, lid and latch; the sign's board at 2/3, on its
  stick or against its wall; the hanging sign's board on its chains, under its plank on a wall; the banner's flag and
  crossbar at 2/3, on its pole or hanging from a wall; the pot's body, neck and rim), all on their entity texture
  sheets (copied into `blocks/` as `entity__chest__normal`, `entity__bed__red`...);
- water and lava: the still texture, which prismarine-viewer draws as a liquid.

A colour the client gives a block whatever the biome (a lily pad, a birch or spruce leaves block of before the
flattening, a stem by its growth, redstone dust by its power) is baked into a tinted copy of the texture, since
prismarine-viewer picks a tint by block name; grass and foliage keep `tintindex` and take the biome's colour.

### Entities and particle effects

`entities.json` and `particles.json` are the version's own resources, unevaluated: prismarine-viewer's Bedrock entity
runtime draws them as the client does, its render controllers, animations and animation controllers run in Molang
each frame, with its materials and attachables (`viewer/lib/bedrock`). They are read from the version's own packs, not
the newer clients' below them.

- Of the files describing one entity, the client reads the one of the highest `min_engine_version`, every pack's copy
  of that file merged (1.19.60's `iron_golem.entity.json` is its spawn egg alone).
- Materials come from `materials/*.material`; a source with none (bedrock-samples) takes them from
  `data/entity_materials.json`, the client's, resolved, per range of versions.
- 1.26.51's client ships its particle effects compiled (binary `MCB` files): their text is Mojang's published pack of
  the version (bedrock-samples), each checked against the compiled file (`lib/particles/compiled.js`).
- Every texture of `textures/models/armor/` is written too: before 1.26.10 the client drew armour in code, and the
  viewer draws it with the newest version's attachables where the version has their textures.

0.14 - 1.0 have no client entity resources (the client draws its mobs and particles in code): their `entities.json`
is the reference version's (1.16.201), drawn with the version's own textures (`textures/mob/` in 0.14 and 0.15) and
geometry (`models/mobs.json`; 0.14, which has none, the nearest newer client's) where it has them. An entity none of
whose textures the version has is left out.

### Shapes the neighbours decide

From 1.26.50 the states of fences, panes and bars say their connections (`minecraft:connection_north`...) and those
of stairs their corner (`minecraft:corner`). Before, the client works them out from the neighbours. Their blockstates
are keyed by those states in every version: a fence of an older version is written with each of its connections
(each a part of a multipart), a stair with each corner (the boxes the newest version's states of that corner have),
and prismarine-viewer works them out from the neighbours where a block's state lacks them. Walls say their connections
in every version.

No version's states say a redstone dust's connections: its blockstate is keyed by `minecraft:connection_<side>`
(`none`, `side`, `up`) in every version, a multipart of the parts the client draws: unconnected, the whole cross;
connected along one axis, the line across the block; else the cross's middle and an arm to each connected side; a
line up the face of each block it climbs.

### Block entity data

What a block entity holds is not in the state. A blockstate keyed by `block_entity.<tag>` is matched against the tags
of the block's block entity, which prismarine-viewer gives a block as properties of those names:

| Blocks | Keyed by | Drawn |
|---|---|---|
| beds | `block_entity.color` | the bed sheet of that colour (`textures/entity/bed/<colour>`) |
| heads on the floor | `block_entity.Rotation` | turned in the 16 steps of 22.5 degrees, either way round |
| the `skull` block (before 1.21.40) | `block_entity.SkullType` | the head of that type |
| chests (but ender chests) | `block_entity.pair` | `none`, or the side the other half of a double chest is on (its block entity's `pairx` and `pairz`): this block's half of the double chest, on the double sheet |
| chests | `block_entity.lid` | the lid and latch turned up about the hinge, from 0 (shut) to 9 (a quarter turn): how far a block event has opened it, which prismarine-viewer animates |
| pistons | `block_entity.Progress` | the arm out by 0, 0.5 or 1 block: its PistonArm block entity's progress |

The block entity's default comes first (a red bed, a skeleton skull facing south), the variant a block without a
block entity takes, and after them the variants keyed by the state alone, which a value of no step takes.

### What is not drawn

- A sign's text, a banner's colour and patterns (its flag draws the sheet's white: Bedrock's dye colours are in the
  client's code, in no pack), a decorated pot's sherds, a statue's pose: block entity
  data the client draws in code.
- Education Edition's chalkboards: a board over up to 3 x 2 blocks that its block entity lays out from one of them.
- Boats, whose geometry the client builds in code: the viewer draws them with the classic boat model, the layout
  Bedrock's boat textures keep.
- `mysterious_frame` and `mysterious_frame_slot` (1.17.40 - 1.18.11): server blocks behind an experiment that no
  client of those versions has textures or a `blocks.json` entry of; they draw as the missing tile, as the client
  draws them.

prismarine-viewer draws a Bedrock block's second layer (the water seagrass, kelp or a waterlogged stair stand in) as
the liquid it is.

## Tables

`data/` holds Bedrock facts the public sources do not carry, keyed by block name and state properties:

| Table | Content |
|---|---|
| `block_render.json` | Each block's tessellator shape, render layer and tint method, from the client's own exports |
| `block_render_overrides.json` | Hand corrections to it (leaves are cut out, a cauldron's water is tinted as water) |
| `flattening.json` | Legacy block names and the flattened block whose render facts each takes |
| `data_layouts.json` | How a block's properties pack into the legacy data value that indexes its textures |
| `tessellator_shapes.json` | The fence tessellator's boxes by connection mask |
| `legacy_keys.json` | The `blocks.json` key a block's description id names (`grass_block` → `grass`) |
| `item_icons.json` | The client's item definitions (`items/*.json`), per range of client versions |

## minecraft-data

The shapes come from minecraft-data. `blockSelectionShapes.json` (each state's selection box) is generated for every
Bedrock version by [bedrock-data-generator](https://github.com/mc-zuri/bedrock-data-generator) (`pnpm generate
blockSelectionShapes`) from [bedrock-data](https://github.com/mc-zuri/bedrock-data), in the layout of minecraft-data's
Java `blockSelectionShapes.json` (PrismarineJS/minecraft-data#1296, read through PrismarineJS/node-minecraft-data#468).
