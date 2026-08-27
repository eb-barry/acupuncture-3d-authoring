/** Pixel ratio while the camera is idle. Cap at 2 to match the existing renderer. */
export const IDLE_PIXEL_RATIO = 2
/** Pixel ratio while orbiting / damping. */
export const ORBIT_PIXEL_RATIO = 1

export const IDLE_SHADOW_MAP_SIZE = 2048
export const ORBIT_SHADOW_MAP_SIZE = 512

/** Keep the cheap view until OrbitControls damping stops dispatching `change`. */
export const ORBIT_IDLE_MS = 180

export function clampPixelRatio(deviceRatio, moving) {
  const cap = moving ? ORBIT_PIXEL_RATIO : IDLE_PIXEL_RATIO
  const ratio = Number(deviceRatio)
  if (!(ratio > 0)) return cap
  return Math.min(ratio, cap)
}

export function shouldUseFastOrbitView({
  pointerDown = false,
  lastChangeAt = 0,
  now = 0,
  idleMs = ORBIT_IDLE_MS,
} = {}) {
  if (pointerDown) return true
  if (!(lastChangeAt > 0)) return false
  return now - lastChangeAt < idleMs
}
