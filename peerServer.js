const fs = require('fs')
const { PeerServer } = require('peer')
require('dotenv').config()

// Environment variables
const PEER_PORT = process.env.PEER_PORT || 3002
const NODE_ENV = process.env.NODE_ENV || 'development'
const HOST = process.env.HOST || 'localhost'

// Determine if we're in production
const isProduction = NODE_ENV === 'production'

// Get TURN server credentials from environment variables
const TURN_SERVER_URL = process.env.TURN_SERVER_URL || 'turn:numb.viagenie.ca'
const TURN_USERNAME = process.env.TURN_USERNAME || 'webrtc@live.com'
const TURN_PASSWORD = process.env.TURN_PASSWORD || 'muazkh'

// Create PeerServer
const peerServer = PeerServer({
  port: PEER_PORT,
  path: '/', // Root path since this is a dedicated server
  host: '0.0.0.0',
  ssl: isProduction ? undefined : {
    key: fs.readFileSync('ssl/key.pem'),
    cert: fs.readFileSync('ssl/cert.pem')
  },
  proxied: isProduction, // Important for Render deployment
  debug: true,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: TURN_SERVER_URL,
        username: TURN_USERNAME,
        credential: TURN_PASSWORD
      }
    ]
  }
})

peerServer.on('connection', (client) => {
  console.log('PeerJS client connected:', client.getId())
})

peerServer.on('disconnect', (client) => {
  console.log('PeerJS client disconnected:', client.getId())
})

console.log(`PeerServer running on port ${PEER_PORT} with ${isProduction ? 'HTTP' : 'HTTPS'}`)
console.log('To connect from another device, use the following URL:')

if (isProduction) {
  console.log(`https://${HOST}:${PEER_PORT}`)
} else {
  // For local development
  console.log(`https://localhost:${PEER_PORT}`)
}
