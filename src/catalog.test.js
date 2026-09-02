import { describe, expect, it } from 'vitest'
import {
  MERIDIANS,
  POINTS,
  POINT_BY_CODE,
  isKiYinguChangqiangPair,
  isGbChenglingNaokongPair,
  isOmittedSurfaceSpan,
  isRenDuCodePair,
  meridianLineColor,
  acupointMarkerColor,
  YANG_ACUPOINT_COLOR,
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

  it('omits the classical ST8–ST9 surface pathway in both directions', () => {
    const stomach = pointsForMeridian('ST')
    const st8 = stomach.findIndex((point) => point.code === 'ST8')
    expect(POINT_BY_CODE.get('ST8').name).toBe('頭維')
    expect(POINT_BY_CODE.get('ST9').name).toBe('人迎')
    expect(stomach[st8 + 1].code).toBe('ST9')
    expect(isOmittedSurfaceSpan('ST8', 'ST9')).toBe(true)
    expect(isOmittedSurfaceSpan('ST9', 'ST8')).toBe(true)
    expect(isOmittedSurfaceSpan('ST7', 'ST8')).toBe(false)
    expect(isOmittedSurfaceSpan('ST9', 'ST10')).toBe(false)
    expect(isOmittedSurfaceSpan('', 'ST9')).toBe(false)
    expect(isOmittedSurfaceSpan('ST8', 'BL41')).toBe(false)
  })

  it('omits 陰谷–橫骨 and treats 陰谷–長強 as the kidney exception', () => {
    const kidney = pointsForMeridian('KI')
    const ki10 = kidney.findIndex((point) => point.code === 'KI10')
    expect(POINT_BY_CODE.get('KI10').name).toBe('陰谷')
    expect(POINT_BY_CODE.get('KI11').name).toBe('橫骨')
    expect(POINT_BY_CODE.get('GV1').name).toBe('長強')
    expect(kidney[ki10 + 1].code).toBe('KI11')
    expect(isOmittedSurfaceSpan('KI10', 'KI11')).toBe(true)
    expect(isOmittedSurfaceSpan('KI11', 'KI10')).toBe(true)
    expect(isOmittedSurfaceSpan('KI9', 'KI10')).toBe(false)
    expect(isOmittedSurfaceSpan('KI11', 'KI12')).toBe(false)
    expect(isKiYinguChangqiangPair('KI10', 'GV1')).toBe(true)
    expect(isKiYinguChangqiangPair('GV1', 'KI10')).toBe(true)
    expect(isKiYinguChangqiangPair('KI10', 'KI11')).toBe(false)
    expect(isKiYinguChangqiangPair('KI11', 'GV1')).toBe(false)
  })

  it('treats 承靈–腦空 as the gallbladder occiput scalp pair', () => {
    expect(POINT_BY_CODE.get('GB18').name).toBe('承靈')
    expect(POINT_BY_CODE.get('GB19').name).toBe('腦空')
    expect(isGbChenglingNaokongPair('GB18', 'GB19')).toBe(true)
    expect(isGbChenglingNaokongPair('GB19', 'GB18')).toBe(true)
    expect(isGbChenglingNaokongPair('GB17', 'GB18')).toBe(false)
    expect(isGbChenglingNaokongPair('GB19', 'GB20')).toBe(false)
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
    expect(acupointMarkerColor('LI')).toBe(YANG_ACUPOINT_COLOR)
    expect(acupointMarkerColor('ST')).toBe('#111111')
    expect(acupointMarkerColor('TE', '#ef4444')).toBe('#111111')
    expect(acupointMarkerColor('LU')).toBe('#ef4444')
    expect(acupointMarkerColor('LU', '#22c55e')).toBe('#22c55e')
    expect(acupointMarkerColor('CV', '#3b82f6')).toBe('#3b82f6')
    expect(acupointMarkerColor('GV')).toBe('#ef4444')
  })
})
