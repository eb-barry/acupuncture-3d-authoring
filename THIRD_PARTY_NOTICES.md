# Third-party assets

## Default body model (`male_character.glb`)

- Local file: `models/male_character.glb`
- SHA-256: `1d52c883c830ff9bc53d146fe8fd199569735a8021569a401b0e05ded4825018`
- Source: provided by the project owner for acupuncture authoring
- Notes: used as the default viewer model. Normals are full-precision float32
  (no Meshopt quantization), which avoids spiral shading artifacts under
  studio lighting.

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
