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

Water travels along the leaf, gathers at its tip, falls, creates ripples and splash beads, and rocks the floating leaf. A new drop grows over the following seconds. The snail gradually emerges, explores with separate tentacles, and retracts when the pointer/light approaches. It extends again when given space. The close-up returns after 12 seconds or immediately with Reset view.

## Implementation

- Vite 8, TypeScript, Three.js r186 `WebGPURenderer` and TSL node materials.
- Seeded procedural geometry and canvas textures: leaf venation and pores, bark fissures, soil, mushroom caps, and shell striations. No stock models or AI-generated image backgrounds.
- Instanced vegetation: 34,000 curved blades and 2,200 whorled shoots on desktop; fewer blades on narrow screens. Shared fern geometry, merged mushroom gills, and instanced ground detail keep draw counts bounded.
- Physical transmission with water's IOR (1.333), reflective wet surfaces, environment lighting, TSL moss light propagation, water normals, and restrained bloom. A pale frond behind the large drop makes its refraction visible.
- Desktop uses planar pool reflections and depth of field. The reflector uses the main viewport's resolution: a reduced-size reflector interacting with r186 transmission produced WebGPU validation errors during development, so that combination is intentionally avoided.
- Narrow screens start with environment reflections and no depth of field. Scene framing responds to viewport changes; the initial quality tier remains in place until reload. DPR is capped, and slow rendering can trigger one further resolution reduction after warm-up.
- Reduced-motion preference disables passive wind, camera parallax, drifting particles, firefly flight, snail travel and tentacle exploration. Explicitly requested water interactions and the snail's response remain available. Scene time pauses while the tab is hidden.
- Optional ambient sound is synthesized with Web Audio. It is off until a user gesture, and suspends with the hidden tab.
- Controls have accessible names, focus indicators, keyboard equivalents, and a native modal dialog. The decorative canvas is accompanied by a scene description. Renderer initialization failure displays a readable recovery panel.

### Source map

- `src/forest.ts` — scene construction, TSL materials, camera, interactions and animation.
- `src/nature.ts` — deterministic textures, organic geometry and terrain helpers.
- `src/audio.ts` — opt-in synthesized ambience and drop sounds.
- `src/main.ts` — interface and application lifecycle.
- `src/style.css`, `index.html` — responsive interface and typography.
- `tests/forest.spec.ts` — browser tests of actual inputs and renderer states.

Read-only diagnostic state is available as `window.__afterRain.state()` for QA. It contains scene/rendering state only.

## Validation and remaining polish

The first version was visually inspected at 1512×982, 1280×800, and 390×844 in Chrome. Browser tests cover desktop interactions, direct leaf hits, snail approach/retreat, sound toggles, notes, zoom/reset, touch drag/pinch, viewport changes, forced WebGL 2, reduced motion, and the unsupported-renderer state. See `QA.md` for the recorded production run.

This is a crafted, procedural first version, not a photoreal scanned environment. The most valuable next visual work is finer moss silhouettes, more organic mushroom caps, and a less geometric snail body/shell. The current snail uses authored joint/scale motion rather than a skinned anatomical model. The drop and waves are authored animations and shaders, not a fluid simulation. There is no full shadow/contact-occlusion solution or volumetric scattering; atmospheric shafts are soft translucent geometry. The narrow-screen pool intentionally has simpler reflections. Actual iOS/Safari/Android hardware still needs verification before a public release. Audio controls were functionally checked; no studio listening/mixing pass is claimed.

No GitHub remote or public deployment has been created. The source is private/unlicensed unless the owner chooses a distribution license. See `CREDITS.md` for third-party licensing.

Implementation references: [Three.js WebGPU guide](https://threejs.org/manual/pages/webgpurenderer.html), [node post-processing](https://threejs.org/manual/pages/webgpu-postprocessing.html), [TSL documentation](https://threejs.org/docs/pages/TSL.html).
