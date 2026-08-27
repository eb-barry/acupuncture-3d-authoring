#!/usr/bin/env python3
"""Compress models/female-character.glb without changing the authored surface.

The Sketchfab female export is split into 47 unindexed chunks (~3.07M unique
triangle corners, ~82MB). Adjacent triangles already share bitwise-identical
positions, so welding on POSITION only (not on the full vertex+normal record)
rebuilds a single indexed mesh:

  * triangle count stays the same (no simplification)
  * vertex positions stay bitwise identical (no quantization / Draco / Meshopt)
  * normals stay float32; values at a shared position are averaged then
    renormalized so studio lighting stays smooth
  * geodesic / skin-projection later can share real edges instead of 3M
    disconnected corners

Re-run:

    python3 scripts/compress_female_character_glb.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

import numpy as np

COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COMPONENTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise RuntimeError(f"Unsupported GLB header in {path}")
    offset = 12
    json_blob = bin_blob = None
    while offset < length:
        chunk_len, chunk_type = struct.unpack_from("<I4s", data, offset)
        payload = data[offset + 8 : offset + 8 + chunk_len]
        offset += 8 + chunk_len
        if chunk_type.startswith(b"JSON"):
            json_blob = json.loads(payload)
        elif chunk_type.startswith(b"BIN"):
            bin_blob = payload
    if json_blob is None or bin_blob is None:
        raise RuntimeError(f"GLB missing JSON or BIN chunk: {path}")
    return json_blob, bin_blob


def accessor_numpy(gltf: dict, bin_blob: bytes, index: int) -> np.ndarray:
    accessor = gltf["accessors"][index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    component = accessor["componentType"]
    count = accessor["count"]
    ncomp = TYPE_COMPONENTS[accessor["type"]]
    dtype = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}[component]
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride") or ncomp * COMPONENT_BYTES[component]
    if stride == ncomp * dtype().nbytes:
        array = np.frombuffer(bin_blob, dtype=dtype, count=count * ncomp, offset=start)
        return array.reshape(count, ncomp).copy()
    item = np.empty((count, ncomp), dtype=dtype)
    size = ncomp * dtype().nbytes
    for row in range(count):
        row_start = start + row * stride
        item[row] = np.frombuffer(bin_blob, dtype=dtype, count=ncomp, offset=row_start)
    return item


def write_glb(path: Path, gltf: dict, bin_blob: bytes) -> None:
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - (len(json_bytes) % 4)) % 4)
    bin_padded = bin_blob + (b"\x00" * ((4 - (len(bin_blob) % 4)) % 4))
    length = 12 + 8 + len(json_bytes) + 8 + len(bin_padded)
    out = bytearray()
    out += struct.pack("<4sII", b"glTF", 2, length)
    out += struct.pack("<I4s", len(json_bytes), b"JSON")
    out += json_bytes
    out += struct.pack("<I4s", len(bin_padded), b"BIN\x00")
    out += bin_padded
    path.write_bytes(out)


def collect_source_mesh(gltf: dict, bin_blob: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    positions = []
    normals = []
    faces = []
    vertex_offset = 0
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            if prim.get("mode", 4) != 4:
                raise RuntimeError(f"Unsupported primitive mode {prim.get('mode')}")
            pos = accessor_numpy(gltf, bin_blob, prim["attributes"]["POSITION"]).astype(np.float32)
            nrm = accessor_numpy(gltf, bin_blob, prim["attributes"]["NORMAL"]).astype(np.float32)
            if prim.get("indices") is None:
                idx = np.arange(len(pos), dtype=np.uint32)
            else:
                idx = accessor_numpy(gltf, bin_blob, prim["indices"]).reshape(-1).astype(np.uint32)
            if idx.size % 3:
                raise RuntimeError("Index count is not a multiple of 3")
            faces.append(idx.reshape(-1, 3) + vertex_offset)
            positions.append(pos)
            normals.append(nrm)
            vertex_offset += len(pos)
    return (
        np.concatenate(positions, axis=0),
        np.concatenate(normals, axis=0),
        np.concatenate(faces, axis=0),
    )


def weld_by_position(positions: np.ndarray, normals: np.ndarray, faces: np.ndarray):
    pos = np.ascontiguousarray(positions, dtype=np.float32)
    packed = pos.view(np.dtype((np.void, 12))).reshape(-1)
    unique_packed, inverse = np.unique(packed, return_inverse=True)
    welded_positions = unique_packed.view(np.float32).reshape(-1, 3).copy()
    welded_faces = inverse[faces.reshape(-1)].reshape(-1, 3).astype(np.uint32)

    degenerate = (
        (welded_faces[:, 0] == welded_faces[:, 1])
        | (welded_faces[:, 1] == welded_faces[:, 2])
        | (welded_faces[:, 2] == welded_faces[:, 0])
    )
    welded_faces = welded_faces[~degenerate]

    accum = np.zeros_like(welded_positions, dtype=np.float64)
    np.add.at(accum, inverse, normals.astype(np.float64))
    lengths = np.linalg.norm(accum, axis=1)
    collapsed = lengths < 1e-12
    accum[~collapsed] /= lengths[~collapsed, None]

    if collapsed.any():
        face_normals = np.cross(
            welded_positions[welded_faces[:, 1]] - welded_positions[welded_faces[:, 0]],
            welded_positions[welded_faces[:, 2]] - welded_positions[welded_faces[:, 0]],
        )
        face_accum = np.zeros_like(welded_positions, dtype=np.float64)
        for corner in range(3):
            np.add.at(face_accum, welded_faces[:, corner], face_normals)
        fallback = np.linalg.norm(face_accum, axis=1, keepdims=True).clip(min=1e-12)
        face_accum /= fallback
        accum[collapsed] = face_accum[collapsed]

    welded_normals = accum.astype(np.float32)
    return welded_positions, welded_normals, welded_faces, int(degenerate.sum())


def topology_stats(faces: np.ndarray) -> dict:
    edges = np.concatenate(
        [
            np.sort(faces[:, [0, 1]], axis=1),
            np.sort(faces[:, [1, 2]], axis=1),
            np.sort(faces[:, [2, 0]], axis=1),
        ],
        axis=0,
    )
    packed = edges.astype(np.uint64)
    keys = packed[:, 0] << 32 | packed[:, 1]
    _unique, counts = np.unique(keys, return_counts=True)
    return {
        "faces": int(len(faces)),
        "unique_edges": int(len(counts)),
        "boundary_edges": int((counts == 1).sum()),
        "manifold_edges": int((counts == 2).sum()),
        "nonmanifold_edges": int((counts > 2).sum()),
        "watertight": bool(((counts == 2).all()) and len(counts) > 0),
    }


def build_compressed_gltf(
    source: dict,
    positions: np.ndarray,
    normals: np.ndarray,
    faces: np.ndarray,
) -> tuple[dict, bytes]:
    pos_bytes = positions.astype(np.float32, copy=False).tobytes()
    nrm_bytes = normals.astype(np.float32, copy=False).tobytes()
    idx_bytes = faces.astype(np.uint32, copy=False).reshape(-1).tobytes()

    bin_blob = bytearray()
    views = []

    def append_view(payload: bytes, target: int) -> int:
        pad = (4 - (len(bin_blob) % 4)) % 4
        bin_blob.extend(b"\x00" * pad)
        offset = len(bin_blob)
        bin_blob.extend(payload)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(payload), "target": target})
        return len(views) - 1

    pos_view = append_view(pos_bytes, 34962)
    nrm_view = append_view(nrm_bytes, 34962)
    idx_view = append_view(idx_bytes, 34963)

    extras = dict(source.get("asset", {}).get("extras") or {})
    extras["compression"] = (
        "POSITION-only weld of bitwise-identical vertices; float32 normals; "
        "no simplification, quantization, Draco, or Meshopt"
    )

    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "acupuncture-3d-authoring compress_female_character_glb.py",
            "extras": extras,
        },
        "scene": 0,
        "scenes": [{"nodes": [0], "name": "Sketchfab_Scene"}],
        "nodes": [{"mesh": 0, "name": "female-character"}],
        "meshes": [
            {
                "name": "female-character",
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1},
                        "indices": 2,
                        "material": 0,
                    }
                ],
            }
        ],
        "materials": source.get("materials") or [
            {
                "name": "lambert1",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.5, 0.5, 0.5, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.43123940949153367,
                },
            }
        ],
        "accessors": [
            {
                "bufferView": pos_view,
                "componentType": 5126,
                "count": int(len(positions)),
                "type": "VEC3",
                "min": positions.min(axis=0).astype(float).tolist(),
                "max": positions.max(axis=0).astype(float).tolist(),
            },
            {
                "bufferView": nrm_view,
                "componentType": 5126,
                "count": int(len(normals)),
                "type": "VEC3",
            },
            {
                "bufferView": idx_view,
                "componentType": 5125,
                "count": int(faces.size),
                "type": "SCALAR",
            },
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(bin_blob)}],
    }
    if source.get("extensionsUsed"):
        gltf["extensionsUsed"] = list(source["extensionsUsed"])
    return gltf, bytes(bin_blob)


def compress(src: Path, dst: Path) -> dict:
    gltf, bin_blob = parse_glb(src)
    positions, normals, faces = collect_source_mesh(gltf, bin_blob)
    welded_positions, welded_normals, welded_faces, dropped = weld_by_position(
        positions, normals, faces
    )
    if not math.isclose(np.linalg.norm(welded_normals, axis=1).min(), 1.0, rel_tol=0, abs_tol=1e-3):
        lengths = np.linalg.norm(welded_normals, axis=1, keepdims=True).clip(min=1e-12)
        welded_normals = (welded_normals / lengths).astype(np.float32)

    out_gltf, out_bin = build_compressed_gltf(gltf, welded_positions, welded_normals, welded_faces)
    dst.parent.mkdir(parents=True, exist_ok=True)
    write_glb(dst, out_gltf, out_bin)

    src_min = positions.min(axis=0)
    src_max = positions.max(axis=0)
    dst_min = welded_positions.min(axis=0)
    dst_max = welded_positions.max(axis=0)
    return {
        "source": str(src),
        "output": str(dst),
        "source_bytes": src.stat().st_size,
        "output_bytes": dst.stat().st_size,
        "source_vertices": int(len(positions)),
        "output_vertices": int(len(welded_positions)),
        "source_faces": int(len(faces)),
        "output_faces": int(len(welded_faces)),
        "degenerate_faces_dropped": dropped,
        "extent_delta": np.abs((dst_max - dst_min) - (src_max - src_min)).tolist(),
        "bbox_min": dst_min.astype(float).tolist(),
        "bbox_max": dst_max.astype(float).tolist(),
        "topology": topology_stats(welded_faces),
        "sha256": sha256_file(dst),
        "license_extras": out_gltf["asset"].get("extras"),
    }


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=root / "models" / "female-character.glb")
    parser.add_argument("--output", type=Path, default=root / "models" / "female-character.glb")
    args = parser.parse_args(argv)

    src = args.input
    if args.output.resolve() == src.resolve():
        backup_dir = root / ".mesh-backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / f"{src.stem}.source.glb"
        if not backup.exists():
            backup.write_bytes(src.read_bytes())
        src = backup

    stats = compress(src, args.output)
    print("Compression complete")
    for key, value in stats.items():
        print(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
