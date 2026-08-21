import { describe, expect, it } from 'vitest'
import {
  astarPath,
  buildAdjacency,
  buildCombinedSurfaceGraph,
  collapseOppositeWallSpikes,
  densifyPolyline,
  dist3,
  distanceToSegment3,
  polylineTurningEnergy,
  shortestSurfacePath,
  simplifyPolylineWithNormals,
  snapPolylineToSurface,
  tautOnSurfacePolyline,
  weldVertices,
} from './geodesic.js'

function gridMesh(width, height) {
  const positions = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      positions.push([x, y, 0])
    }
  }
  const triangles = []
  const indexAt = (x, y) => y * width + x
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const a = indexAt(x, y)
      const b = indexAt(x + 1, y)
      const c = indexAt(x, y + 1)
      const d = indexAt(x + 1, y + 1)
      triangles.push(a, b, c, b, d, c)
    }
  }
  const remap = weldVertices(positions)
  const adjacency = buildAdjacency(positions, triangles, remap)
  return { positions, adjacency, remap }
}

describe('surface geodesic', () => {
  it('walks the short edge path on a flat grid', () => {
    const { positions, adjacency } = gridMesh(5, 5)
    const path = shortestSurfacePath({
      adjacency,
      positions,
      startSeeds: [{ id: 0, cost: 0 }],
      goalIds: [4],
      goalPoint: positions[4],
    })
    expect(path).toBeTruthy()
    expect(path.points[0]).toEqual([0, 0, 0])
    expect(path.points[path.points.length - 1]).toEqual([4, 0, 0])
    expect(dist3(path.points[0], path.points[path.points.length - 1])).toBeCloseTo(4)
    const length = path.points.reduce((total, point, index) => (
      index === 0 ? 0 : total + dist3(path.points[index - 1], point)
    ), 0)
    expect(length).toBeCloseTo(4)
  })

  it('does not jump through empty space on a bent strip', () => {
    // Two quads sharing an edge, folded 90° — shortest path stays on the faces.
    const positions = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
    ]
    const triangles = [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]
    const remap = weldVertices(positions)
    const adjacency = buildAdjacency(positions, triangles, remap)
    const path = shortestSurfacePath({
      adjacency,
      positions,
      startSeeds: [{ id: 0, cost: 0 }],
      goalIds: [4],
      goalPoint: positions[4],
    })
    expect(path).toBeTruthy()
    const length = path.points.reduce((total, point, index) => (
      index === 0 ? 0 : total + dist3(path.points[index - 1], point)
    ), 0)
    expect(length).toBeCloseTo(2)
    expect(path.points.some((point) => point[1] === 1)).toBe(true)
  })

  it('welds coincident vertices so a seam does not block the path', () => {
    const positions = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ]
    const triangles = [0, 1, 2, 3, 4, 5]
    const remap = weldVertices(positions)
    expect(remap[1]).toBe(remap[3])
    expect(remap[2]).toBe(remap[5])
    const adjacency = buildAdjacency(positions, triangles, remap)
    const path = shortestSurfacePath({
      adjacency,
      positions,
      startSeeds: [{ id: 0, cost: 0 }],
      goalIds: [4],
      goalPoint: positions[4],
    })
    expect(path).toBeTruthy()
    expect(path.points[path.points.length - 1]).toEqual([1, 1, 0])
  })

  it('densifies long edge steps so the polyline stays on the surface edges', () => {
    const dense = densifyPolyline([[0, 0, 0], [0.05, 0, 0]], 0.01)
    expect(dense.length).toBeGreaterThan(4)
    expect(dense[0]).toEqual([0, 0, 0])
    expect(dense[dense.length - 1][0]).toBeCloseTo(0.05)
    dense.forEach((point) => {
      expect(point[1]).toBeCloseTo(0)
      expect(point[2]).toBeCloseTo(0)
    })
  })

  it('returns null when A* cannot reach the goal', () => {
    const adjacency = [[[1, 1]], [[0, 1]], []]
    const positions = [[0, 0, 0], [1, 0, 0], [10, 0, 0]]
    expect(astarPath(adjacency, [{ id: 0, cost: 0 }], (id) => id === 2, () => 0, 50)).toBeNull()
    expect(shortestSurfacePath({
      adjacency,
      positions,
      startSeeds: [{ id: 0, cost: 0 }],
      goalIds: [2],
      goalPoint: positions[2],
    })).toBeNull()
  })

  it('walks across welded 16-bit mesh chunks that share a seam', () => {
    const left = {
      positions: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ],
      triangles: [0, 1, 2, 1, 3, 2],
    }
    const right = {
      positions: [
        [1, 0, 0],
        [2, 0, 0],
        [1, 1, 0],
        [2, 1, 0],
      ],
      triangles: [0, 1, 2, 1, 3, 2],
    }
    const combined = buildCombinedSurfaceGraph([left, right])
    const start = combined.remap[0]
    const goal = combined.remap[combined.offsets[1] + 3]
    const path = shortestSurfacePath({
      adjacency: combined.adjacency,
      positions: combined.positions,
      startSeeds: [{ id: start, cost: 0 }],
      goalIds: [goal],
      goalPoint: combined.positions[goal],
    })
    expect(path).toBeTruthy()
    expect(path.points[0]).toEqual([0, 0, 0])
    expect(path.points[path.points.length - 1]).toEqual([2, 1, 0])
    const length = path.points.reduce((total, point, index) => (
      index === 0 ? 0 : total + dist3(path.points[index - 1], point)
    ), 0)
    expect(length).toBeGreaterThan(2)
    expect(length).toBeLessThan(3.5)
  })

  it('does not invent a path between mesh chunks that do not touch', () => {
    const left = {
      positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      triangles: [0, 1, 2],
    }
    const right = {
      positions: [[5, 0, 0], [6, 0, 0], [5, 1, 0]],
      triangles: [0, 1, 2],
    }
    const combined = buildCombinedSurfaceGraph([left, right])
    const goal = combined.remap[combined.offsets[1]]
    expect(shortestSurfacePath({
      adjacency: combined.adjacency,
      positions: combined.positions,
      startSeeds: [{ id: combined.remap[0], cost: 0 }],
      goalIds: [goal],
      goalPoint: combined.positions[goal],
    })).toBeNull()
  })
})

describe('taut on-surface polyline', () => {
  const planeProject = (point) => ({ position: [point[0], point[1], 0], normal: [0, 0, 1] })

  it('keeps endpoints and flattens a vertex staircase on a plane', () => {
    const zigzag = []
    for (let index = 0; index <= 24; index += 1) {
      zigzag.push([index * 0.04, index % 2 === 0 ? 0 : 0.035, 0])
    }
    const before = polylineTurningEnergy(zigzag)
    const taut = tautOnSurfacePolyline(zigzag, zigzag.map(() => [0, 0, 1]), {
      iterations: 18,
      strength: 0.7,
      maxStep: 0.02,
      corridor: zigzag,
      corridorRadius: 0.04,
      project: planeProject,
    })
    expect(taut.points[0]).toEqual(zigzag[0])
    expect(taut.points[taut.points.length - 1]).toEqual(zigzag[zigzag.length - 1])
    expect(polylineTurningEnergy(taut.points)).toBeLessThan(before * 0.05)
    expect(taut.points.every((point, index) => (
      index === 0 || index === taut.points.length - 1 || Math.abs(point[2]) < 1e-9
    ))).toBe(true)
  })

  it('drops mesh staircases but keeps a cylindrical wrap', () => {
    const stairs = []
    for (let index = 0; index <= 20; index += 1) {
      stairs.push([index * 0.01, index % 2 === 0 ? 0 : 0.006, 0])
    }
    const flat = simplifyPolylineWithNormals(stairs, stairs.map(() => [0, 0, 1]), 0.0075)
    expect(flat.points).toHaveLength(2)

    const wrap = []
    const wrapNormals = []
    for (let index = 0; index <= 16; index += 1) {
      const angle = (index / 16) * (Math.PI / 2)
      wrap.push([Math.cos(angle), 0, Math.sin(angle)])
      wrapNormals.push([Math.cos(angle), 0, Math.sin(angle)])
    }
    const kept = simplifyPolylineWithNormals(wrap, wrapNormals, 0.0075)
    expect(kept.points.length).toBeGreaterThan(4)
    expect(kept.points[0]).toEqual(wrap[0])
    expect(kept.points[kept.points.length - 1]).toEqual(wrap[wrap.length - 1])
  })

  it('turns a mesh-scale staircase into a near-straight line', () => {
    const stairs = []
    for (let index = 0; index <= 30; index += 1) {
      stairs.push([index * 0.008, index % 2 === 0 ? 0 : 0.005, 0])
    }
    const simplified = simplifyPolylineWithNormals(stairs, stairs.map(() => [0, 0, 1]), 0.004)
    const taut = tautOnSurfacePolyline(simplified.points, simplified.normals, {
      iterations: 20,
      strength: 0.7,
      maxStep: 0.01,
      corridor: stairs,
      corridorRadius: 0.02,
      project: planeProject,
    })
    expect(polylineTurningEnergy(taut.points)).toBeLessThan(0.2)
    taut.points.forEach((point) => {
      expect(distanceToSegment3(point, taut.points[0], taut.points[taut.points.length - 1])).toBeLessThan(0.008)
    })
  })

  it('stays on a cylinder wrap instead of collapsing through the interior', () => {
    const path = []
    for (let index = 0; index <= 20; index += 1) {
      const angle = (index / 20) * (Math.PI / 2)
      path.push([Math.cos(angle), index % 2 === 0 ? 0 : 0.04, Math.sin(angle)])
    }
    const cylinderProject = (point) => {
      const radius = Math.hypot(point[0], point[2]) || 1
      const position = [point[0] / radius, point[1], point[2] / radius]
      return { position, normal: [position[0], 0, position[2]] }
    }
    const taut = tautOnSurfacePolyline(path, path.map((point) => [point[0], 0, point[2]]), {
      iterations: 16,
      strength: 0.65,
      maxStep: 0.04,
      corridor: path,
      corridorRadius: 0.06,
      project: cylinderProject,
    })
    taut.points.forEach((point) => {
      expect(Math.hypot(point[0], point[2])).toBeCloseTo(1, 5)
    })
    expect(taut.points[0][0]).toBeCloseTo(1, 5)
    expect(taut.points[taut.points.length - 1][2]).toBeCloseTo(1, 5)
    const maxY = Math.max(...taut.points.map((point) => Math.abs(point[1])))
    expect(maxY).toBeLessThan(0.02)
    const minRadius = Math.min(...taut.points.map((point) => Math.hypot(point[0], point[2])))
    expect(minRadius).toBeGreaterThan(0.98)
  })

  it('drops armpit-wall spikes that flip onto the opposite crease side', () => {
    const points = [
      [0.03, 0, 0],
      [0.03, 0.02, 0],
      [0, 0.03, 0],
      [0.03, 0.04, 0],
      [0.03, 0.06, 0],
    ]
    const normals = [
      [1, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]
    const cleaned = collapseOppositeWallSpikes(points, normals)
    expect(cleaned.points).toHaveLength(4)
    expect(cleaned.points.some((point) => point[0] === 0)).toBe(false)
    expect(cleaned.points[0]).toEqual(points[0])
    expect(cleaned.points[cleaned.points.length - 1]).toEqual(points[points.length - 1])
  })

  it('does not snap a crease chord onto the opposite wall', () => {
    const points = [
      [0.03, 0, 0],
      [0.008, 0.02, 0],
      [0.03, 0.04, 0],
    ]
    const normals = [
      [1, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]
    const twoWalls = (point) => {
      const wallChest = { position: [0.03, point[1], point[2]], normal: [1, 0, 0] }
      const wallArm = { position: [0, point[1], point[2]], normal: [-1, 0, 0] }
      const chestDist = Math.abs(point[0] - 0.03)
      const armDist = Math.abs(point[0])
      return armDist < chestDist ? wallArm : wallChest
    }
    const snapped = snapPolylineToSurface(points, normals, twoWalls, { minNormalDot: 0.25 })
    snapped.points.forEach((point) => {
      expect(point[0]).toBeCloseTo(0.03, 5)
    })
    snapped.normals.forEach((normal) => {
      expect(normal[0]).toBeGreaterThan(0.5)
    })
  })
})
