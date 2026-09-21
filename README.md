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
| Look closer          | Scroll down; scroll up to pull back            | Pinch outward / inward                              |
| Return home          | **Reset view** or Escape                       | **Reset view**                                      |
| Sound                | Optional sound button, initially off           | Same                                                |
| Instructions         | **Field notes**, Escape to close               | **Field notes**, close button                       |

Water gathers in the cupped underside of the hero leaf. The leaf sways, the concealed bead pulls free and crawls slowly toward the tip before falling, creating ripples and splash beads. A new bead reforms inside the leaf. The land snail stays on the damp bank beside the pool, gradually emerges, explores with separate tentacles, and retracts when the pointer/light approaches. It extends again when given space. The close-up returns after 12 seconds or immediately with Reset view.

## Implementation

- Vite 8, TypeScript, Three.js r186 `WebGPURenderer` and TSL node materials.
- Seeded procedural geometry, separate linear height/roughness maps, and local CC0 photographic PBR scans for bark and forest litter. Leaf veins, skin cells, shell growth striations, and mushroom fibers are authored procedurally. No stock models or AI-generated image backgrounds.
- Instanced vegetation: 28,000 curved blades and 2,800 fine-leaved moss shoots on desktop; fewer blades on narrow screens. Shared fern geometry, merged mushroom gills, and instanced ground detail keep draw counts bounded.
- Physical transmission with water's IOR (1.333), reflective wet surfaces, environment lighting, TSL moss light propagation, layered water normals, and restrained bloom. A pale frond behind the drop makes its refraction visible.
- Desktop uses planar pool reflections and depth of field. Narrow screens use environment reflections and no depth of field. The reflector uses the main viewport's resolution: a reduced-size reflector interacting with r186 transmission produced WebGPU validation errors during development, so that combination is intentionally avoided.
- Narrow screens use fewer moss instances and no depth of field. Scene framing responds to viewport changes; the initial quality tier remains in place until reload. DPR is capped, and slow rendering can trigger one further resolution reduction after warm-up.
- Materials use patchy roughness and restrained specular response, with the strongest highlights reserved for water. Directional PCF shadows anchor objects; they are cached and refreshed periodically or during a drop. The reflective pool does not cast into its own shadow pass.
- The land snail is staged on damp ground outside the pool edge, with a flattened irregular foot, separate head/mantle volumes, rough cellular skin, and a dark expanding shell whorl.
- Reduced-motion preference disables passive wind, camera parallax, drifting particles, firefly flight, snail travel and tentacle exploration. Explicitly requested water interactions and the snail's response remain available. Scene time pauses while the tab is hidden.
- Optional ambient sound is synthesized with Web Audio. It is off until a user gesture, and suspends with the hidden tab.
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

The scene remains an authored, stylized environment even after the material realism pass. It now uses photographic bark/ground detail, irregular caps and leaf edges, fine curled moss, an expanding-whorl snail shell and cellular skin relief. The snail still uses joint/scale animation rather than an anatomical skin rig. The drop and waves are authored animations and shaders, not a fluid simulation. Directional shadows are cached at a limited update rate; there is no full contact-occlusion solution or volumetric scattering. Atmospheric shafts are soft translucent geometry. Actual iOS/Safari/Android hardware still needs verification before a public release. Audio controls were functionally checked; no studio listening/mixing pass is claimed.

No GitHub remote or public deployment has been created. The source is private/unlicensed unless the owner chooses a distribution license. See `CREDITS.md` for third-party licensing.

Implementation references: [Three.js WebGPU guide](https://threejs.org/manual/pages/webgpurenderer.html), [node post-processing](https://threejs.org/manual/pages/webgpu-postprocessing.html), [TSL documentation](https://threejs.org/docs/pages/TSL.html).
