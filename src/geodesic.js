/** Discrete surface geodesic: A* on the welded triangle graph. */

export function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

export function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

/** Map coincident vertices to the first index at that position. */
export function weldVertices(positions, scale = 1e5) {
  const remap = new Array(positions.length)
  const first = new Map()
  for (let index = 0; index < positions.length; index += 1) {
    const point = positions[index]
    const key = `${Math.round(point[0] * scale)}:${Math.round(point[1] * scale)}:${Math.round(point[2] * scale)}`
    if (!first.has(key)) first.set(key, index)
    remap[index] = first.get(key)
  }
  return remap
}

/** Undirected edge graph; `triangles` is a flat list of vertex indices. */
export function buildAdjacency(positions, triangles, remap) {
  const adj = Array.from({ length: positions.length }, () => [])
  const seen = new Set()
  const link = (ia, ib) => {
    const a = remap[ia]
    const b = remap[ib]
    if (a === b) return
    const key = a < b ? `${a},${b}` : `${b},${a}`
    if (seen.has(key)) return
    seen.add(key)
    const weight = dist3(positions[a], positions[b])
    if (weight < 1e-12) return
    adj[a].push([b, weight])
    adj[b].push([a, weight])
  }
  for (let index = 0; index < triangles.length; index += 3) {
    link(triangles[index], triangles[index + 1])
    link(triangles[index + 1], triangles[index + 2])
    link(triangles[index + 2], triangles[index])
  }
  return adj
}

class MinHeap {
  constructor() {
    this.items = []
  }

  size() {
    return this.items.length
  }

  push(id, priority) {
    this.items.push({ id, priority })
    this.bubbleUp(this.items.length - 1)
  }

  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length) {
      items[0] = last
      this.bubbleDown(0)
    }
    return top
  }

  bubbleUp(index) {
    const items = this.items
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (items[parent].priority <= items[index].priority) break
      const swap = items[parent]
      items[parent] = items[index]
      items[index] = swap
      index = parent
    }
  }

  bubbleDown(index) {
    const items = this.items
    const length = items.length
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < length && items[left].priority < items[smallest].priority) smallest = left
      if (right < length && items[right].priority < items[smallest].priority) smallest = right
      if (smallest === index) break
      const swap = items[smallest]
      items[smallest] = items[index]
      items[index] = swap
      index = smallest
    }
  }
}

function reconstruct(cameFrom, current) {
  const path = [current]
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)
    path.push(current)
  }
  path.reverse()
  return path
}

/**
 * A* on an undirected weighted graph.
 * `startSeeds` is [{ id, cost }]; `isGoal(id)` marks the end set.
 */
export function astarPath(adjacency, startSeeds, isGoal, heuristic, maxExplored = 120000) {
  const gScore = new Map()
  const cameFrom = new Map()
  const closed = new Set()
  const heap = new MinHeap()
  startSeeds.forEach((seed) => {
    const id = seed.id
    const cost = Number(seed.cost) || 0
    gScore.set(id, cost)
    heap.push(id, cost + heuristic(id))
  })

  let explored = 0
  while (heap.size()) {
    const current = heap.pop()
    const id = current.id
    if (closed.has(id)) continue
    closed.add(id)
    explored += 1
    if (explored > maxExplored) return null
    if (isGoal(id)) return reconstruct(cameFrom, id)
    const g = gScore.get(id)
    const neighbors = adjacency[id]
    if (!neighbors) continue
    for (let index = 0; index < neighbors.length; index += 1) {
      const next = neighbors[index][0]
      const weight = neighbors[index][1]
      if (closed.has(next)) continue
      const tentative = g + weight
      if (tentative + 1e-12 >= (gScore.get(next) ?? Infinity)) continue
      cameFrom.set(next, id)
      gScore.set(next, tentative)
      heap.push(next, tentative + heuristic(next))
    }
  }
  return null
}

export function shortestSurfacePath({
  adjacency,
  positions,
  startSeeds,
  goalIds,
  goalPoint,
  maxExplored = 120000,
} = {}) {
  if (!adjacency || !positions || !startSeeds?.length || !goalIds?.length || !goalPoint) return null
  const goals = new Set(goalIds)
  const heuristic = (id) => dist3(positions[id], goalPoint)
  const ids = astarPath(
    adjacency,
    startSeeds,
    (id) => goals.has(id),
    heuristic,
    maxExplored,
  )
  if (!ids?.length) return null
  return {
    ids,
    points: ids.map((id) => positions[id]),
  }
}

/** Interpolate along a polyline so no segment is longer than `maxSeg`. */
export function densifyPolyline(points = [], maxSeg = 0.01) {
  if (points.length < 2) return points.map((point) => [...point])
  const out = [[...points[0]]]
  const limit = Math.max(Number(maxSeg) || 0.01, 1e-4)
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const span = dist3(a, b)
    const steps = Math.max(1, Math.ceil(span / limit))
    for (let step = 1; step <= steps; step += 1) {
      out.push(lerp3(a, b, step / steps))
    }
  }
  return out
}

export function densifyPolylineWithNormals(points = [], normals = [], maxSeg = 0.01) {
  if (points.length < 2) {
    return {
      points: points.map((point) => [...point]),
      normals: (normals || []).map((normal) => [...normal]),
    }
  }
  const fallback = [0, 1, 0]
  const outPoints = [[...points[0]]]
  const outNormals = [[...(normals[0] || fallback)]]
  const limit = Math.max(Number(maxSeg) || 0.01, 1e-4)
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const na = normals[index - 1] || fallback
    const nb = normals[index] || fallback
    const span = dist3(a, b)
    const steps = Math.max(1, Math.ceil(span / limit))
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      outPoints.push(lerp3(a, b, t))
      outNormals.push(normalize3(lerp3(na, nb, t)))
    }
  }
  return { points: outPoints, normals: outNormals }
}
