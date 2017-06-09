"use strict";

const express = require('express')
  , app = express()
  , server = require('http').Server(app)
  , io = require('socket.io')(server)
  , RGA = require('./lib/rga.js')
  , port = Number(process.env.PORT) || 3001
  , rga = new RGA(0)


app.use(express.static('lib'))
app.use(express.static('node_modules/ace-builds/src-noconflict'))

app.get('/', function (req, res) {
  res.sendFile(__dirname + "/index.html");
})


let nextUserId = 1

io.on('connection', function (socket) {
  var userId = nextUserId++;

  console.log("connection - assigning id " + userId);
  socket.emit("init", {id: userId, history: rga.history()})

  rga.onOp(op => { socket.emit("change", op) })
  socket.on('change', rga.downstream.bind(rga))
})


server.listen(port, function () {
  console.log('listening on *:' + port);
})
