/**
 * Surface-conformal ribbon geometry for meridians and acupoint dots (方案 A).
 *
 * The strip lies in the skin's tangent plane and every centreline sample is
 * projected onto the mesh, so nothing is pushed outward along the normal:
 * depth bias, not a world-space lift, keeps it drawn above the skin. At a
 * grazing angle the strip foreshortens and fades exactly like paint, so it
 * never hangs off the silhouette.
 *
 * No Three.js import — the caller supplies a `project` callback and consumes
 * plain arrays / typed arrays.
 */

/** Stature the mm-based UI settings assume when converting to world units. */
export const REFERENCE_BODY_HEIGHT_M = 1.75

/**
 * A hair of lift, not a stand-off. A chord between 2 mm samples, and a dot's
 * conformed rim, still dip a couple of tenths of a millimetre below the skin;
 * without this they lose the depth test in patches and the line breaks up.
 * 0.4 mm on a 1.75 m body is ~1/13 of the old offset and under a pixel until
 * very high zoom. Set the slider to 0 for a strictly coplanar comparison.
 */
export const DEFAULT_SKIN_LIFT_MM = 0.4
export const MAX_SKIN_LIFT_MM = 5

export const DEFAULT_RIBBON_WIDTH_MM = 3.5
export const MIN_RIBBON_WIDTH_MM = 1
export const MAX_RIBBON_WIDTH_MM = 8

export const DEFAULT_MARKER_DIAMETER_MM = 7
export const MIN_MARKER_DIAMETER_MM = 2
export const MAX_MARKER_DIAMETER_MM = 14

/** Screen floors: a thin world-space strip must not vanish when zoomed out. */
export const RIBBON_MIN_PIXELS = 1.6
export const MARKER_MIN_PIXELS = 5

/**
 * Deviation budget between a rendered chord and the skin. Below the depth
 * bias' reach, so a chord can never sink far enough to be culled.
 */
export const SURFACE_TOLERANCE = 0.0002

/**
 * Fine sampling: fingers are the tightest surface (radius ≈ 8 mm) and
 * curvatureSampleStep(0.008, SURFACE_TOLERANCE) ≈ 3.6 mm, so 2 mm is safe
 * everywhere. Coarse sampling is the interactive step used while dragging.
 */
export const FINE_SAMPLE_STEP = 0.002
export const COARSE_SAMPLE_STEP = 0.01

/** Guard against a pathological run eating the frame budget. */
export const MAX_RIBBON_SAMPLES = 6000

/** A projection that moves a sample further than this is refused. */
export const MAX_CONFORM_PULL = 0.008

export function worldPerMillimetre(bodyHeightWorld = 0) {
  const height = Number(bodyHeightWorld)
  if (!Number.isFinite(height) || height <= 0) return 0.001
  return height / (REFERENCE_BODY_HEIGHT_M * 1000)
}

export function clampMillimetres(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/** Deviation of a chord of length `span` from a surface of radius `radius`. */
export function chordSagitta(span, radius) {
  const s = Math.abs(Number(span) || 0)
  const r = Math.abs(Number(radius) || 0)
  if (r < 1e-9) return Infinity
  return (s * s) / (8 * r)
}

/** Longest chord on a `radius` surface that stays within `tolerance`. */
export function curvatureSampleStep(radius, tolerance = SURFACE_TOLERANCE) {
  const r = Math.max(Number(radius) || 0, 0)
  const eps = Math.max(Number(tolerance) || 0, 0)
  return Math.sqrt(8 * r * eps)
}

export function sampleStepForQuality(quality = 'fine') {
  return quality === 'coarse' ? COARSE_SAMPLE_STEP : FINE_SAMPLE_STEP
}

/** Interpolate so no segment is longer than `maxStep`, without mutating input. */
export function densifyPath(points = [], maxStep = FINE_SAMPLE_STEP, {
  maxSamples = MAX_RIBBON_SAMPLES,
} = {}) {
  const path = points.map(asPoint)
  if (path.length < 2) return path
  const step = Math.max(Number(maxStep) || FINE_SAMPLE_STEP, 1e-5)
  const total = pathLength(path)
  // One coarse pass instead of a stall when a run is far longer than expected.
  const budget = Math.max(2, Math.floor(Number(maxSamples) || MAX_RIBBON_SAMPLES))
  const effective = total / step > budget ? total / budget : step
  const out = [path[0]]
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]
    const b = path[index]
    const span = distance3(a, b)
    const steps = Math.max(1, Math.ceil(span / effective))
    for (let step2 = 1; step2 <= steps; step2 += 1) {
      out.push(lerp3(a, b, step2 / steps))
    }
  }
  return out
}

/**
 * Pull every sample onto the mesh and read back its surface normal.
 * `project(point, guideNormal)` returns `{ position, normal }` or null.
 *
 * A sample is refused — and keeps its authored place — when the projector
 * finds nothing, when it would travel further than `maxPull`, or when it lands
 * on a surface facing away from the running normal. The last case is the
 * armpit / finger-web crease: nearest-surface would otherwise hop to the
 * opposite wall. Samples are `FINE_SAMPLE_STEP` apart, so a genuine wrap turns
 * the normal only slightly between them.
 */
export function conformPath(points = [], project, {
  maxPull = MAX_CONFORM_PULL,
  minNormalDot = 0.2,
  guides = null,
} = {}) {
  const path = points.map(asPoint)
  const outPoints = []
  const outNormals = []
  const resolved = []
  let unresolved = 0
  let maxMoved = 0
  let guide = null
  const limit = Math.max(Number(maxPull) || 0, 0)

  for (let index = 0; index < path.length; index += 1) {
    const point = path[index]
    // A supplied guide cannot go stale: a refused sample would otherwise leave
    // the running normal behind and make the next cast miss as well.
    if (guides && guides[index]) guide = normalize3(guides[index])
    const hit = typeof project === 'function' ? project(point, guide) : null
    const position = hit && isFinitePoint(hit.position) ? asPoint(hit.position) : null
    const moved = position ? distance3(position, point) : Infinity
    const facing = position && isFinitePoint(hit.normal) && guide
      ? dot3(normalize3(hit.normal), guide) >= minNormalDot
      : true
    if (position && moved <= limit && facing) {
      const normal = isFinitePoint(hit.normal) ? normalize3(hit.normal) : (guide || [0, 1, 0])
      outPoints.push(position)
      outNormals.push(normal)
      resolved.push(true)
      if (!guides) guide = normal
      if (moved > maxMoved) maxMoved = moved
      continue
    }
    unresolved += 1
    outPoints.push(point)
    outNormals.push(guide ? [...guide] : [0, 1, 0])
    resolved.push(false)
  }

  backfillLeadingNormals(outNormals)
  return { points: outPoints, normals: outNormals, resolved, maxMoved, unresolved }
}

/** Leading samples projected before any normal was known inherit the first real one. */
function backfillLeadingNormals(normals) {
  const first = normals.findIndex((normal) => normal && Math.hypot(...normal) > 0.5)
  if (first <= 0) return
  for (let index = 0; index < first; index += 1) normals[index] = [...normals[first]]
}

/** Neighbour averaging so face normals do not facet the ribbon's twist. */
export function smoothPathNormals(normals = [], passes = 1) {
  let current = normals.map((normal) => normalize3(normal || [0, 1, 0]))
  const rounds = Math.max(0, Math.floor(Number(passes) || 0))
  for (let round = 0; round < rounds; round += 1) {
    const next = current.map((normal, index) => {
      if (index === 0 || index === current.length - 1) return [...normal]
      const prev = current[index - 1]
      const following = current[index + 1]
      return normalize3([
        prev[0] + normal[0] * 2 + following[0],
        prev[1] + normal[1] * 2 + following[1],
        prev[2] + normal[2] * 2 + following[2],
      ])
    })
    current = next
  }
  return current
}

/**
 * Window over which a tangent is measured, in samples. A conformed path
 * zigzags at mesh-triangle scale; a one-sample difference inherits that noise
 * and makes the strip wobble, so average over roughly a centimetre of path.
 */
export const TANGENT_WINDOW_WORLD = 0.01

export function tangentWindow(step = FINE_SAMPLE_STEP) {
  return Math.max(1, Math.round(TANGENT_WINDOW_WORLD / Math.max(Number(step) || FINE_SAMPLE_STEP, 1e-5)))
}

/** Unit tangent at `index`, measured across `window` samples either side. */
export function pathTangent(points = [], index = 0, window = 1) {
  if (points.length < 2) return [0, 1, 0]
  const at = Math.min(points.length - 1, Math.max(0, index))
  const reach = Math.max(1, Math.floor(Number(window) || 1))
  const before = points[Math.max(0, at - reach)]
  const after = points[Math.min(points.length - 1, at + reach)]
  const delta = [after[0] - before[0], after[1] - before[1], after[2] - before[2]]
  if (Math.hypot(...delta) < 1e-12) return [0, 1, 0]
  return normalize3(delta)
}

/** Consistently oriented, window-smoothed tangents along a path. */
export function pathTangents(points = [], window = 1) {
  const out = []
  for (let index = 0; index < points.length; index += 1) {
    let tangent = pathTangent(points, index, window)
    const previous = out[out.length - 1]
    if (previous && dot3(tangent, previous) < 0) tangent = [-tangent[0], -tangent[1], -tangent[2]]
    out.push(tangent)
  }
  return out
}

/**
 * Unit side directions in the tangent plane. Consecutive frames are kept on
 * the same side so the strip cannot twist inside out at a sharp turn.
 */
export function ribbonSideDirections(points = [], normals = [], window = 1) {
  const tangents = pathTangents(points, window)
  const out = []
  for (let index = 0; index < points.length; index += 1) {
    const normal = normalize3(normals[index] || [0, 1, 0])
    const tangent = tangents[index]
    let side = cross3(normal, tangent)
    if (Math.hypot(...side) < 1e-9) side = cross3(normal, [normal[1], normal[2], normal[0]])
    if (Math.hypot(...side) < 1e-9) side = [1, 0, 0]
    side = normalize3(side)
    // Re-orthogonalise: the offset must not climb out of the tangent plane.
    const along = dot3(side, normal)
    side = normalize3([
      side[0] - normal[0] * along,
      side[1] - normal[1] * along,
      side[2] - normal[2] * along,
    ])
    const previous = out[out.length - 1]
    if (previous && dot3(side, previous) < 0) side = [-side[0], -side[1], -side[2]]
    out.push(side)
  }
  return out
}

/**
 * Triangle-strip attributes. `position` is the on-skin centreline and `normal`
 * the surface normal, used both for the silhouette fade and the lift.
 *
 * The shader widens the strip across the view direction (`tangent` × view,
 * signed by `sign`) so its screen width is stable; `offset` is the
 * tangent-plane fallback for the stretch where the path runs at the camera.
 * Widening across the view rather than inside the tangent plane keeps the
 * strip from twisting into a sawtooth at a grazing angle, and the fade — not
 * the orientation — is what stops it reaching past the silhouette.
 */
export function buildRibbonAttributes(points = [], normals = [], window = 1) {
  const count = points.length
  if (count < 2) {
    return {
      position: new Float32Array(0),
      offset: new Float32Array(0),
      normal: new Float32Array(0),
      tangent: new Float32Array(0),
      sign: new Float32Array(0),
      index: new Uint32Array(0),
      vertexCount: 0,
    }
  }
  const tangents = pathTangents(points, window)
  const sides = ribbonSideDirections(points, normals, window)
  const position = new Float32Array(count * 6)
  const offset = new Float32Array(count * 6)
  const normal = new Float32Array(count * 6)
  const tangent = new Float32Array(count * 6)
  const sign = new Float32Array(count * 2)
  for (let index = 0; index < count; index += 1) {
    const point = points[index]
    const surface = normalize3(normals[index] || [0, 1, 0])
    const side = sides[index]
    const along = tangents[index]
    for (let lane = 0; lane < 2; lane += 1) {
      const base = (index * 2 + lane) * 3
      const laneSign = lane === 0 ? -1 : 1
      position[base] = point[0]
      position[base + 1] = point[1]
      position[base + 2] = point[2]
      offset[base] = side[0] * laneSign
      offset[base + 1] = side[1] * laneSign
      offset[base + 2] = side[2] * laneSign
      normal[base] = surface[0]
      normal[base + 1] = surface[1]
      normal[base + 2] = surface[2]
      tangent[base] = along[0]
      tangent[base + 1] = along[1]
      tangent[base + 2] = along[2]
      sign[index * 2 + lane] = laneSign
    }
  }
  const index = new Uint32Array((count - 1) * 6)
  for (let span = 0; span < count - 1; span += 1) {
    const a = span * 2
    const write = span * 6
    index[write] = a
    index[write + 1] = a + 1
    index[write + 2] = a + 3
    index[write + 3] = a
    index[write + 4] = a + 3
    index[write + 5] = a + 2
  }
  return { position, offset, normal, tangent, sign, index, vertexCount: count * 2 }
}

/** World size of one pixel at `distance` (perspective) or in an ortho frustum. */
export function worldPerPixel({
  distance = 1,
  fovDeg = 45,
  viewportHeight = 1,
  orthoViewHeight = null,
} = {}) {
  const height = Math.max(Number(viewportHeight) || 1, 1)
  if (orthoViewHeight != null) {
    return Math.max(Number(orthoViewHeight) || 0, 1e-6) / height
  }
  const fov = (Number(fovDeg) || 45) * Math.PI / 180
  const dist = Math.max(Number(distance) || 0, 1e-4)
  return 2 * dist * Math.tan(fov / 2) / height
}

/** Perspective factor the shader multiplies by view depth. */
export function perspectivePixelScale(fovDeg = 45, viewportHeight = 1) {
  const height = Math.max(Number(viewportHeight) || 1, 1)
  const fov = (Number(fovDeg) || 45) * Math.PI / 180
  return 2 * Math.tan(fov / 2) / height
}

/**
 * Keep a thin strip visible without letting it grow into a stripe: widen to a
 * pixel floor and drop coverage by the same factor, so the drawn ink stays
 * `width` wide. Mirrors the vertex/fragment shader arithmetic.
 */
export function ribbonRenderWidth(width, pixelSize, minPixels = RIBBON_MIN_PIXELS) {
  const target = Math.max(Number(width) || 0, 0)
  const floor = Math.max(Number(minPixels) || 0, 0) * Math.max(Number(pixelSize) || 0, 0)
  const rendered = Math.max(target, floor)
  if (rendered <= 0) return { width: 0, coverage: 0 }
  return { width: rendered, coverage: Math.min(1, target / rendered) }
}

/** Uniform inflation that keeps an on-skin dot from falling below `minPixels`. */
export function markerScreenScale(diameter, pixelSize, minPixels = MARKER_MIN_PIXELS) {
  const size = Math.max(Number(diameter) || 0, 1e-9)
  const floor = Math.max(Number(minPixels) || 0, 0) * Math.max(Number(pixelSize) || 0, 0)
  return Math.max(1, floor / size)
}

/**
 * Acupoint dot that follows the skin: a fan whose rim is projected onto the
 * mesh, returned as deltas from `center` so the mesh needs no rotation.
 * A rim sample that jumps a crease (normal disagrees, or it travels much
 * further than the radius) falls back to the flat tangent-plane position.
 */
export function conformDisc(center, normal, radius, project, {
  segments = 24,
  minNormalDot = 0.35,
} = {}) {
  const origin = asPoint(center)
  const up = normalize3(normal || [0, 1, 0])
  const [tangent, binormal] = tangentBasis(up)
  const r = Math.max(Number(radius) || 0, 0)
  const count = Math.max(6, Math.floor(Number(segments) || 24))
  const rim = []
  const rimNormals = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
    const flat = [
      origin[0] + (tangent[0] * Math.cos(angle) + binormal[0] * Math.sin(angle)) * r,
      origin[1] + (tangent[1] * Math.cos(angle) + binormal[1] * Math.sin(angle)) * r,
      origin[2] + (tangent[2] * Math.cos(angle) + binormal[2] * Math.sin(angle)) * r,
    ]
    const hit = typeof project === 'function' ? project(flat, up) : null
    const landed = hit && isFinitePoint(hit.position) ? asPoint(hit.position) : null
    const agrees = landed && isFinitePoint(hit.normal)
      ? dot3(normalize3(hit.normal), up) >= minNormalDot
      : false
    const useHit = landed && agrees && distance3(landed, flat) <= Math.max(r, 1e-4) * 1.5
    const point = useHit ? landed : flat
    rim.push([point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]])
    rimNormals.push(useHit && isFinitePoint(hit.normal) ? normalize3(hit.normal) : [...up])
  }
  return { center: origin, normal: up, radius: r, rim, rimNormals }
}

/** Fan attributes for a conformed dot; positions are deltas from its centre. */
export function buildDiscAttributes(disc) {
  const rim = disc?.rim || []
  const rimNormals = disc?.rimNormals || []
  const centerNormal = normalize3(disc?.normal || [0, 1, 0])
  const count = rim.length
  if (count < 3) {
    return {
      position: new Float32Array(0),
      offset: new Float32Array(0),
      normal: new Float32Array(0),
      tangent: new Float32Array(0),
      sign: new Float32Array(0),
      index: new Uint32Array(0),
      vertexCount: 0,
    }
  }
  const vertexCount = count + 1
  const position = new Float32Array(vertexCount * 3)
  const normal = new Float32Array(vertexCount * 3)
  normal[0] = centerNormal[0]
  normal[1] = centerNormal[1]
  normal[2] = centerNormal[2]
  for (let index = 0; index < count; index += 1) {
    const write = (index + 1) * 3
    const point = rim[index]
    const surface = normalize3(rimNormals[index] || centerNormal)
    position[write] = point[0]
    position[write + 1] = point[1]
    position[write + 2] = point[2]
    normal[write] = surface[0]
    normal[write + 1] = surface[1]
    normal[write + 2] = surface[2]
  }
  const index = new Uint32Array(count * 3)
  for (let step = 0; step < count; step += 1) {
    const write = step * 3
    index[write] = 0
    index[write + 1] = step + 1
    index[write + 2] = ((step + 1) % count) + 1
  }
  return {
    position,
    offset: new Float32Array(vertexCount * 3),
    normal,
    tangent: new Float32Array(vertexCount * 3),
    sign: new Float32Array(vertexCount),
    index,
    vertexCount,
  }
}

/** Largest distance from a polyline's vertices to the projected surface. */
export function maxSurfaceDeviation(points = [], project) {
  let worst = 0
  for (const raw of points) {
    const point = asPoint(raw)
    const hit = typeof project === 'function' ? project(point, null) : null
    if (!hit || !isFinitePoint(hit.position)) continue
    const gap = distance3(asPoint(hit.position), point)
    if (gap > worst) worst = gap
  }
  return worst
}

export function pathLength(points = []) {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += distance3(asPoint(points[index - 1]), asPoint(points[index]))
  }
  return total
}

export function tangentBasis(normal = [0, 1, 0]) {
  const up = normalize3(normal)
  const seed = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  let tangent = cross3(up, seed)
  if (Math.hypot(...tangent) < 1e-9) tangent = cross3(up, [0, 0, 1])
  tangent = normalize3(tangent)
  return [tangent, normalize3(cross3(up, tangent))]
}

function asPoint(value) {
  if (!value) return [0, 0, 0]
  if (value.isVector3) return [value.x, value.y, value.z]
  return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0]
}

function isFinitePoint(value) {
  if (!value) return false
  const point = value.isVector3 ? [value.x, value.y, value.z] : value
  return Number.isFinite(Number(point[0]))
    && Number.isFinite(Number(point[1]))
    && Number.isFinite(Number(point[2]))
}

function distance3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function normalize3(value) {
  const point = asPoint(value)
  const length = Math.hypot(...point) || 1
  return [point[0] / length, point[1] / length, point[2] / length]
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}
