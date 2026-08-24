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

export function dot3(a, b) {
  return (a?.[0] || 0) * (b?.[0] || 0)
    + (a?.[1] || 0) * (b?.[1] || 0)
    + (a?.[2] || 0) * (b?.[2] || 0)
}

export function normalsAgree(a = [0, 1, 0], b = [0, 1, 0], minDot = 0.25) {
  return dot3(normalize3(a), normalize3(b)) >= minDot
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

/**
 * Concatenate triangle soups and weld coincident vertices.
 * Male GLBs are split at the 16-bit index limit (~65k verts per mesh);
 * welding the shared seams makes a single walkable skin graph.
 */
export function buildCombinedSurfaceGraph(chunks = []) {
  const positions = []
  const normals = []
  const triangles = []
  const offsets = []
  for (const chunk of chunks) {
    offsets.push(positions.length)
    const base = positions.length
    const chunkPositions = chunk.positions || []
    const chunkNormals = chunk.normals || []
    for (let index = 0; index < chunkPositions.length; index += 1) {
      positions.push(chunkPositions[index])
      normals.push(chunkNormals[index] || [0, 1, 0])
    }
    const chunkTriangles = chunk.triangles || []
    for (let index = 0; index < chunkTriangles.length; index += 1) {
      triangles.push(base + chunkTriangles[index])
    }
  }
  const remap = weldVertices(positions)
  return {
    positions,
    normals,
    remap,
    offsets,
    adjacency: buildAdjacency(positions, triangles, remap),
  }
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
    const steps = densifyStepCount(span, limit)
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
    const steps = densifyStepCount(span, limit)
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      outPoints.push(lerp3(a, b, t))
      outNormals.push(normalize3(lerp3(na, nb, t)))
    }
  }
  return { points: outPoints, normals: outNormals }
}

const MAX_DENSIFY_STEPS = 40
const MAX_DENSIFY_SPAN = 0.06

function densifyStepCount(span, limit) {
  if (!Number.isFinite(span) || span <= 1e-12 || span > MAX_DENSIFY_SPAN) return 1
  return Math.min(MAX_DENSIFY_STEPS, Math.max(1, Math.ceil(span / limit)))
}

/** True when a discrete geodesic is safe to draw (no crease jumps / spaghetti). */
export function geodesicIsStable(points = [], {
  maxLengthRatio = 2.2,
  maxEdge = 0.04,
  maxTurningPerPoint = 0.12,
} = {}) {
  if (!points || points.length < 2) return false
  const arrays = points.map((point) => (
    point?.isVector3 ? [point.x, point.y, point.z] : point
  ))
  if (arrays.some((point) => (
    !point || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(point[2])
  ))) return false
  let length = 0
  let maxSeg = 0
  for (let index = 1; index < arrays.length; index += 1) {
    const span = dist3(arrays[index - 1], arrays[index])
    if (!Number.isFinite(span)) return false
    length += span
    if (span > maxSeg) maxSeg = span
  }
  const chord = dist3(arrays[0], arrays[arrays.length - 1])
  if (!Number.isFinite(chord) || maxSeg > maxEdge) return false
  if (length > Math.max(0.1, chord * maxLengthRatio)) return false
  return polylineTurningEnergy(arrays) <= Math.max(2.8, arrays.length * maxTurningPerPoint)
}

/** Interior vertices farther than this from the local chord count as spikes (~1.5 mm). */
export const CHORD_SPIKE_THRESHOLD = 0.0015

function asPoint3(point) {
  if (!point) return [0, 0, 0]
  if (point.isVector3) return [point.x, point.y, point.z]
  return [Number(point[0]) || 0, Number(point[1]) || 0, Number(point[2]) || 0]
}

/** Distance from `points[index]` to the chord of its neighbours. */
export function localChordDeviation(points = [], index = 0) {
  if (index <= 0 || index >= points.length - 1) return 0
  return distanceToSegment3(asPoint3(points[index]), asPoint3(points[index - 1]), asPoint3(points[index + 1]))
}

/** Count sharp ⊐ / V spikes that leave the local chord. Smooth arcs are not counted. */
export function countChordSpikes(points = [], threshold = CHORD_SPIKE_THRESHOLD) {
  const arrays = (points || []).map(asPoint3)
  const limit = Number(threshold)
  if (!Number.isFinite(limit) || arrays.length < 3) return 0
  let count = 0
  for (let index = 1; index < arrays.length - 1; index += 1) {
    if (isSharpChordSpike(arrays, index, limit)) count += 1
  }
  return count
}

export function maxPolylineStep(points = []) {
  const arrays = (points || []).map(asPoint3)
  let max = 0
  for (let index = 1; index < arrays.length; index += 1) {
    const span = dist3(arrays[index - 1], arrays[index])
    if (span > max) max = span
  }
  return max
}

function isSharpChordSpike(arrays, index, threshold) {
  const prev = arrays[index - 1]
  const curr = arrays[index]
  const next = arrays[index + 1]
  if (distanceToSegment3(curr, prev, next) <= threshold) return false
  const toCurr = [curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]]
  const toNext = [next[0] - curr[0], next[1] - curr[1], next[2] - curr[2]]
  const len1 = Math.hypot(toCurr[0], toCurr[1], toCurr[2])
  const len2 = Math.hypot(toNext[0], toNext[1], toNext[2])
  if (len1 < 1e-8 || len2 < 1e-8) return false
  const dot = (toCurr[0] * toNext[0] + toCurr[1] * toNext[1] + toCurr[2] * toNext[2]) / (len1 * len2)
  return dot < 0.2
}

/**
 * Drop interior vertices that make a sharp spike off the local chord.
 * Smooth high-curvature arcs (ear root, finger pad) stay intact.
 */
export function collapseSharpChordSpikes(points = [], normals = [], threshold = CHORD_SPIKE_THRESHOLD) {
  const fallback = [0, 1, 0]
  const limit = Number.isFinite(Number(threshold)) ? Number(threshold) : CHORD_SPIKE_THRESHOLD
  let currentPoints = (points || []).map(asPoint3)
  let currentNormals = currentPoints.map((_, index) => [...(normals[index] || fallback)])
  if (currentPoints.length < 4) {
    return { points: currentPoints, normals: currentNormals }
  }
  for (let pass = 0; pass < 4; pass += 1) {
    const nextPoints = [currentPoints[0]]
    const nextNormals = [currentNormals[0]]
    let dropped = false
    for (let index = 1; index < currentPoints.length - 1; index += 1) {
      const probe = [...nextPoints.slice(-1), currentPoints[index], currentPoints[index + 1]]
      if (isSharpChordSpike(probe, 1, limit)) {
        dropped = true
        continue
      }
      nextPoints.push(currentPoints[index])
      nextNormals.push(currentNormals[index])
    }
    nextPoints.push(currentPoints[currentPoints.length - 1])
    nextNormals.push(currentNormals[currentNormals.length - 1])
    currentPoints = nextPoints
    currentNormals = nextNormals
    if (!dropped) break
  }
  return { points: currentPoints, normals: currentNormals }
}

export function distanceToSegment3(point, a, b) {
  const span = dist3(a, b)
  if (span < 1e-12) return dist3(point, a)
  const t = Math.min(1, Math.max(0, (
    (point[0] - a[0]) * (b[0] - a[0])
    + (point[1] - a[1]) * (b[1] - a[1])
    + (point[2] - a[2]) * (b[2] - a[2])
  ) / (span * span)))
  return dist3(point, lerp3(a, b, t))
}

export function distanceToPolyline3(points = [], probe = [0, 0, 0]) {
  if (!points.length) return Infinity
  if (points.length === 1) return dist3(probe, points[0])
  let best = Infinity
  for (let index = 1; index < points.length; index += 1) {
    const distance = distanceToSegment3(probe, points[index - 1], points[index])
    if (distance < best) best = distance
  }
  return best
}

/** Sum of turning (1 − cos θ). A vertex A* staircase scores high; a taut curve scores low. */
export function polylineTurningEnergy(points = []) {
  let energy = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    const ax = points[index][0] - points[index - 1][0]
    const ay = points[index][1] - points[index - 1][1]
    const az = points[index][2] - points[index - 1][2]
    const bx = points[index + 1][0] - points[index][0]
    const by = points[index + 1][1] - points[index][1]
    const bz = points[index + 1][2] - points[index][2]
    const la = Math.hypot(ax, ay, az)
    const lb = Math.hypot(bx, by, bz)
    if (la < 1e-12 || lb < 1e-12) continue
    const dot = (ax * bx + ay * by + az * bz) / (la * lb)
    energy += 1 - Math.min(1, Math.max(-1, dot))
  }
  return energy
}

/**
 * Drop mesh-edge staircases while keeping real wraps (arm, thigh, head).
 * `epsilon` is the max deviation from a chord, in world units.
 */
export function simplifyPolylineWithNormals(points = [], normals = [], epsilon = 0.008) {
  const fallback = [0, 1, 0]
  if (points.length <= 2) {
    return {
      points: points.map((point) => [...point]),
      normals: points.map((_, index) => [...(normals[index] || fallback)]),
    }
  }
  const eps = Math.max(Number(epsilon) || 0, 0)
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const pair = stack.pop()
    const lo = pair[0]
    const hi = pair[1]
    let worst = -1
    let worstD = 0
    for (let index = lo + 1; index < hi; index += 1) {
      const distance = distanceToSegment3(points[index], points[lo], points[hi])
      if (distance > worstD) {
        worstD = distance
        worst = index
      }
    }
    if (worst >= 0 && worstD > eps) {
      keep[worst] = 1
      stack.push([lo, worst], [worst, hi])
    }
  }
  const outPoints = []
  const outNormals = []
  for (let index = 0; index < points.length; index += 1) {
    if (!keep[index]) continue
    outPoints.push([...points[index]])
    outNormals.push([...(normals[index] || fallback)])
  }
  return { points: outPoints, normals: outNormals }
}

export function tautOnSurfacePolyline(points = [], normals = [], {
  iterations = 16,
  strength = 0.65,
  maxStep = 0.01,
  corridor = null,
  corridorRadius = 0.02,
  project = null,
  minNormalDot = 0.25,
} = {}) {
  if (points.length < 3) {
    return {
      points: points.map((point) => [...point]),
      normals: (normals || []).map((normal) => [...(normal || [0, 1, 0])]),
    }
  }
  const fallback = [0, 1, 0]
  let currentPoints = points.map((point) => [...point])
  let currentNormals = points.map((_, index) => [...(normals[index] || fallback)])
  const guide = (corridor && corridor.length >= 2) ? corridor : points
  const radius = Math.max(Number(corridorRadius) || 0, 0)
  const stepLimit = Math.max(Number(maxStep) || 0, 1e-5)
  const blend = Math.min(1, Math.max(0, Number(strength) || 0))
  const count = Math.max(0, Math.floor(Number(iterations) || 0))

  for (let iter = 0; iter < count; iter += 1) {
    const forward = iter % 2 === 0
    const start = forward ? 1 : currentPoints.length - 2
    const end = forward ? currentPoints.length - 1 : 0
    const step = forward ? 1 : -1
    for (let index = start; index !== end; index += step) {
      const mid = lerp3(currentPoints[index - 1], currentPoints[index + 1], 0.5)
      let candidate = lerp3(currentPoints[index], mid, blend)
      const moved = dist3(currentPoints[index], candidate)
      if (moved > stepLimit) candidate = lerp3(currentPoints[index], candidate, stepLimit / moved)
      let nextNormal = normalize3(lerp3(currentNormals[index - 1], currentNormals[index + 1], 0.5))
      if (project) {
        const hit = project(candidate, currentNormals[index])
        if (!hit?.position) continue
        candidate = hit.position
        if (hit.normal) nextNormal = normalize3(hit.normal)
        if (!normalsAgree(currentNormals[index], nextNormal, minNormalDot)) continue
      }
      if (dist3(currentPoints[index], candidate) > stepLimit * 2.4) continue
      if (radius > 0 && distanceToPolyline3(guide, candidate) > radius) continue
      currentPoints[index] = candidate
      currentNormals[index] = nextNormal
    }
  }

  return { points: currentPoints, normals: currentNormals }
}

/**
 * Drop samples that jumped onto the opposite wall of a crease (armpit, groin).
 * Endpoints stay put so 肩井 / 輒筋 keep their authored skin.
 */
export function collapseOppositeWallSpikes(points = [], normals = [], minDot = 0.2) {
  const fallback = [0, 1, 0]
  if (points.length < 4) {
    return {
      points: points.map((point) => [...point]),
      normals: points.map((_, index) => [...(normals[index] || fallback)]),
    }
  }
  const outPoints = [[...points[0]]]
  const outNormals = [[...(normals[0] || fallback)]]
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = outNormals[outNormals.length - 1]
    const current = normals[index] || fallback
    const next = normals[index + 1] || fallback
    const flipped = !normalsAgree(current, prev, minDot)
    const nextAgrees = normalsAgree(next, prev, minDot)
    if (flipped && nextAgrees) continue
    outPoints.push([...points[index]])
    outNormals.push([...current])
  }
  outPoints.push([...points[points.length - 1]])
  outNormals.push([...(normals[points.length - 1] || fallback)])
  return { points: outPoints, normals: outNormals }
}

export function snapPolylineToSurface(points = [], normals = [], project = null, {
  corridor = null,
  corridorRadius = 0,
  minNormalDot = 0.25,
  maxJump = 0.014,
} = {}) {
  const fallback = [0, 1, 0]
  if (!project) {
    return {
      points: points.map((point) => [...point]),
      normals: points.map((_, index) => [...(normals[index] || fallback)]),
    }
  }
  const guide = (corridor && corridor.length >= 2) ? corridor : null
  const radius = Math.max(Number(corridorRadius) || 0, 0)
  const outPoints = []
  const outNormals = []
  for (let index = 0; index < points.length; index += 1) {
    const guideNormal = normals[index] || outNormals[outNormals.length - 1] || fallback
    const hit = project(points[index], guideNormal)
    const agreed = hit?.position && normalsAgree(guideNormal, hit.normal || guideNormal, minNormalDot)
    const near = agreed && dist3(hit.position, points[index]) <= Math.max(Number(maxJump) || 0, 0)
    const inCorridor = !guide || !near || radius <= 0
      || distanceToPolyline3(guide, hit.position) <= radius
    if (agreed && near && inCorridor) {
      outPoints.push([...hit.position])
      outNormals.push(normalize3(hit.normal || guideNormal))
    } else if (outPoints.length) {
      outPoints.push([...outPoints[outPoints.length - 1]])
      outNormals.push([...outNormals[outNormals.length - 1]])
    } else {
      outPoints.push([...points[index]])
      outNormals.push([...guideNormal])
    }
  }
  return collapseNearDuplicates(outPoints, outNormals)
}

function collapseNearDuplicates(points, normals) {
  if (points.length < 2) return { points, normals }
  const outPoints = [points[0]]
  const outNormals = [normals[0]]
  for (let index = 1; index < points.length; index += 1) {
    if (dist3(points[index], outPoints[outPoints.length - 1]) < 1e-6) continue
    outPoints.push(points[index])
    outNormals.push(normals[index])
  }
  if (dist3(outPoints[outPoints.length - 1], points[points.length - 1]) > 1e-6) {
    outPoints.push(points[points.length - 1])
    outNormals.push(normals[normals.length - 1])
  }
  return { points: outPoints, normals: outNormals }
}
