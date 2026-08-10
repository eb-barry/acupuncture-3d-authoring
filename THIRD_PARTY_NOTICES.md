# Third-party assets

## `human_glb` body model

- Title: [`human_glb`](https://sketchfab.com/3d-models/human-glb-1ac3176269f54db0a98e155efb84b900)
- Creator: [aaravparakh](https://sketchfab.com/aaravparakh)
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Local file: `models/human.glb`
- SHA-256: `3de9a0a4ad23f96d6b7e04d4f5f8bb6a6d0ce13c67a0bb3d0f8842e0c1bf410a`

Changes made by this project: joined the original mesh primitives, welded
equivalent vertices, recalculated outward normals, applied region-weighted
Laplacian cleanup on back/inner-forearm/palm seam bands while locking face and
fingertip neighborhoods, then added ten separate fingernail meshes with a
distinct pink material for acupuncture orientation. Vertex attributes were
quantized and Meshopt-compressed using glTF-Transform 4.4.2 without mesh
simplification. These changes are not endorsed by the original creator.

## Acupuncture catalog

- Source: [`assets/acupuncture-data.json`](https://github.com/eb-barry/Acupuncture-Assistant/blob/main/assets/acupuncture-data.json)
- Repository: [eb-barry/Acupuncture-Assistant](https://github.com/eb-barry/Acupuncture-Assistant)
- Local file: `src/data/acupuncture-data.json`
- Records used: 361 unique standard points across the twelve primary meridians,
  Conception Vessel, and Governing Vessel

The data owner explicitly granted this project separate permission to use and
redistribute this JSON catalog on 2026-08-10. The obsolete duplicate `複溜`
entry was omitted; `復溜` remains the canonical name for KI7.
