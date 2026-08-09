import { describe, expect, it } from 'vitest'
import { emptyDocument, parseDocument, validateDocument } from './document.js'

describe('acupuncture document schema', () => {
  it('accepts an empty editor document', () => {
    expect(validateDocument(emptyDocument())).toEqual({ valid: true, errors: [] })
  })

  it('accepts valid paths and acupoints', () => {
    const document = {
      ...emptyDocument(),
      meridians: [{
        id: 'm1',
        name: '肺經',
        color: '#dca35d',
        side: 'left',
        nodes: [
          { position: [0, 1, 0], normal: [0, 0, 1] },
          { position: [0, 2, 0], normal: [0, 0, 1] },
        ],
      }],
      acupoints: [{
        id: 'p1',
        name: '合谷',
        code: 'LI4',
        side: 'left',
        position: [0, 1, 0],
        normal: [0, 0, 1],
      }],
    }
    expect(validateDocument(document).valid).toBe(true)
  })

  it('reports malformed and invalid JSON', () => {
    expect(parseDocument('{broken').valid).toBe(false)
    const result = validateDocument({ ...emptyDocument(), format: 'unknown' })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('constant')
  })
})
