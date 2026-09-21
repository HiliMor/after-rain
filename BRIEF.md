# After Rain — creative and implementation brief

## Purpose

Create an independent interactive 3D website for learning, a portfolio, and sharing a visually impressive short recording. The user communicates in Hebrew, has programming experience, and expects the implementation to be handled by Codex. She values carefully observed details, coherent composition, believable materials and motion, and an immediate visual payoff.

This project is separate from the existing Skógafoss site. Do not modify that project, its Git history, or its running servers.

## Agreed concept

A tiny forest floor after rain, viewed from roughly insect height, during a luminous blue night. Moss becomes a forest; a leaf becomes an overhead canopy. A hanging water droplet magnifies and distorts the scene. Moonlight passes through foliage, with a warm firefly drawing attention into the composition.

Materials and small movements should feel grounded in nature. Subtle bioluminescence is an intentional fantasy element. Night must remain readable: deep blues, rich greens, warm accents, controlled highlights. Avoid a black scene with scattered neon dots or a generic glowing particle screensaver.

The opening frame should be strong before interaction. Concentrate detail in a small, well-composed area around the hero leaf, hanging droplet, moss, bark, mushrooms, and shallow pool. Use depth, foreground framing, textured surfaces, irregular silhouettes, varied scales, and restrained effects. Keep the interface minimal and unobtrusive.

## Three signature interactions

1. **Wake the forest with light.** The visitor moves a small warm light across the ground; a subtle wave of light propagates through moss and small mushrooms, then fades. Provide an intentional touch equivalent.
2. **Release a droplet.** Activating the hero leaf bends it, sends a droplet along its surface, and releases it into the pool. The impact produces expanding ripples, changes reflections, and gently moves a floating leaf. This can be a convincing authored animation; a full fluid solver is not required.
3. **Discover a creature.** A small snail emerges from bark, explores with articulated tentacles, and retracts slightly when approached. Give it believable scale, surface response, and slow secondary motion. If a credible snail needs more time, establish the environmental hero shot first and document the remaining work honestly.

## Technical approach and quality

Use Three.js, preferably native WebGPU and TSL where practical. Select rendering features for visual impact and stable performance, not for a list of technical buzzwords. Use instancing and procedural variation for dense vegetation, physically plausible lighting/materials, and thoughtfully chosen textures. Licensed external assets are allowed when needed; record sources and licenses. Never claim a full physical fluid or hair simulation when an artistic shader or animation is used.

Build the first running scene, inspect it in the browser, and refine the visual result. Check desktop and a narrow viewport, mouse and touch paths, runtime errors, and the build. Respect reduced-motion preferences and provide a readable unsupported-renderer state or a deliberately tested fallback. Avoid heavy effects without a visible benefit. Adapt rendering quality where useful.

Use a free local port rather than disrupting Skógafoss on ports 4173 or 5173. Document run commands, controls, implementation limits, and credits. Keep a clear local Git history. The current request authorizes a separate local repository; it does not request GitHub publication or deployment.

## Working context

The user chose to conserve the remaining usage allowance and has not authorized consuming a reset credit. Do not redeem a reset, purchase credits, start recurring work, or spawn subagents without an explicit applicable instruction. Begin implementation autonomously within the agreed scene scope, and keep updates concise and in Hebrew.
