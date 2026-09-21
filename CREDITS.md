# Assets and licenses

All forest geometry, animated behaviors, procedural texture canvases, interface design, favicon, and synthesized sound were authored in this project. Bark and forest-floor PBR maps use the two CC0 photographic assets below. No external models, HDRIs, recorded sound, or generated media are used.

| Dependency / asset                     | Author / source                                                                                      | License                   | Distributed notice                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------- |
| Three.js r186                          | [Three.js contributors](https://github.com/mrdoob/three.js)                                          | MIT                       | `public/licenses/three-MIT.txt`              |
| Cormorant Garamond, regular and italic | [The Cormorant Project Authors](https://github.com/CatharsisFonts/Cormorant), packaged by Fontsource | SIL Open Font License 1.1 | `public/licenses/cormorant-garamond-OFL.txt` |
| DM Sans, regular and medium            | [The DM Sans Project Authors](https://github.com/googlefonts/dm-fonts), packaged by Fontsource       | SIL Open Font License 1.1 | `public/licenses/dm-sans-OFL.txt`            |

Vite (MIT), TypeScript (Apache-2.0), Playwright (Apache-2.0), Prettier (MIT), and Three.js typings (MIT) are development tools. Their license files remain in the installed packages. Exact versions are recorded in `package-lock.json`.

License notices under `public/licenses/` are copied into every production build. The original project source is `UNLICENSED` — all rights reserved, see `LICENSE` — and is public to be read, not reused; third-party notices do not license the original project.

## Photographic PBR surfaces

- [Bark Brown 02](https://polyhaven.com/a/bark_brown_02), Rob Tuytel / Poly Haven — CC0 1.0.
- [Forest Leaves 02](https://polyhaven.com/a/forest_leaves_02), Rob Tuytel / Poly Haven — CC0 1.0.

Each starts from the 1K JPEG diffuse, OpenGL normal and ARM maps. The diffuse map is decoded as sRGB; normal and ARM maps stay linear. ARM red is ambient occlusion and green is roughness. Downloads were verified against the metadata MD5 values on acquisition.

What ships is derived from those originals, to cut what a phone has to download before the first frame. Bark is re-encoded at quality 58 and kept at 1024, because the log is read close up in the snail view and 512 visibly softened its grain. The forest-floor maps are 512 at quality 72: they tile fourteen times across the terrain, so the extra resolution was never resolvable. That took the photographic payload from 3.24 MB to 1.5 MB with no visible change to the wide frame. CC0 permits the modification; `public/textures/sources.json` records the source URL, author and original hash alongside the dimensions, size, hash and derivation of each file actually shipped. Assets are bundled locally; the running site never contacts Poly Haven.

[Poly Haven asset license](https://polyhaven.com/license) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
