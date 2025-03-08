const express = require('express')
const app = express()
const fs = require('fs')
const https = require('https')

// SSL certificates for HTTPS
const options = {
  key: fs.readFileSync('ssl/key.pem'),
  cert: fs.readFileSync('ssl/cert.pem')
}

// Create HTTPS server
const server = https.createServer(options, app)
const io = require('socket.io')(server)
const { v4: uuidV4 } = require('uuid')
const { PeerServer } = require('peer')

// Create a separate PeerServer with better error handling and HTTPS
const peerServer = PeerServer({
  port: 3002,
  path: '/',
  host: '0.0.0.0',
  ssl: {
    key: fs.readFileSync('ssl/key.pem'),
    cert: fs.readFileSync('ssl/cert.pem')
  },
  debug: true
})

peerServer.on('connection', (client) => {
  console.log('PeerJS client connected:', client.getId())
})

peerServer.on('disconnect', (client) => {
  console.log('PeerJS client disconnected:', client.getId())
})

console.log('PeerServer running on port 3002 with HTTPS')

app.set('view engine', 'ejs')
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.redirect(`/${uuidV4()}`)
})

app.get('/:room', (req, res) => {
  res.render('room', { roomId: req.params.room })
})

io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    console.log(`User ${userId} joined room ${roomId}`)
    socket.join(roomId)
    socket.to(roomId).emit('user-connected', userId)

    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected from room ${roomId}`)
      socket.to(roomId).emit('user-disconnected', userId)
    })
  })

  // Handle force reconnect requests
  socket.on('force-reconnect', (roomId, userId) => {
    console.log(`User ${userId} requested force reconnect in room ${roomId}`)
    // Notify all other users in the room to reconnect to this user
    socket.to(roomId).emit('user-reconnect-request', userId)
  })
})

server.listen(3000, '0.0.0.0', () => {
  console.log('HTTPS Server running on port 3000')
  console.log('To connect from another device, use the following URL:')
  console.log('https://192.168.165.151:3000')
})
