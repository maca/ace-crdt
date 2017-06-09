"use strict";

const editor = ace.edit("editor")
  , socket = io()

let rga

socket.on("init", ({ id, history }) => {
  console.log(id)

  if (!rga) {
    editor.setWrapBehavioursEnabled(false)
    rga = new RGA.AceEditorRGA(id, editor)

    rga.onOp(op => { socket.emit("change", op) })
    socket.on('change', rga.applyOperation.bind(rga))
  }

  rga.applyHistory(history)
  editor.focus()
});

