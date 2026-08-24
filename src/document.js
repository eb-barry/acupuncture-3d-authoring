import Ajv from 'ajv'
import { keepPairHandles, HANDLE_STYLES } from './workflow.js'

export const BODY_MODELS = {
  male: {
    id: 'male',
    label: '男性',
    fileName: 'male_character.glb',
    // Both built-in GLBs face +Z after framing; male head-extremes alone can
    // mis-read the occiput as the nose, so lock the known asset orientation.
    frontAxis: [0, 0, 1],
  },
  female: {
    id: 'female',
    label: '女性',
    fileName: 'female-character.glb',
    frontAxis: [0, 0, 1],
  },
}

export function inferBodyModel(model = {}) {
  if (model?.body === 'male' || model?.body === 'female') return model.body
  const name = String(model?.name || '').toLowerCase()
  if (name.includes('female')) return 'female'
  if (name.includes('male')) return 'male'
  return 'male'
}

export const emptyDocument = (body = 'male') => {
  const resolved = BODY_MODELS[body] ? body : 'male'
  const preset = BODY_MODELS[resolved]
  return {
    format: 'acupuncture-3d',
    version: 2,
    model: { name: preset.fileName, hash: null, body: resolved },
    settings: {
      markerSize: 10,
      markerColor: '#ef4444',
      lineColor: '#3b82f6',
      lineWidth: 3,
    },
    meridians: [],
    acupoints: [],
  }
}

const vector = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
}

const meridianPalette = { enum: ['#ef4444', '#3b82f6', '#22c55e'] }
const acupointPalette = { enum: ['#ef4444', '#3b82f6', '#22c55e', '#111111'] }

export const documentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['format', 'version', 'model', 'settings', 'meridians', 'acupoints'],
  properties: {
    format: { const: 'acupuncture-3d' },
    version: { const: 2 },
    model: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'hash', 'body'],
      properties: {
        name: { type: ['string', 'null'] },
        hash: { type: ['string', 'null'] },
        body: { enum: ['male', 'female'] },
      },
    },
    settings: {
      type: 'object',
      additionalProperties: false,
      required: ['markerSize', 'markerColor', 'lineColor', 'lineWidth'],
      properties: {
        markerSize: { type: 'integer', minimum: 5, maximum: 30 },
        markerColor: acupointPalette,
        lineColor: meridianPalette,
        lineWidth: { type: 'integer', minimum: 1, maximum: 10 },
      },
    },
    meridians: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'pairId', 'meridianId', 'name', 'color', 'width', 'side', 'nodes'],
        properties: {
          id: { type: 'string', minLength: 1 },
          pairId: { type: ['string', 'null'] },
          meridianId: { type: 'string', minLength: 2 },
          name: { type: 'string', minLength: 1 },
          color: meridianPalette,
          width: { type: 'integer', minimum: 1, maximum: 10 },
          side: { enum: ['left', 'right', 'midline'] },
          nodes: {
            type: 'array',
            minItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'pointId', 'position', 'normal'],
              properties: {
                type: { enum: ['acupoint', 'control'] },
                pointId: { type: ['string', 'null'] },
                position: vector,
                normal: vector,
                style: { enum: ['along', 'linear', 'curve'] },
              },
            },
          },
        },
      },
    },
    acupoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id', 'pairId', 'name', 'code', 'meridianId', 'meridianName',
          'sequence', 'side', 'color', 'size', 'position', 'normal',
        ],
        properties: {
          id: { type: 'string', minLength: 1 },
          pairId: { type: ['string', 'null'] },
          name: { type: 'string', minLength: 1 },
          code: { type: 'string', minLength: 1 },
          meridianId: { type: 'string', minLength: 2 },
          meridianName: { type: 'string', minLength: 1 },
          sequence: { type: 'integer', minimum: 1 },
          side: { enum: ['left', 'right', 'midline'] },
          color: acupointPalette,
          size: { type: 'integer', minimum: 5, maximum: 30 },
          position: vector,
          normal: vector,
        },
      },
    },
  },
}

const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile(documentSchema)

export function validateDocument(value) {
  const valid = validate(value)
  return {
    valid,
    errors: valid
      ? []
      : validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`),
  }
}

export function parseDocument(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { valid: false, errors: [`JSON 解析失敗：${error.message}`] }
  }
  const migrated = migrateDocument(value)
  const result = validateDocument(migrated)
  return { ...result, value: result.valid ? migrated : undefined }
}

function migrateRouteNodes(nodes = []) {
  const list = nodes || []
  const acupointIndexes = list
    .map((node, index) => (node.type === 'acupoint' ? index : -1))
    .filter((index) => index >= 0)
  if (acupointIndexes.length < 2) return list.filter((node) => node.type === 'acupoint').map(sanitizeRouteNode)
  const result = []
  for (let pair = 0; pair < acupointIndexes.length; pair += 1) {
    result.push(sanitizeRouteNode(list[acupointIndexes[pair]]))
    if (pair >= acupointIndexes.length - 1) break
    const fromIndex = acupointIndexes[pair]
    const toIndex = acupointIndexes[pair + 1]
    const controls = list.slice(fromIndex + 1, toIndex).filter((node) => node.type === 'control')
    result.push(...keepPairHandles(controls).map(sanitizeRouteNode))
  }
  return result
}

/** Drop hit metadata (mesh, distance, faceIndex) that the schema forbids. */
export function sanitizeRouteNode(node = {}) {
  const type = node?.type === 'acupoint' ? 'acupoint' : 'control'
  const sanitized = {
    type,
    pointId: type === 'acupoint' && node.pointId ? String(node.pointId) : null,
    position: [
      Number(node.position?.[0]) || 0,
      Number(node.position?.[1]) || 0,
      Number(node.position?.[2]) || 0,
    ],
    normal: [
      Number(node.normal?.[0]) || 0,
      Number(node.normal?.[1]) || 0,
      Number(node.normal?.[2]) || 0,
    ],
  }
  if (HANDLE_STYLES.includes(node.style)) sanitized.style = node.style
  return sanitized
}

export function migrateDocument(value) {
  if (value?.format !== 'acupuncture-3d') return value

  if (value.version === 1) {
    const defaults = emptyDocument(inferBodyModel(value.model))
    return {
      ...defaults,
      model: {
        name: value.model?.name ?? defaults.model.name,
        hash: null,
        body: defaults.model.body,
      },
      meridians: (value.meridians || []).map((route) => ({
        id: route.id,
        pairId: null,
        meridianId: 'UN',
        name: route.name,
        color: ['#ef4444', '#3b82f6', '#22c55e'].includes(route.color) ? route.color : defaults.settings.lineColor,
        width: defaults.settings.lineWidth,
        side: route.side === 'bilateral' ? 'left' : route.side,
        nodes: route.nodes.map((node) => ({
          type: 'control',
          pointId: null,
          position: node.position,
          normal: node.normal,
        })),
      })),
      acupoints: (value.acupoints || []).map((point) => ({
        ...point,
        pairId: null,
        meridianId: 'UN',
        meridianName: '未分類',
        sequence: 1,
        color: defaults.settings.markerColor,
        size: defaults.settings.markerSize,
      })),
    }
  }

  if (value.version === 2) {
    const body = inferBodyModel(value.model)
    const preset = BODY_MODELS[body]
    return {
      ...value,
      model: {
        name: value.model?.name ?? preset.fileName,
        hash: value.model?.hash ?? null,
        body,
      },
      meridians: (value.meridians || []).map((route) => ({
        ...route,
        nodes: migrateRouteNodes(route.nodes),
      })),
    }
  }

  return value
}

/** Download basename that distinguishes male vs female meridian JSON. */
export function exportFileName(document, date = new Date()) {
  const body = inferBodyModel(document?.model)
  const day = date.toISOString().slice(0, 10)
  return `meridian-map-v2-${body}-${day}.json`
}
