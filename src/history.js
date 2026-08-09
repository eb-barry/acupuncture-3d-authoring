const clone = (value) => structuredClone(value)

export class History {
  constructor(initialState, limit = 80) {
    this.limit = limit
    this.past = []
    this.present = clone(initialState)
    this.future = []
  }

  commit(nextState) {
    this.past.push(clone(this.present))
    if (this.past.length > this.limit) this.past.shift()
    this.present = clone(nextState)
    this.future = []
    return clone(this.present)
  }

  undo() {
    if (!this.past.length) return null
    this.future.unshift(clone(this.present))
    this.present = this.past.pop()
    return clone(this.present)
  }

  redo() {
    if (!this.future.length) return null
    this.past.push(clone(this.present))
    this.present = this.future.shift()
    return clone(this.present)
  }

  replace(state) {
    this.past = []
    this.future = []
    this.present = clone(state)
  }

  get canUndo() {
    return this.past.length > 0
  }

  get canRedo() {
    return this.future.length > 0
  }
}
