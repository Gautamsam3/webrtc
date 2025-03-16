const express = require('express')
const app = express()
const fs = require('fs')
const http = require('http')
const https = require('https')
require('dotenv').config()

// Environment variables
const PORT = process.env.PORT || 3000
const PEER_PORT = process.env.PEER_PORT || 3002
const NODE_ENV = process.env.NODE_ENV || 'development'
const HOST = process.env.HOST || 'localhost'
const PEER_HOST_URL = process.env.PEER_HOST_URL || 'localhost'

// Determine if we're in production
const isProduction = NODE_ENV === 'production'


// Create appropriate server based on environment
let server

if (isProduction) {
  // In production, we'll let the hosting platform handle SSL
  server = http.createServer(app)
} else {
  // In development, use local SSL certificates
  const options = {
    key: fs.readFileSync('ssl/key.pem'),
    cert: fs.readFileSync('ssl/cert.pem')
  }
  server = https.createServer(options, app)
}
const io = require('socket.io')(server)
const { v4: uuidV4 } = require('uuid')
// PeerJS server is now running separately in peerServer.js
console.log(`Main server running on port ${PORT} with ${isProduction ? 'HTTP' : 'HTTPS'}`)
console.log(`PeerJS server should be running separately on port ${PEER_PORT}`)

app.set('view engine', 'ejs')
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render('index')
})

app.get('/:room', (req, res) => {
  // Validate room name to prevent security issues
  const roomName = req.params.room
  if (!/^[a-zA-Z0-9-_]+$/.test(roomName)) {
    return res.redirect('/')
  }

  // Pass the PEER_HOST_URL environment variable to the template
  res.render('room', { roomId: roomName, peerHost: PEER_HOST_URL })
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} with ${isProduction ? 'HTTP' : 'HTTPS'}`)
  console.log('To connect from another device, use the following URL:')
  console.log(`https://${HOST}:${PORT}`)
})
