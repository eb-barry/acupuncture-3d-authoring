import Ajv from 'ajv'

export const emptyDocument = () => ({
  format: 'acupuncture-3d',
  version: 2,
  model: { name: null, hash: null },
  settings: {
    markerSize: 12,
    markerColor: '#ef4444',
    lineColor: '#3b82f6',
    lineWidth: 4,
  },
  meridians: [],
  acupoints: [],
})

const vector = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
}

const palette = { enum: ['#ef4444', '#3b82f6', '#22c55e'] }

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
      required: ['name', 'hash'],
      properties: {
        name: { type: ['string', 'null'] },
        hash: { type: ['string', 'null'] },
      },
    },
    settings: {
      type: 'object',
      additionalProperties: false,
      required: ['markerSize', 'markerColor', 'lineColor', 'lineWidth'],
      properties: {
        markerSize: { type: 'integer', minimum: 5, maximum: 30 },
        markerColor: palette,
        lineColor: palette,
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
          color: palette,
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
          color: palette,
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

export function migrateDocument(value) {
  if (value?.format !== 'acupuncture-3d' || value.version !== 1) return value
  const defaults = emptyDocument()
  return {
    ...defaults,
    model: { name: value.model?.name ?? null, hash: null },
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
