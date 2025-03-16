const fs = require('fs')
const { PeerServer } = require('peer')
require('dotenv').config()

// Environment variables
const PEER_PORT = process.env.PEER_PORT || 3002
const NODE_ENV = process.env.NODE_ENV || 'development'
const HOST = process.env.HOST || 'localhost'
const PEER_HOST = process.env.PEER_HOST || 'localhost'

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
    // Enhanced ICE servers configuration for better connectivity
    iceServers: [
      // STUN servers - help with NAT traversal
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.ekiga.net' },
      { urls: 'stun:stun.ideasip.com' },
      { urls: 'stun:stun.schlund.de' },
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.voiparound.com' },
      { urls: 'stun:stun.voipbuster.com' },

      // TURN servers - relay traffic when direct connection fails
      {
        urls: TURN_SERVER_URL,
        username: TURN_USERNAME,
        credential: TURN_PASSWORD
      },
      {
        urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
        username: 'webrtc',
        credential: 'webrtc'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    // ICE transport policy - 'relay' forces the use of TURN servers which can help with difficult NAT situations
    // 'all' tries direct connections first, then falls back to relay
    iceTransportPolicy: 'all',
    // Increase ICE candidate pool size for faster connection establishment
    iceCandidatePoolSize: 10
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
