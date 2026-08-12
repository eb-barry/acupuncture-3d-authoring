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
  6. Weighted Taubin cleanup along the head/neck weld seam
  7. Reorient faces, recompute normals, export GLB with original PBR material
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from collections import defaultdict
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


def _boundary_vertices(mesh: trimesh.Trimesh) -> np.ndarray:
    edges = mesh.edges_sorted
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    return np.unique(unique[counts == 1].flatten())


def smooth_head_neck_seam(mesh: trimesh.Trimesh, source: trimesh.Trimesh) -> np.ndarray:
    """Flatten the visible ridge where front/back head shells were welded."""
    comps = sorted(source.split(only_watertight=False), key=lambda c: -len(c.faces))
    if len(comps) < 16:
        return mesh.vertices.copy()

    head_a, head_b = comps[0], comps[15]
    seam = np.vstack(
        [
            head_a.vertices[_boundary_vertices(head_a)],
            head_b.vertices[_boundary_vertices(head_b)],
        ]
    )
    neck_seam = seam[(seam[:, 1] > 3.60) & (seam[:, 1] < 3.97)]
    if len(neck_seam) < 8:
        return mesh.vertices.copy()

    verts0 = mesh.vertices.copy()
    adj: dict[int, set[int]] = defaultdict(set)
    for a, b in mesh.edges_unique:
        adj[int(a)].add(int(b))
        adj[int(b)].add(int(a))
    neighbors = [np.fromiter(adj[i], dtype=np.int64) for i in range(len(verts0))]

    dist, _ = cKDTree(neck_seam).query(verts0)
    weight = np.exp(-((dist / 0.035) ** 2))
    side = (
        (verts0[:, 1] >= 3.62)
        & (verts0[:, 1] <= 3.94)
        & (np.abs(verts0[:, 0]) <= 0.22)
        & (verts0[:, 2] >= 0.20)
        & (verts0[:, 2] <= 0.44)
    )
    weight = np.maximum(weight, side.astype(np.float64) * 0.85)
    lock = (
        ((verts0[:, 1] >= 3.80) & (verts0[:, 2] > 0.45) & (np.abs(verts0[:, 0]) < 0.10))
        | (verts0[:, 1] > 4.02)
        | (verts0[:, 1] < 3.55)
    )
    weight[lock] = 0.0
    face_pts = verts0[
        (verts0[:, 1] >= 3.85) & (verts0[:, 2] > 0.45) & (np.abs(verts0[:, 0]) < 0.12)
    ]
    if len(face_pts):
        face_dist, _ = cKDTree(face_pts).query(verts0)
        weight *= np.clip((face_dist - 0.01) / 0.04, 0, 1)

    def smooth(vertices: np.ndarray, strength: float, w: np.ndarray) -> np.ndarray:
        out = vertices.copy()
        for i in np.where(w > 1e-4)[0]:
            nbs = neighbors[i]
            if len(nbs) == 0:
                continue
            avg = vertices[nbs].mean(axis=0)
            out[i] = vertices[i] + (strength * w[i]) * (avg - vertices[i])
        return out

    vertices = verts0.copy()
    for _ in range(80):
        vertices = smooth(vertices, 0.5, weight)
        vertices = smooth(vertices, -0.53, weight)
    for _ in range(40):
        vertices = smooth(vertices, 0.45, weight)

    # Second stage: focus remaining high-dihedral ridges inside the neck band.
    probe = trimesh.Trimesh(vertices=vertices, faces=mesh.faces, process=False)
    probe.fix_normals()
    face_normals = probe.face_normals
    f0, f1 = probe.face_adjacency[:, 0], probe.face_adjacency[:, 1]
    angles = np.degrees(
        np.arccos(np.clip((face_normals[f0] * face_normals[f1]).sum(1), -1, 1))
    )
    crease = np.unique(probe.face_adjacency_edges[angles > 14].ravel())
    crease = crease[
        (vertices[crease, 1] > 3.58)
        & (vertices[crease, 1] < 3.97)
        & (np.abs(vertices[crease, 0]) < 0.23)
        & (vertices[crease, 2] > 0.16)
        & (vertices[crease, 2] < 0.47)
    ]
    weight2 = np.zeros(len(vertices))
    weight2[crease] = 1.0
    for _ in range(4):
        for i in np.where(weight2 > 0)[0]:
            for j in adj[i]:
                weight2[j] = max(weight2[j], weight2[i] * 0.75)
    weight2[lock] = 0.0
    weight2 *= np.clip(weight / 0.3, 0, 1)
    for _ in range(60):
        vertices = smooth(vertices, 0.5, weight2)
        vertices = smooth(vertices, -0.53, weight2)
    for _ in range(25):
        vertices = smooth(vertices, 0.4, weight2)
    return vertices


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

    # Soften the jaw/neck ridge left by welding front/back head shells.
    fixed.vertices = smooth_head_neck_seam(fixed, orig)
    fixed.fix_normals()

    mat = trimesh.visual.material.PBRMaterial(
        name="SmoothBodyMaterial",
        baseColorFactor=[0.9215686274509803, 0.9215686274509803, 0.9215686274509803, 1.0],
        metallicFactor=0.0,
        roughnessFactor=0.72,
    )

    # Smooth shading requires an exported NORMAL attribute. Prefer the original
    # authoring normals on matched vertices so the repaired surface keeps the
    # same soft look; fall back to recomputed smooth normals elsewhere.
    fixed.fix_normals()
    smooth = fixed.vertex_normals.copy()
    dist, nn = cKDTree(orig.vertices).query(fixed.vertices)
    orig_n = orig.vertex_normals[nn]
    flip = (orig_n * smooth).sum(axis=1) < 0
    orig_n[flip] *= -1
    matched = dist < 1e-3
    smooth[matched] = orig_n[matched]
    smooth /= np.linalg.norm(smooth, axis=1, keepdims=True).clip(min=1e-12)
    fixed.vertex_normals = smooth

    if hasattr(orig.visual, "uv") and orig.visual.uv is not None:
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
    # Trimesh may omit NORMALS unless explicitly requested; without them the
    # viewer falls back to derivative/face normals and the whole body looks faceted.
    glb = trimesh.exchange.gltf.export_glb(scene, include_normals=True)
    dst.write_bytes(glb)

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
