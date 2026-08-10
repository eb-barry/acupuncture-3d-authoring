# Third-party assets

## `human_glb` body model

- Title: [`human_glb`](https://sketchfab.com/3d-models/human-glb-1ac3176269f54db0a98e155efb84b900)
- Creator: [aaravparakh](https://sketchfab.com/aaravparakh)
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Local file: `models/human.glb`
- SHA-256: `e8eaf344a64c40fc665cd2d32832673c95fb991582ffafac8befcbe140ef91a2`

Changes made by this project: joined the original mesh primitives, welded
equivalent vertices, simplified the geometry to 25% with a 0.0005 error
tolerance, applied region-weighted volume-preserving smoothing while retaining
the ears and extremities, corrected winding and smooth normals, quantized vertex
attributes, and applied Meshopt compression using glTF-Transform 4.4.2. The
optimized model contains 197,408 uploaded vertices and 352,600 triangles. These
changes are not endorsed by the original creator.

## Acupuncture catalog

- Source: [`assets/acupuncture-data.json`](https://github.com/eb-barry/Acupuncture-Assistant/blob/main/assets/acupuncture-data.json)
- Repository: [eb-barry/Acupuncture-Assistant](https://github.com/eb-barry/Acupuncture-Assistant)
- Local file: `src/data/acupuncture-data.json`
- Records used: 361 unique standard points across the twelve primary meridians,
  Conception Vessel, and Governing Vessel

The data owner explicitly granted this project separate permission to use and
redistribute this JSON catalog on 2026-08-10. The obsolete duplicate `複溜`
entry was omitted; `復溜` remains the canonical name for KI7.
