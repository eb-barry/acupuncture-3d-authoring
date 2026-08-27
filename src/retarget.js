import { BODY_MODELS } from './document.js'

export function scalePosition(position = [0, 0, 0], sourceHeight, targetHeight) {
  const source = Number(sourceHeight)
  const target = Number(targetHeight)
  const x = Number(position[0]) || 0
  const y = Number(position[1]) || 0
  const z = Number(position[2]) || 0
  if (!(source > 0) || !(target > 0)) return [x, y, z]
  const scale = target / source
  return [x * scale, y * scale, z * scale]
}

export function bindDocumentToBody(document, body) {
  const preset = BODY_MODELS[body] || BODY_MODELS.male
  return {
    ...document,
    model: {
      name: preset.fileName,
      hash: null,
      body: preset.id,
    },
  }
}

/** Rewrite every stored point through `mapPoint({ position, normal, side, meridianId })`. */
export function mapDocumentAnnotations(document, mapPoint) {
  const acupoints = (document.acupoints || []).map((point) => {
    const mapped = mapPoint({
      position: point.position,
      normal: point.normal,
      side: point.side,
      meridianId: point.meridianId,
    })
    return {
      ...point,
      position: mapped.position,
      normal: mapped.normal,
    }
  })
  const byId = new Map(acupoints.map((point) => [point.id, point]))
  const meridians = (document.meridians || []).map((route) => ({
    ...route,
    nodes: (route.nodes || []).map((node) => {
      if (node.type === 'acupoint' && node.pointId && byId.has(node.pointId)) {
        const point = byId.get(node.pointId)
        return { ...node, position: [...point.position], normal: [...point.normal] }
      }
      const mapped = mapPoint({
        position: node.position,
        normal: node.normal,
        side: route.side,
        meridianId: route.meridianId,
      })
      return { ...node, position: mapped.position, normal: mapped.normal }
    }),
  }))
  return { ...document, acupoints, meridians }
}
