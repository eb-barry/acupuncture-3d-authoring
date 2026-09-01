export function resolveStudioBodyId(bodyId) {
  return bodyId === 'female' ? 'female' : 'male'
}

/**
 * Whether the 人體模型 control should start (or retry) a GLB load.
 * Re-selecting the already-visible body is a no-op; an empty scene or a
 * different body always loads. A second request for the in-flight body is ignored.
 */
export function shouldLoadBodyModel({
  requestedBody,
  activeBody,
  meshCount = 0,
  inFlightBody = null,
} = {}) {
  const requested = resolveStudioBodyId(requestedBody)
  const active = resolveStudioBodyId(activeBody)
  if (inFlightBody === requested) return false
  if (requested !== active) return true
  return !(meshCount > 0)
}

export function isCurrentBodyLoad(seq, currentSeq, wantedBody, body) {
  return seq === currentSeq && wantedBody === body
}

/**
 * Clone a studio document for the per-body cache. Falls back to JSON if
 * structuredClone fails (non-cloneable leftovers after a JSON import).
 */
export function cloneStudioDocument(value) {
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return null
    }
  }
}
