import { describe, expect, it } from 'vitest'
import { MERIDIANS, POINTS, POINT_BY_CODE, pointsForMeridian } from './catalog.js'

describe('authorized acupuncture catalog', () => {
  it('contains 361 unique points across fourteen meridians', () => {
    expect(MERIDIANS).toHaveLength(14)
    expect(POINTS).toHaveLength(361)
    expect(POINT_BY_CODE.size).toBe(361)
  })

  it('omits obsolete 複溜 and keeps canonical KI7 復溜', () => {
    expect(POINTS.some((point) => point.name === '複溜')).toBe(false)
    expect(POINT_BY_CODE.get('KI7').name).toBe('復溜')
  })

  it('sorts each meridian by the numeric portion of its international code', () => {
    const lung = pointsForMeridian('LU')
    expect(lung.map((point) => point.code)).toEqual([
      'LU1', 'LU2', 'LU3', 'LU4', 'LU5', 'LU6',
      'LU7', 'LU8', 'LU9', 'LU10', 'LU11',
    ])
  })

  it('marks primary meridians bilateral and CV/GV midline', () => {
    expect(MERIDIANS.filter((item) => item.bilateral)).toHaveLength(12)
    expect(MERIDIANS.find((item) => item.id === 'CV').bilateral).toBe(false)
    expect(MERIDIANS.find((item) => item.id === 'GV').bilateral).toBe(false)
  })
})
