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


RGA.toArray = function (rga) {
  let ary = []
    , curr = rga.left.next

  while (curr) {
    ary.push(curr)
    curr = curr.next
  }

  return ary
}

RGA.prototype = {
  constructor: RGA

  , subscribe: function (callback) {
    this.subscribers.push(callback)
  }

  , genTimestamp: function () {
    const timestamp = this.nextTimestamp
    this.nextTimestamp += (1 << MAX_REPLICA_ID_BITS)
    return timestamp
  }

  , addRight: function (op) {
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
  }

  , remove: function (op) {
    const node = this.index.get(op.t)

    if (node.removed) { return }

    node.removed = true
    return node
  }

  , apply: function(op) {
    return this[op.type].call(this, op)
  }

  , downstream: function (op, originator) {
    const node = this.apply(op)

    if (node) {
      this.subscribers.forEach(sub => {
        if (sub !== originator) { sub.downstream(op) }
      })
    }

    return node
  }

  , history: function () {
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

      if (curr.removed) {
        hist.push({type: 'remove', t: curr.timestamp})
      }

      prev = curr
      curr = curr.next
    }

    return hist
  }
}


function RArray(rga) {
  this.ary = RGA.toArray(rga)
}

RArray.prototype = {
  text: function() {
    return this.ary.map(({removed, chr}) => {
      if (!removed) return chr
    }).join('')
  }

  , toArray: function() {
    return this.ary.filter(({removed}) => { return !removed })
  }

  , indexOrPrev: function(node) {
    const ary = this.ary
      , compactedAry = this.toArray()

    let idx = ary.indexOf(node)

    while (idx >= 0 && node.removed) {
      idx = idx - 1
      node = ary[idx]
    }

    return compactedAry.indexOf(node)
  }

  , get: function(idx) {
    return this.ary[idx]
  }
}


RGA.AceEditorRGA = function AceEditorRGA(id, editor) {
  let rga = this.rga = new RGA(id)
    , emitContentChanged = true

  editor.$blockScrolling = Infinity

  const {session, selection} = editor
    , Doc = session.doc.constructor


  const contentInserted = (from, change) => {
    const rgaAry = new RArray(rga)
      , ary = rgaAry.toArray()

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
    const rgaAry = new RArray(rga)
      , ary = rgaAry.toArray()

    ary.slice(from, from + change.length).forEach(node => {
      rga.downstream({
        type: 'remove',
        t: node.timestamp
      })
    })
  }


  const contentChanged = ({ action, start, end, lines }) => {
    if (!emitContentChanged) { return }

    const from = session.doc.positionToIndex(start)
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
      , rgaAry = new RArray(rga)
      , doc = new Doc(rgaAry.text())
      , startIndex = doc.positionToIndex(start) - 1
      , startNode = rgaAry.get(startIndex)
      , endIndex = doc.positionToIndex(end) - 1
      , endNode = rgaAry.get(endIndex)

    nodeSelection = { start: startNode, end: endNode }
  }


  this.syncEditor = _ => {
    emitContentChanged = false

    try {
      const rgaAry = new RArray(rga)
        , text = rgaAry.text()
        , doc = new Doc(text)
        , startIndex = rgaAry.indexOrPrev(nodeSelection.start)
        , start = doc.indexToPosition(startIndex + 1)
        , endIndex  = rgaAry.indexOrPrev(nodeSelection.end)
        , end = doc.indexToPosition(endIndex + 1)

      session.doc.setValue(text)
      selection.setSelectionRange({ start: start, end: end })
    } finally {
      emitContentChanged = true
    }
  }

  session.on('change', contentChanged)
  selection.on('changeCursor', cursorChanged)
}


RGA.AceEditorRGA.prototype = {
  constructor: RGA.AceEditorRGA

  , applyOperation: function(op) {
    this.rga.apply(op)
    this.syncEditor()
  }

  , applyHistory: function (history) {
    history.forEach(op => this.rga.apply(op))
    this.syncEditor()
  }

  , subscribe: function(sub) {
    this.rga.subscribe(sub)
  }
}


if (typeof module !== 'undefined') {
  exports = module.exports = RGA
}
