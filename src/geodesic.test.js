import { describe, expect, it } from 'vitest'
import {
  astarPath,
  buildAdjacency,
  buildCombinedSurfaceGraph,
  densifyPolyline,
  dist3,
  shortestSurfacePath,
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
