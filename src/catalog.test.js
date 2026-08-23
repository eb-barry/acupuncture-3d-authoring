import { describe, expect, it } from 'vitest'
import {
  MERIDIANS,
  POINTS,
  POINT_BY_CODE,
  isOmittedSurfaceSpan,
  isRenDuCodePair,
  meridianLineColor,
  pointsForMeridian,
} from './catalog.js'

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

  it('omits the classical BL40–BL41 surface pathway in both directions', () => {
    const bladder = pointsForMeridian('BL')
    const bl40 = bladder.findIndex((point) => point.code === 'BL40')
    expect(POINT_BY_CODE.get('BL40').name).toBe('委中')
    expect(POINT_BY_CODE.get('BL41').name).toBe('附分')
    expect(bladder[bl40 + 1].code).toBe('BL41')
    expect(isOmittedSurfaceSpan('BL40', 'BL41')).toBe(true)
    expect(isOmittedSurfaceSpan('BL41', 'BL40')).toBe(true)
    expect(isOmittedSurfaceSpan('BL39', 'BL40')).toBe(false)
    expect(isOmittedSurfaceSpan('BL41', 'BL42')).toBe(false)
    expect(isOmittedSurfaceSpan('', 'BL41')).toBe(false)
  })

  it('keeps 任督 consecutive pairs drawable even when they are not BL40–BL41', () => {
    expect(isRenDuCodePair('GV15', 'GV14')).toBe(true)
    expect(isRenDuCodePair('GV13', 'GV12')).toBe(true)
    expect(isRenDuCodePair('GV11', 'GV10')).toBe(true)
    expect(isRenDuCodePair('GV3', 'GV2')).toBe(true)
    expect(isRenDuCodePair('CV4', 'CV3')).toBe(true)
    expect(isRenDuCodePair('GV14', 'BL11')).toBe(false)
    expect(isRenDuCodePair('BL40', 'BL41')).toBe(false)
    expect(isOmittedSurfaceSpan('GV15', 'GV14')).toBe(false)
  })

  it('assigns global yin / yang / ren-du meridian line colors', () => {
    expect(MERIDIANS.filter((item) => item.group === 'yin')).toHaveLength(6)
    expect(MERIDIANS.filter((item) => item.group === 'yang')).toHaveLength(6)
    expect(MERIDIANS.filter((item) => item.group === 'ren-du').map((item) => item.id)).toEqual(['CV', 'GV'])
    expect(meridianLineColor('CV')).toBe('#3b82f6')
    expect(meridianLineColor('GV')).toBe('#3b82f6')
    expect(meridianLineColor('LU')).toBe('#22c55e')
    expect(meridianLineColor('LI')).toBe('#ef4444')
  })
})
