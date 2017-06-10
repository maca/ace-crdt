"use strict";


const MAX_REPLICA_ID_BITS = 16


// An RGA is a replicated string.
function RGA(id) {
  this.id = id
  this.left = { timestamp: -1, removed: false }
  this.index = new Map([[this.left.timestamp, this.left]])
  this.nextTimestamp = id
  this.subscribers = []
}


RGA.prototype = {
  constructor: RGA,

  toArray: function () {
    let ary = []
      , curr = this.left.next

    while (curr) {
      if (!curr.removed) { ary.push(curr) }
      curr = curr.next
    }

    return ary
  },

  text: function () {
    return this.toArray()
      .map(op => { return op.chr })
      .join('')
  },

  onOp: function (callback) {
    this.subscribers.push(callback)
  },

  genTimestamp: function () {
    const timestamp = this.nextTimestamp
    this.nextTimestamp += (1 << MAX_REPLICA_ID_BITS)
    return timestamp
  },

  addRight: function (op) {
    const existingNode = this.index.get(op.t)
    let prev = this.index.get(op.prev)
      , newNode

    if (existingNode) { return }

    while (op.t >= this.nextTimestamp) { this.genTimestamp() }

    while (prev.next && op.t < prev.next.timestamp) { prev = prev.next }

    newNode = {
      next: prev.next,
      timestamp: op.t,
      chr: op.chr,
      removed: false
    }

    prev.next = newNode
    this.index.set(op.t, newNode)

    return newNode
  },

  remove: function (op) {
    const node = this.index.get(op.t)

    if (node.removed) { return }

    node.removed = true
    return node
  },

  apply: function(op) {
    return this[op.type].call(this, op)
  },

  downstream: function (op) {
    const node = this.apply(op)
    if (node) { this.subscribers.forEach(cb => { cb(op) }) }
    return node
  },

  history: function () {
    let hist = []
      , prev = this.left
      , curr = prev.next

    while (curr) {
      hist.push({
        type: 'addRight',
        prev: prev.timestamp,
        t: curr.timestamp,
        chr: curr.chr
      });

      if (curr.removed)
        hist.push({type: 'remove', t: curr.timestamp})
      prev = curr
      curr = curr.next
    }

    return hist
  }
}


RGA.AceEditorRGA = function AceEditorRGA(id, editor) {
  let rga = this.rga = new RGA(id)
    , emitContentChanged = true

  editor.$blockScrolling = Infinity


  const {session, selection} = editor
    , indexToPosition = (doc, idx) => doc.indexToPosition(idx)
    , positionToIndex = (doc, pos) => doc.positionToIndex(pos)
    , Doc = session.doc.constructor


  const contentInserted = (from, change) => {
    const ary = rga.toArray()

    let node = ary[from - 1] || rga.left

    change.forEach(chr => {
      node = rga.downstream({
        type: 'addRight',
        prev: node.timestamp,
        t: rga.genTimestamp(),
        chr: chr
      })
    })
  }


  const contentRemoved = (from, change) => {
    const ary = rga.toArray()

    ary.slice(from, from + change.length).forEach(node => {
      rga.downstream({
        type: 'remove',
        t: node.timestamp
      })
    })
  }


  const contentChanged = ({ action, start, end, lines }) => {
    if (!emitContentChanged) { return }

    const from = positionToIndex(session.doc, start)
      , change = lines.join("\n").split('')

    if (action === 'insert') {
      contentInserted(from, change)
    } else if (action === 'remove') {
      contentRemoved(from, change)
    }
  }


  let nodeSelection = { start: rga.left, end: rga.left }
  const cursorChanged = (ev) => {
    if (!emitContentChanged) { return }

    const { start, end } = selection.getRange()
      , ary = rga.toArray()
      , text = ary.map(op => { return op.chr }).join('')
      , doc = new Doc(text)
      , startNode = ary[ positionToIndex(doc, start) - 1 ]
      , endNode = ary[ positionToIndex(doc, end) - 1 ]

    nodeSelection = { start: startNode, end: endNode }
  }


  this.syncEditor = _ => {
    emitContentChanged = false

    try {
      const ary = rga.toArray()
        , text = ary.map(op => { return op.chr }).join('')

      session.doc.setValue(text)

      const doc = new Doc(text)
        , range = {
          start: indexToPosition(doc, ary.indexOf(nodeSelection.start) + 1),
          end: indexToPosition(doc, ary.indexOf(nodeSelection.end) + 1)
        }

      selection.setSelectionRange(range)
    } finally {
      emitContentChanged = true
    }
  }

  session.on('change', contentChanged)
  selection.on('changeCursor', cursorChanged)
}


RGA.AceEditorRGA.prototype = {
  constructor: RGA.AceEditorRGA,

  applyOperation: function(op) {
    this.rga.apply(op)
    this.syncEditor()
  },

  applyHistory: function (history) {
    history.forEach(op => this.rga.apply(op))
    this.syncEditor()
  },

  onOp: function(cb) {
    this.rga.onOp(cb)
  },
}


if (typeof module !== 'undefined')
  exports = module.exports = RGA;
