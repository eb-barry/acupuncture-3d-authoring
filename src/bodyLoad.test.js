import { describe, expect, it } from 'vitest'
import { isCurrentBodyLoad, resolveStudioBodyId, shouldLoadBodyModel } from './bodyLoad.js'

describe('resolveStudioBodyId', () => {
  it('falls back to male', () => {
    expect(resolveStudioBodyId('female')).toBe('female')
    expect(resolveStudioBodyId('male')).toBe('male')
    expect(resolveStudioBodyId('unknown')).toBe('male')
  })
})

describe('shouldLoadBodyModel', () => {
  it('retries when the current body never mounted a mesh', () => {
    expect(shouldLoadBodyModel({
      requestedBody: 'male',
      activeBody: 'male',
      meshCount: 0,
    })).toBe(true)
  })

  it('skips re-selecting a body that is already on screen', () => {
    expect(shouldLoadBodyModel({
      requestedBody: 'male',
      activeBody: 'male',
      meshCount: 4,
    })).toBe(false)
  })

  it('loads when switching male ↔ female', () => {
    expect(shouldLoadBodyModel({
      requestedBody: 'female',
      activeBody: 'male',
      meshCount: 4,
    })).toBe(true)
  })

  it('does not stack a second load of the in-flight body', () => {
    expect(shouldLoadBodyModel({
      requestedBody: 'male',
      activeBody: 'male',
      meshCount: 0,
      inFlightBody: 'male',
    })).toBe(false)
  })

  it('supersedes an in-flight load when the other body is chosen', () => {
    expect(shouldLoadBodyModel({
      requestedBody: 'female',
      activeBody: 'male',
      meshCount: 0,
      inFlightBody: 'male',
    })).toBe(true)
  })
})

describe('isCurrentBodyLoad', () => {
  it('rejects superseded generations', () => {
    expect(isCurrentBodyLoad(1, 2, 'female', 'male')).toBe(false)
    expect(isCurrentBodyLoad(2, 2, 'female', 'female')).toBe(true)
    expect(isCurrentBodyLoad(2, 2, 'female', 'male')).toBe(false)
  })
})
