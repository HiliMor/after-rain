# After Rain

A small, interactive forest after the rain. A standalone Three.js scene with a wet canopy leaf, a refracting droplet, a shallow pool, procedural moss and ferns, a warm firefly, and a shy snail.

**Canonical code root:** `/Users/hilimor/Documents/after-rain`. This is an independent local Git repository. It does not depend on or change Skógafoss.

## Run locally

Use Node.js 24 (developed with 24.18.0) and npm.

```sh
cd /Users/hilimor/Documents/after-rain
npm ci
npm run dev
```

Open **http://127.0.0.1:4187/**. Port 4187 is deliberately separate from 4173 and 5173. `strictPort` prevents Vite silently taking another project's port.

```sh
npm run build                 # TypeScript check + production build
npm run preview               # Serve dist on 4187; stop dev first
npm run preview -- --port 4188 # Serve production alongside dev
npm test                      # Browser interaction tests (installed Chrome)
```

To test the production server on 4188: `PREVIEW_URL=http://127.0.0.1:4188 npm test`.

The browser needs hardware accelerated WebGPU or WebGL 2. The default renderer prefers WebGPU and falls back to WebGL 2. Add `?webgl=1` to deliberately exercise the fallback. No remote services, accounts, API keys, generated-asset credits, or public deployment are involved. Fonts and all assets are served locally.

## Explore

| Action               | Mouse / keyboard                               | Touch                                               |
| -------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Carry the warm light | Move over the scene; arrow keys also move it   | Touch and drag                                      |
| Wake the moss        | Move the light, or click the forest floor      | Drag or tap the forest floor                        |
| Release water        | Click the large leaf or **Let it rain**        | Tap the leaf or **Let it rain**                     |
| Find the snail       | **A quiet neighbour** brings the camera closer | Same button; approaching its shell makes it retract |
| Look closer          | Scroll, or `+` / `-` keys                      | Pinch outward / inward                              |
| Change angle         | Compass button cycles three camera views       | Same button                                         |
| Touch the lake       | Click the pool to send rings through the water | Tap the pool                                        |
| Return home          | **Reset view** or Escape                       | **Reset view**                                      |
| Sound                | Optional sound button, initially off           | Same                                                |
| Instructions         | **Field notes**, Escape to close               | **Field notes**, close button                       |

Water gathers in the cupped underside of the hero leaf. The leaf sways, the concealed bead pulls free and crawls slowly toward the tip before falling, creating ripples and splash beads. Clicking or tapping the pool sends a second set of travelling rings through the water and nudges the floating leaf. The land snail stays on the damp bank beside the pool, gradually emerges, explores with separate tentacles, and retracts when the pointer/light approaches. It extends again when given space. The close-up looks across the water, which keeps undergrowth out of the sightline, and narrow portrait stands further back so the head and tentacles stay in frame. It returns after 12 seconds or immediately with Reset view.

## Implementation

- Vite 8, TypeScript, Three.js r186 `WebGPURenderer` and TSL node materials.
- Seeded procedural geometry, separate linear height/roughness maps, and local CC0 photographic PBR scans for bark and forest litter. Leaf veins, skin cells, shell growth striations, and mushroom fibers are authored procedurally. No stock models or AI-generated image backgrounds.
- Instanced vegetation: 28,000 curved blades and 2,800 fine-leaved moss shoots on desktop; fewer blades on narrow screens. Shared fern geometry, merged mushroom gills, and instanced ground detail keep draw counts bounded.
- Mushrooms are aged rather than scaled from one copy: each draws its own cap profile, from young domed caps to broad ones with a lifted margin, with an independently leaning stem, a crown tilted off true, and per-cap pigment that darkens over the centre.
- Background trunks vary in value per instance, darken toward the base and spread over a deeper band so the fog separates them into layers; the backdrop is a shallow vertical gradient with the fog matched to the band the trunks stand in.
- A second broad-leaf understory layer and a softer ring of water-edge reeds add species variation around the clearing; leaf materials carry local wind deformation and nearby-light response.
- Foliage is translucent: light reaching the far side of a blade carries through to the camera, from the carried warm light and, more faintly, from the moon behind the clearing, so leaves read as lit rather than as opaque cutouts. A cheap directional approximation, not a subsurface solver.
- Wet surfaces are a rough leaf under a thin water film, so the gloss sits in a clearcoat broken up by the leaf's own roughness relief rather than in the substrate. A tight film blew out into mirror highlights and was softened; the moss carpet carries less of it, since a sharp film on instanced blades that small sparkles into aliasing.
- Physical transmission with water's IOR (1.333), reflective wet surfaces, environment lighting, TSL moss light propagation, layered water normals, and restrained bloom. A pale frond behind the drop makes its refraction visible.
- The pool shades by actual depth: the sheet reconstructs the basin floor from the same profile the terrain mesh uses, carries a silty bank tone where it runs thin and a darker body where it deepens, and fades out as it thins so the shoreline is drawn by the ground contour rather than by the edge of a disc. Reflection is weighted by a grazing-angle term instead of mixed in at constant strength. A compass control cycles the wide clearing, waterline and leaf-study camera angles.
- Desktop uses planar pool reflections and depth of field. Narrow screens use environment reflections and no depth of field. The reflector uses the main viewport's resolution: a reduced-size reflector interacting with r186 transmission produced WebGPU validation errors during development, so that combination is intentionally avoided.
- Narrow screens use fewer moss instances and no depth of field. Scene framing responds to viewport changes; the initial quality tier remains in place until reload. DPR is capped, and slow rendering can trigger one further resolution reduction after warm-up.
- Materials use patchy roughness and restrained specular response, with the strongest highlights reserved for water. Directional PCF shadows anchor objects; they are cached and refreshed periodically or during a drop. The reflective pool does not cast into its own shadow pass.
- The land snail is staged on damp ground outside the pool edge, with a flattened irregular foot, separate head/mantle volumes, rough cellular skin, and a dark expanding shell whorl.
- The hero drop stays hidden while idle; on interaction water gathers and runs down the blade as a flattened dome wetting the surface, drawn out along its direction of travel and lying along the slope it is on rather than tumbling, with a narrower neck and satellite beads trailing it. It becomes the pendant shape only where it hangs at the tip. Once airborne it is a sphere holding the same volume the running bead did, carrying the size it had on the leaf rather than changing scale at the moment it lets go; it leaves still drawn out by the neck it broke from, then rings between stretched and flattened as surface tension settles it, and falls to where its underside meets the water. The wet mark it leaves is a flat ribbon laid on the blade, each edge sampling the leaf surface at its own offset so it follows the cup. Resting beads are placed from the same surface formula the leaf is built from and wet down into shallow lenses.
- Reduced-motion preference disables passive wind, camera parallax, drifting particles, firefly flight, snail travel and tentacle exploration. Explicitly requested water interactions and the snail's response remain available. Scene time pauses while the tab is hidden.
- Optional ambient sound is synthesized with Web Audio. It is off until a user gesture, and suspends with the hidden tab.
- Wheel deltas are normalised across `deltaMode`, so one notch means the same on a pixel-reporting browser and a line-reporting one; a single event is capped only against absurd spikes. `+` / `-` give looking closer a keyboard path.
- Pointer parallax swings the desktop camera around the clearing far enough to read, with the look target following a fraction of the swing so the composition stays anchored while the foreground travels against the distance. Touch viewports keep a fixed frame, since a drag there is already carrying the light.
- The camera follows its framing directly rather than smoothing an already-smoothed value at half rate, and the parallax offset settles on its own slower curve so a twitchy pointer cannot shake the frame. The push in to the snail stays deliberately slower than ordinary movement, and parallax is kept separate from the pointer used for picking so hit testing stays exact.
- Controls have accessible names, focus indicators, keyboard equivalents, and a native modal dialog. The decorative canvas is accompanied by a scene description. Renderer initialization failure displays a readable recovery panel.

### Source map

- `src/forest.ts` — scene construction, TSL materials, camera, interactions and animation.
- `src/nature.ts` — deterministic textures, organic geometry and terrain helpers.
- `src/surfaces.ts` — locally bundled scanned PBR maps and separate procedural surface-detail maps.
- `src/audio.ts` — opt-in synthesized ambience and drop sounds.
- `src/main.ts` — interface and application lifecycle.
- `src/style.css`, `index.html` — responsive interface and typography.
- `tests/forest.spec.ts` — browser tests of actual inputs and renderer states.

Read-only diagnostic state is available as `window.__afterRain.state()` for QA. It contains scene/rendering state only.

## Validation and remaining polish

The first version was visually inspected at 1512×982, 1280×800, and 390×844 in Chrome. Browser tests cover desktop interactions, direct leaf hits, snail approach/retreat, sound toggles, notes, zoom/reset, touch drag/pinch, viewport changes, forced WebGL 2, reduced motion, and the unsupported-renderer state. See `QA.md` for the recorded production run.

The scene remains an authored, stylized environment even after the material realism pass. It now uses photographic bark/ground detail, caps that differ in maturity rather than in scale alone, irregular leaf edges, fine curled moss, an expanding-whorl snail shell and cellular skin relief. The snail still uses joint/scale animation rather than an anatomical skin rig. The drop and waves are authored animations and shaders, not a fluid simulation. Directional shadows are cached at a limited update rate; there is no full contact-occlusion solution or volumetric scattering. Atmospheric shafts are soft translucent geometry. Actual iOS/Safari/Android hardware still needs verification before a public release. Audio controls were functionally checked; no studio listening/mixing pass is claimed.

The source is private/unlicensed unless the owner chooses a distribution license. See `CREDITS.md` for third-party licensing.

Implementation references: [Three.js WebGPU guide](https://threejs.org/manual/pages/webgpurenderer.html), [node post-processing](https://threejs.org/manual/pages/webgpu-postprocessing.html), [TSL documentation](https://threejs.org/docs/pages/TSL.html).
