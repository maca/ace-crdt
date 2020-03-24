"use strict";

const editor = ace.edit('editor')
  , socket = io()

let rga


socket.downstream = op => { socket.emit("change", op) }


socket.on('init', ({ id, history }) => {
  if (!rga) {
    editor.setWrapBehavioursEnabled(false)
    rga = new RGA.AceEditorRGA(id, editor)

    rga.subscribe(socket)
    socket.on('change', op => { rga.receiveOperation(op) })
  }

  rga.receiveHistory(history)
  editor.focus()
});
