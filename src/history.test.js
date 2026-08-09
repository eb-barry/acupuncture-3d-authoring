import { describe, expect, it } from 'vitest'
import { History } from './history.js'

describe('History', () => {
  it('undoes and redoes immutable snapshots', () => {
    const history = new History({ points: [] })
    const next = { points: [{ id: 1 }] }
    history.commit(next)
    next.points.push({ id: 2 })

    expect(history.undo()).toEqual({ points: [] })
    expect(history.redo()).toEqual({ points: [{ id: 1 }] })
  })

  it('clears redo states after a new change', () => {
    const history = new History({ value: 0 })
    history.commit({ value: 1 })
    history.undo()
    history.commit({ value: 2 })
    expect(history.canRedo).toBe(false)
  })
})
