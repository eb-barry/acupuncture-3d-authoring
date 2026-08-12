#!/usr/bin/env python3
"""Repair seam holes / open borders in models/female-character.glb.

The source mesh is a single GLB primitive made of front/back (and top/sole)
shells that share coincident vertices but are not welded. That leaves visible
cracks at the wrist, neck, shoulders, hip, and ankle, plus lumpy toe caps.

Pipeline (shape-preserving):
  1. Remove duplicate vertices/faces (welds coincident shell seams)
  2. Merge near-coincident border verts + snap mismatched borders
  3. Close remaining holes with refined fill
  4. Surface-preserving / Taubin smooth on filled patches, then mild global SPS
  5. Extra toe-region cleanup
  6. Reorient faces, recompute normals, export GLB with original PBR material
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import numpy as np
import pymeshlab as ml
import trimesh
from scipy.spatial import cKDTree


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def repair(src: Path, dst: Path) -> dict:
    orig = trimesh.load(src, force="scene").geometry["geometry_0"]
    ms = ml.MeshSet()
    ms.load_new_mesh(str(src))

    ms.meshing_remove_duplicate_vertices()
    ms.meshing_remove_unreferenced_vertices()
    ms.meshing_remove_duplicate_faces()
    ms.meshing_remove_null_faces()

    ms.meshing_merge_close_vertices(threshold=ml.PercentageValue(0.25))
    ms.meshing_snap_mismatched_borders(edgedistratio=0.05, unifyvertices=True)
    ms.meshing_merge_close_vertices(threshold=ml.PercentageValue(0.25))

    ms.meshing_close_holes(
        maxholesize=100,
        selected=False,
        newfaceselected=True,
        selfintersection=True,
        refinehole=True,
    )
    ms.meshing_close_holes(
        maxholesize=400,
        selected=False,
        newfaceselected=True,
        selfintersection=True,
        refinehole=True,
    )

    # Blend filled patches into surrounding surface.
    ms.apply_selection_dilatation()
    ms.apply_selection_dilatation()
    ms.apply_selection_dilatation()
    ms.apply_coord_laplacian_smoothing_surface_preserving(
        selection=True, angledeg=2.0, iterations=12
    )
    ms.apply_coord_taubin_smoothing(
        lambda_=0.5, mu=-0.53, stepsmoothnum=8, selected=True
    )

    # Mild global pass for residual seam stair-steps without reshaping the body.
    ms.apply_coord_laplacian_smoothing_surface_preserving(
        selection=False, angledeg=1.0, iterations=3
    )

    # Soften lumpy toe geometry on the forefoot.
    ms.compute_selection_by_condition_per_vertex(condselect="y < 0.12")
    ms.compute_selection_transfer_vertex_to_face()
    ms.apply_selection_dilatation()
    ms.apply_coord_laplacian_smoothing_surface_preserving(
        selection=True, angledeg=2.5, iterations=10
    )
    ms.apply_coord_taubin_smoothing(
        lambda_=0.4, mu=-0.42, stepsmoothnum=6, selected=True
    )

    ms.meshing_remove_duplicate_vertices()
    ms.meshing_remove_duplicate_faces()
    ms.meshing_remove_t_vertices(method=0, threshold=40, repeat=True)
    ms.meshing_repair_non_manifold_edges(method=0)
    ms.meshing_re_orient_faces_coherently()
    try:
        ms.meshing_re_orient_faces_by_geometry()
    except Exception:
        pass
    ms.compute_normal_per_vertex()

    topo = ms.get_topological_measures()
    mesh = ms.current_mesh()
    verts = mesh.vertex_matrix().astype(np.float64)
    faces = mesh.face_matrix().astype(np.int64)
    normals = mesh.vertex_normal_matrix().astype(np.float64)

    fixed = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    fixed.vertex_normals = normals
    fixed.fix_normals()

    if not fixed.is_winding_consistent:
        raise RuntimeError("Repaired mesh winding is inconsistent")
    if not fixed.is_watertight:
        raise RuntimeError("Repaired mesh is not watertight")

    mat = trimesh.visual.material.PBRMaterial(
        name="SmoothBodyMaterial",
        baseColorFactor=[0.9215686274509803, 0.9215686274509803, 0.9215686274509803, 1.0],
        metallicFactor=0.0,
        roughnessFactor=0.72,
    )
    if hasattr(orig.visual, "uv") and orig.visual.uv is not None:
        _, nn = cKDTree(orig.vertices).query(fixed.vertices)
        fixed.visual = trimesh.visual.TextureVisuals(uv=orig.visual.uv[nn], material=mat)
    else:
        fixed.visual.material = mat

    rng = np.random.default_rng(0)
    sample_o = rng.choice(len(orig.vertices), size=min(30000, len(orig.vertices)), replace=False)
    sample_f = rng.choice(len(fixed.vertices), size=min(30000, len(fixed.vertices)), replace=False)
    d_o_f, _ = cKDTree(fixed.vertices).query(orig.vertices[sample_o])
    d_f_o, _ = cKDTree(orig.vertices).query(fixed.vertices[sample_f])

    scene = trimesh.Scene()
    scene.add_geometry(fixed, geom_name="geometry_0")
    dst.parent.mkdir(parents=True, exist_ok=True)
    scene.export(dst)

    stats = {
        "source": str(src),
        "output": str(dst),
        "topology": topo,
        "vertices": int(len(fixed.vertices)),
        "faces": int(len(fixed.faces)),
        "watertight": bool(fixed.is_watertight),
        "winding_consistent": bool(fixed.is_winding_consistent),
        "extents_delta": np.abs(fixed.extents - orig.extents).tolist(),
        "hausdorff_approx": {
            "orig_to_fixed_p50": float(np.median(d_o_f)),
            "orig_to_fixed_p99": float(np.percentile(d_o_f, 99)),
            "orig_to_fixed_max": float(d_o_f.max()),
            "fixed_to_orig_p50": float(np.median(d_f_o)),
            "fixed_to_orig_p99": float(np.percentile(d_f_o, 99)),
            "fixed_to_orig_max": float(d_f_o.max()),
        },
        "sha256": sha256_file(dst),
    }
    return stats


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=root / "models" / "female-character.glb",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "models" / "female-character.glb",
    )
    args = parser.parse_args(argv)

    # Always repair from a pristine copy when overwriting in-place.
    src = args.input
    if args.output.resolve() == src.resolve():
        backup = src.parent / f"{src.stem}.source.glb"
        if not backup.exists():
            backup.write_bytes(src.read_bytes())
        src = backup

    stats = repair(src, args.output)
    print("Repair complete")
    for key in (
        "vertices",
        "faces",
        "watertight",
        "winding_consistent",
        "extents_delta",
        "hausdorff_approx",
        "sha256",
    ):
        print(f"  {key}: {stats[key]}")
    print(f"  topology: {stats['topology']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
