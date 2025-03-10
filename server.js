require('dotenv').config()
const express = require('express')
const app = express()
const fs = require('fs')
const https = require('https')
const path = require('path')

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
  proxied: true, // Ye proxy issue fix karega
  ssl: {
    key: fs.readFileSync('ssl/key.pem'),
    cert: fs.readFileSync('ssl/cert.pem')
  }
})

peerServer.on('connection', (client) => {
  console.log('PeerJS client connected:', client.getId())
})

peerServer.on('disconnect', (client) => {
  console.log('PeerJS client disconnected:', client.getId())
})

console.log('PeerServer running on port 3002 with HTTPS')

app.set('view engine', 'ejs')
app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
  res.render('index')
})

app.get('/:room', (req, res) => {
  // Validate room name to prevent security issues
  const roomName = req.params.room
  if (!/^[a-zA-Z0-9-_]+$/.test(roomName)) {
    return res.redirect('/')
  }

  res.render('room', { roomId: roomName })
})

// Store connected users by room
const rooms = {}
// Store user session information
const userSessions = {}

io.on('connection', socket => {
  let currentRoomId = null
  let currentUserId = null
  let isRefreshing = false

  socket.on('join-room', (roomId, userId, userName = null) => {
    console.log(`User ${userId} joined room ${roomId}`)

    // Store room and user info
    currentRoomId = roomId
    currentUserId = userId

    // Initialize room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {}
    }

    // Check if this is a reconnection (user refreshed the page)
    const isReconnection = rooms[roomId] && rooms[roomId][userId];

    // Add or update user in room
    rooms[roomId][userId] = {
      id: userId,
      name: userName || `User ${userId.substring(0, 8)}...`,
      socketId: socket.id,
      lastSeen: Date.now()
    }

    // Track user session
    userSessions[userId] = {
      roomId: roomId,
      socketId: socket.id,
      lastSeen: Date.now()
    }

    // Join the socket room
    socket.join(roomId)

    // Only notify others if this is not a reconnection (refresh)
    if (!isReconnection) {
      // Notify others that user connected
      socket.to(roomId).emit('user-connected', userId)
    }

    // Send updated user list to all clients in the room
    io.to(roomId).emit('user-list-update', rooms[roomId])

    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected from room ${roomId}`)

      // Mark the user's last seen time
      if (rooms[roomId] && rooms[roomId][userId]) {
        rooms[roomId][userId].lastSeen = Date.now()
      }

      if (userSessions[userId]) {
        userSessions[userId].lastSeen = Date.now()
      }

      // Set a timeout to check if the user reconnects (e.g., refreshed the page)
      setTimeout(() => {
        // If the user hasn't reconnected within the timeout period
        if (userSessions[userId] &&
          userSessions[userId].lastSeen === rooms[roomId]?.[userId]?.lastSeen) {

          console.log(`User ${userId} did not reconnect, removing from room ${roomId}`)

          // Remove user from room
          if (rooms[roomId] && rooms[roomId][userId]) {
            delete rooms[roomId][userId]

            // Clean up empty rooms
            if (Object.keys(rooms[roomId]).length === 0) {
              delete rooms[roomId]
            }
          }

          // Remove user session
          delete userSessions[userId]

          // Notify others that user disconnected
          socket.to(roomId).emit('user-disconnected', userId)

          // Send updated user list
          if (rooms[roomId]) {
            io.to(roomId).emit('user-list-update', rooms[roomId])
          }
        }
      }, 5000) // 5 second timeout to detect if this is a refresh or a true disconnect
    })
  })

  // Handle force reconnect requests
  socket.on('force-reconnect', (roomId, userId) => {
    console.log(`User ${userId} requested force reconnect in room ${roomId}`)
    // Notify all other users in the room to reconnect to this user
    socket.to(roomId).emit('user-reconnect-request', userId)
  })

  // Handle group chat messages
  socket.on('send-message', (messageData) => {
    if (!currentRoomId) return

    console.log(`Group message in room ${currentRoomId} from ${messageData.sender}`)

    // Broadcast to everyone else in the room
    socket.to(currentRoomId).emit('receive-message', messageData)
  })

  // Handle private messages
  socket.on('send-private-message', (messageData) => {
    if (!currentRoomId || !messageData.recipient) return

    console.log(`Private message from ${messageData.sender} to ${messageData.recipient}`)

    // Find the recipient's socket
    const recipientData = rooms[currentRoomId] && rooms[currentRoomId][messageData.recipient]

    if (recipientData) {
      // Send only to the specific recipient
      io.to(recipientData.socketId).emit('receive-private-message', messageData)
    }
  })
})

const PORT = process.env.PORT || 3000 // Dynamic port handling
server.listen(PORT, () => {
  console.log(`HTTPS Server running on port ${PORT}`)
  const IP = process.env.RENDER_EXTERNAL_URL || 'localhost'
  console.log(`To connect from another device, use: ${IP}:${PORT}`)
})
