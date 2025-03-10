require('dotenv').config()
const express = require('express')
const app = express()
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')

// Determine if we're in production (Render) or development
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER

// Create appropriate server based on environment
let server;
if (isProduction) {
  // In production (Render), use HTTP server as Render handles SSL
  server = http.createServer(app)
  console.log('Running in production mode with HTTP server (Render handles SSL)')
} else {
  // In development, use HTTPS with local certificates
  try {
    const options = {
      key: fs.readFileSync('ssl/key.pem'),
      cert: fs.readFileSync('ssl/cert.pem')
    }
    server = https.createServer(options, app)
    console.log('Running in development mode with local HTTPS server')
  } catch (err) {
    console.error('Failed to load SSL certificates, falling back to HTTP:', err.message)
    server = http.createServer(app)
  }
}

const io = require('socket.io')(server)
const { v4: uuidV4 } = require('uuid')
const { PeerServer } = require('peer')

// Configure PeerServer based on environment
let peerServer;
if (isProduction) {
  // In production, integrate PeerServer with Express app
  peerServer = PeerServer({
    path: '/peerjs',
    proxied: true,
    port: 443, // This is ignored when using the Express integration
    server: server, // Use the same server instance
    debug: true,
    allow_discovery: true
  });
  console.log('PeerServer integrated with main server in production mode');
} else {
  // In development, use a separate server with HTTPS
  try {
    peerServer = PeerServer({
      port: 3002,
      path: '/',
      proxied: true,
      debug: true,
      allow_discovery: true,
      ssl: {
        key: fs.readFileSync('ssl/key.pem'),
        cert: fs.readFileSync('ssl/cert.pem')
      }
    });
    console.log('PeerServer running in development mode with HTTPS on port 3002');
  } catch (err) {
    console.error('Failed to load SSL certificates for PeerServer:', err.message);
    peerServer = PeerServer({
      port: 3002,
      path: '/',
      proxied: true,
      debug: true,
      allow_discovery: true
    });
    console.log('PeerServer running in development mode on port 3002');
  }
}

peerServer.on('connection', (client) => {
  console.log('PeerJS client connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
  console.log('PeerJS client disconnected:', client.getId());
});

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
      lastSeen: Date.now(),
      connected: true
    }

    // Track user session
    userSessions[userId] = {
      roomId: roomId,
      socketId: socket.id,
      lastSeen: Date.now()
    }

    // Join the socket room
    socket.join(roomId)

    // Notify others that user connected, even on reconnection
    // This ensures peers always try to establish connections
    socket.to(roomId).emit('user-connected', userId)

    // Send updated user list to all clients in the room
    io.to(roomId).emit('user-list-update', rooms[roomId])

    // Log active users in the room
    console.log(`Active users in room ${roomId}:`, Object.keys(rooms[roomId]).length)

    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected from room ${roomId}`)

      // Mark the user as temporarily disconnected but don't remove yet
      if (rooms[roomId] && rooms[roomId][userId]) {
        rooms[roomId][userId].connected = false;
        rooms[roomId][userId].lastSeen = Date.now();

        // Immediately update the user list to show disconnected status
        io.to(roomId).emit('user-list-update', rooms[roomId]);
      }

      if (userSessions[userId]) {
        userSessions[userId].lastSeen = Date.now();
      }

      // Set a longer timeout to check if the user reconnects
      setTimeout(() => {
        // If the user hasn't reconnected within the timeout period
        if (rooms[roomId] && rooms[roomId][userId] &&
            !rooms[roomId][userId].connected &&
            userSessions[userId] &&
            userSessions[userId].lastSeen === rooms[roomId][userId].lastSeen) {

          console.log(`User ${userId} did not reconnect after 10 seconds, removing from room ${roomId}`);

          // Remove user from room
          delete rooms[roomId][userId];

          // Clean up empty rooms
          if (Object.keys(rooms[roomId]).length === 0) {
            delete rooms[roomId];
            console.log(`Room ${roomId} is now empty and has been removed`);
          }

          // Remove user session
          delete userSessions[userId];

          // Notify others that user disconnected
          io.to(roomId).emit('user-disconnected', userId);

          // Send updated user list
          if (rooms[roomId]) {
            io.to(roomId).emit('user-list-update', rooms[roomId]);
          }
        }
      }, 10000); // 10 second timeout to detect if this is a refresh or a true disconnect
    });
  })

  // Handle force reconnect requests
  socket.on('force-reconnect', (roomId, userId) => {
    console.log(`User ${userId} requested force reconnect in room ${roomId}`);

    // Mark the user as connected if they were previously disconnected
    if (rooms[roomId] && rooms[roomId][userId]) {
      rooms[roomId][userId].connected = true;
      rooms[roomId][userId].lastSeen = Date.now();
    }

    // Notify all other users in the room to reconnect to this user
    socket.to(roomId).emit('user-reconnect-request', userId);

    // Send updated user list to all clients in the room
    io.to(roomId).emit('user-list-update', rooms[roomId]);

    // Log reconnection attempt
    console.log(`Force reconnect initiated for user ${userId} in room ${roomId}`);
    console.log(`Current users in room:`, Object.keys(rooms[roomId] || {}).map(id =>
      `${id} (${rooms[roomId][id].connected ? 'connected' : 'disconnected'})`
    ));
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
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  const IP = process.env.RENDER_EXTERNAL_URL || 'localhost'
  console.log(`To connect from another device, use: ${IP}`)
})
