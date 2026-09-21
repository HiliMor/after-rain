# First-version QA — 2026-09-21

Environment: macOS, Node 24.18.0, Chrome 153.0.8010.48, Three.js 0.186.0, Vite 8.3.0. Playwright runs real Chrome with WebGPU enabled. Phone coverage is viewport/touch emulation, not a physical phone.

## Recorded checks

- `npm run build`: passed TypeScript and production compilation.
- `PREVIEW_URL=http://127.0.0.1:4188 npm test`: **5 passed** (31.5 seconds).
- After strengthening the mobile width regression assertion and fixing the keyboard light-button state, the mobile and reduced-motion cases passed again: **2 passed** (9.6 seconds).
- Runtime error listeners found no JavaScript or renderer errors in the successful desktop, mobile and WebGL cases. The unsupported-renderer test intentionally disables both backends and checks the error UI.
- After the final mushroom-light shader and source formatting, desktop WebGPU and WebGL interaction cases passed again: **2 passed** (22.7 seconds).
- `npm run format:check` and the final production build passed.
- Final visual inspection: desktop opening frame, drop impact, snail close-up, narrow portrait, and the forced WebGL path.
- Asset/font requests remain local. License notices are included in the build.

## What the tests exercise

1. **Desktop WebGPU:** light movement; drop initiation, falling phase and impact; repeat activation by a real raycast hit on the leaf; snail close-up, retraction and re-extension; audio state; modal open/close; zoom and reset.
2. **Touch:** a tap on the leaf itself, touch drag, two-finger pinch, no viewport overflow, and portrait-to-landscape resize.
3. **WebGL 2:** forced fallback, water interaction, and resize.
4. **Reduced motion / keyboard:** preference detection, arrow-key light control, light reactivation, Enter on the drop button, and dialog access.
5. **Unavailable renderer:** an actionable readable recovery panel appears.

## Findings fixed during visual QA

- WebGPU rejected a shared transmission texture when a smaller planar reflection target changed its dimensions. Matching the reflector resolution to the main scene removed those GPU validation errors.
- The initial scene camera needed positioning before the first render.
- An offscreen label could enlarge the mobile layout viewport, shifting the canvas and touch coordinates. A clipped fixed viewport, container-based renderer sizing, and a clamped label fixed this. The test asserts the actual 390 px canvas width.
- Bark and fern materials were too glossy; roughness, geometry and highlights were refined. Depth of field separates the clearing from the background.
- A frond behind the hero droplet gives its refraction visible detail to enlarge/distort.
- The snail now uses a less obstructed close-up and a properly tapered tail.

## Remaining release checks

Actual Safari/iOS and Android hardware, long-duration resource/thermal behavior, and a listening pass for synthesized sound have not been verified. No claim of a full accessibility audit or a universal frame-rate target is made. Further visual realism would benefit from finer moss, organic mushroom silhouettes, a more anatomical snail and contact shadows. See README for rendering and simulation limits.
