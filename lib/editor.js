"use strict";

const editor = ace.edit('editor')
  , socket = io()

let rga

socket.downstream = socket.emit.bind(socket, "change")

socket.on('init', ({ id, history }) => {
  if (!rga) {
    editor.setWrapBehavioursEnabled(false)
    rga = new RGA.AceEditorRGA(id, editor)

    rga.subscribe(socket)
    socket.on('change', rga.applyOperation.bind(rga))
  }

  rga.applyHistory(history)
  editor.focus()
});

