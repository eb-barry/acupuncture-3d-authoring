# Third-party assets

## Default body model (`male_character.glb`)

- Local file: `models/male_character.glb`
- SHA-256: `1d52c883c830ff9bc53d146fe8fd199569735a8021569a401b0e05ded4825018`
- Source: provided by the project owner for acupuncture authoring
- Notes: used as the default viewer model. Normals are full-precision float32
  (no Meshopt quantization), which avoids spiral shading artifacts under
  studio lighting.

## Female body model (`female-character.glb`)

- Title: [`Female`](https://sketchfab.com/3d-models/female-15ee49542e3d4cc3aa9dec99ea3f46be)
- Creator: [yuzutarou](https://sketchfab.com/yuzuponponpon)
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Local file: `models/female-character.glb`
- SHA-256: `07a207b8310e99d3a366c669fdeccc5d00f49af9a3f1137048f9fcffa8d869e9`
- Notes: the Sketchfab GLB is a single body split into 47 unindexed chunks
  (~3.07M triangle corners, ~82MB) because of the 16-bit vertex limit. This
  project welds bitwise-identical positions into one indexed watertight
  manifold (511,021 vertices, 1,022,030 triangles, ~24MB) so acupuncture
  geodesics and skin projection can share real mesh edges. Triangle count and
  vertex positions are unchanged. Normals stay full-precision float32 (values
  at a shared position are averaged, then renormalized). No mesh simplification,
  Draco, Meshopt, or KHR_mesh_quantization — the same constraint as
  `male_character.glb`, which avoids spiral shading artifacts under studio
  lighting. Reproducible via `scripts/compress_female_character_glb.py`.
  The earlier seam-repair script `scripts/repair_female_character_glb.py`
  applied only to the previous 7.2MB female mesh and is not used on this asset.

## Alternate body model (`human_glb`)

- Title: [`human_glb`](https://sketchfab.com/3d-models/human-glb-1ac3176269f54db0a98e155efb84b900)
- Creator: [aaravparakh](https://sketchfab.com/aaravparakh)
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Local file: `models/human.glb`
- SHA-256: `08123599c9c3b57e9f0503e4f432bd18c73623cba6952c7c5752a7e1207f43cc`

Changes made by this project: joined the original mesh primitives, welded
equivalent vertices, recalculated outward normals, applied region-weighted
Laplacian cleanup on back/inner-forearm/palm seam bands while locking face and
fingertip neighborhoods, deepened inter-toe grooves on the true distal toe pads
(min-Y foot tips for this asset), then added ten separate fingernail meshes and
ten toenail meshes with a distinct pink material for acupuncture orientation.
Vertex attributes were quantized and Meshopt-compressed using glTF-Transform
4.4.2 without mesh simplification. These changes are not endorsed by the
original creator.

## Acupuncture catalog

- Source: [`assets/acupuncture-data.json`](https://github.com/eb-barry/Acupuncture-Assistant/blob/main/assets/acupuncture-data.json)
- Repository: [eb-barry/Acupuncture-Assistant](https://github.com/eb-barry/Acupuncture-Assistant)
- Local file: `src/data/acupuncture-data.json`
- Records used: 361 unique standard points across the twelve primary meridians,
  Conception Vessel, and Governing Vessel

The data owner explicitly granted this project separate permission to use and
redistribute this JSON catalog on 2026-08-10. The obsolete duplicate `複溜`
entry was omitted; `復溜` remains the canonical name for KI7.
