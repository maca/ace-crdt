"use strict";

const express = require('express')
  , app = express()
  , server = require('http').Server(app)
  , io = require('socket.io')(server)
  , port = Number(process.env.PORT) || 5000


app.use(express.static('lib'))
app.use(express.static('node_modules/ace-builds/src-noconflict'))

app.get('/', function (req, res) {
  res.sendFile(__dirname + "/index.html");
})


let nextUserId = 1


io.on('connection', function (socket) {
  var userId = nextUserId++;

  console.log("connection - assigning id " + userId);
  socket.emit("init", { id: userId })

  socket.on('change', op => { socket.broadcast.emit('change', op) })
})


server.listen(port, function () {
  console.log('listening on *:' + port);
})
