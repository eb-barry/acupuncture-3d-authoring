import { describe, expect, it } from 'vitest'
import { cloneStudioDocument, isCurrentBodyLoad, resolveStudioBodyId, shouldLoadBodyModel } from './bodyLoad.js'

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

describe('cloneStudioDocument', () => {
  it('clones plain JSON documents', () => {
    const source = { model: { body: 'male' }, meridians: [{ id: 'a' }] }
    const cloned = cloneStudioDocument(source)
    expect(cloned).toEqual(source)
    expect(cloned).not.toBe(source)
    cloned.meridians[0].id = 'b'
    expect(source.meridians[0].id).toBe('a')
  })

  it('falls back to JSON when structuredClone cannot copy the value', () => {
    const source = { name: 'ok', nested: { n: 2 }, fn: () => 1 }
    const cloned = cloneStudioDocument(source)
    expect(cloned.name).toBe('ok')
    expect(cloned.nested.n).toBe(2)
    expect(cloned.fn).toBeUndefined()
  })
})
