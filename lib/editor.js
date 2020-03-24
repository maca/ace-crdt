"use strict";

const editor = ace.edit('editor')
  , socket = io()

let rga


socket.on('init', ({ id, history }) => {
  if (!rga) {
    editor.setWrapBehavioursEnabled(false)
    rga = new RGA.AceEditorRGA(id, editor)

    rga.subscribe(op => { socket.emit('message', op) })

    socket.on('message', op => { rga.receive(op) })

    socket.emit('message', { type: 'historyRequest' })
  }

  editor.focus()
});
