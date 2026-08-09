import Ajv from 'ajv'

export const emptyDocument = () => ({
  format: 'acupuncture-3d',
  version: 1,
  model: { name: null },
  meridians: [],
  acupoints: [],
})

const vector = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
}

export const documentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['format', 'version', 'model', 'meridians', 'acupoints'],
  properties: {
    format: { const: 'acupuncture-3d' },
    version: { const: 1 },
    model: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: ['string', 'null'] } },
    },
    meridians: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'color', 'side', 'nodes'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          side: { enum: ['left', 'right', 'midline', 'bilateral'] },
          nodes: {
            type: 'array',
            minItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['position', 'normal'],
              properties: { position: vector, normal: vector },
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
        required: ['id', 'name', 'code', 'side', 'position', 'normal'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          code: { type: 'string', minLength: 1 },
          side: { enum: ['left', 'right', 'midline'] },
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
  const result = validateDocument(value)
  return { ...result, value: result.valid ? value : undefined }
}
