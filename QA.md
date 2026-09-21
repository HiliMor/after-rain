# First-version QA — 2026-09-21

Environment: macOS, Node 24.18.0, Chrome 153.0.8010.48, Three.js 0.186.0, Vite 8.3.0. Playwright runs real Chrome with WebGPU enabled. Phone coverage is viewport/touch emulation, not a physical phone.

## Recorded checks

- `npm run build`: passed TypeScript and production compilation.
- `PREVIEW_URL=http://127.0.0.1:4188 npm test`: **5 passed** (31.5 seconds).
- Latest full run after the camera, touch-water and loading pass: `npm test`: **5 passed** (47.5 seconds).
- After strengthening the mobile width regression assertion and fixing the keyboard light-button state, the mobile and reduced-motion cases passed again: **2 passed** (9.6 seconds).
- Runtime error listeners found no JavaScript or renderer errors in the successful desktop, mobile and WebGL cases. The unsupported-renderer test intentionally disables both backends and checks the error UI.
- After the final mushroom-light shader and source formatting, desktop WebGPU and WebGL interaction cases passed again: **2 passed** (22.7 seconds).
- `npm run format:check` and the final production build passed.
- Final visual inspection: desktop opening frame, drop impact, snail close-up, narrow portrait, and the forced WebGL path.
- Asset/font requests remain local. License notices are included in the build.
- Material pass: local CC0 bark and forest-floor PBR maps, procedural roughness/height detail, PCF shadows, rougher wet surfaces, irregular fronds and mushroom caps, fine curled moss, and an expanding-whorl snail shell were reviewed in desktop, narrow portrait, and close-up views.
- Follow-up visual pass: the cupped hero leaf now sways continuously; its drop stays hidden while idle, emerges from the leaf surface, stretches and slides with a wet tail before falling from the tip. The water has layered low-frequency motion, and the land snail rests on the damp bank rather than the pool surface.
- Additional polish: the moving drop follows a gently wandering surface path with changing width, a connected liquid lobe and satellite beads; broad understory leaves, shore reeds, stronger local leaf response, and larger vegetation sway were reviewed in the opening frame.
- Depth and framing pass (2026-09-21): the pool now shades by reconstructed basin depth with a grazing-angle reflection weight and a shoreline that dissolves where the water runs thin; background trunks vary per instance over a deeper band against a graded backdrop; mushrooms differ by maturity rather than scale; and the snail close-up looks across the water with its own narrow-portrait framing. Reviewed at 1512x940 desktop WebGPU, 1280x800 forced WebGL 2, and 390x844 portrait in the wide, waterline, leaf-study and snail views, with no runtime or renderer errors. `npm run build`, `npm run format:check` and `npm test` (**5 passed**) were re-run after the pass.
- Interaction pass: the initial SVG flash is dark and sized before the main stylesheet arrives; the compass cycles wide, waterline and leaf-study views; pool taps create shader ripples and travelling rings; water transmission and nearby-light color response were reviewed in desktop and WebGL.

## What the tests exercise

1. **Desktop WebGPU:** light movement; pool touch ripples; three camera views and reset; drop initiation, falling phase and impact; repeat activation by a real raycast hit on the leaf; snail close-up, retraction and re-extension; audio state; modal open/close; zoom and reset.
2. **Touch:** a tap on the leaf itself, touch drag, two-finger pinch, no viewport overflow, and portrait-to-landscape resize.
3. **WebGL 2:** forced fallback, water interaction, and resize.
4. **Reduced motion / keyboard:** preference detection, arrow-key light control, light reactivation, Enter on the drop button, and dialog access.
5. **Unavailable renderer:** an actionable readable recovery panel appears.

## Findings fixed during visual QA

- WebGPU rejected a shared transmission texture when a smaller planar reflection target changed its dimensions. Matching the reflector resolution to the main scene removed those GPU validation errors.
- The initial scene camera needed positioning before the first render.
- An offscreen label could enlarge the mobile layout viewport, shifting the canvas and touch coordinates. A clipped fixed viewport, container-based renderer sizing, and a clamped label fixed this. The test asserts the actual 390 px canvas width.
- Bark and fern materials were too glossy; roughness, geometry and highlights were refined. Depth of field separates the clearing from the background.
- The second material pass replaced the remaining uniformly smooth surfaces with scanned bark/ground detail, patchy procedural relief, roughness maps, cached directional shadows, and irregular organic silhouettes.
- The original hanging drop was always visible and the snail crossed the water. A hidden tear-shaped reservoir, longer slide phase, stronger leaf sway, layered water normals, and a shoreline placement corrected those cues.
- A frond behind the hero droplet gives its refraction visible detail to enlarge/distort.
- The snail now uses a less obstructed close-up and a properly tapered tail.

## Remaining release checks

Actual Safari/iOS and Android hardware, long-duration resource/thermal behavior, and a listening pass for synthesized sound have not been verified. No claim of a full accessibility audit or a universal frame-rate target is made. Further visual realism would benefit from finer moss, a more anatomical snail and contact shadows; mushroom silhouettes now vary by maturity, but the caps are still lathe surfaces rather than scanned fungi. See README for rendering and simulation limits.
