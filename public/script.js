// Configure Socket.io with options for lower latency
const socket = io('/', {
  transports: ['websocket'], // Use WebSocket only, skip long-polling
  upgrade: false, // Disable transport upgrades
  reconnectionDelay: 1000, // Faster reconnection
  timeout: 10000 // Shorter timeout
})
const videoGrid = document.getElementById('video-grid')
const statusMessage = document.getElementById('status-message')
const videoToggleBtn = document.getElementById('video-toggle')
const audioToggleBtn = document.getElementById('audio-toggle')
const screenShareBtn = document.getElementById('screen-share')
const reconnectBtn = document.getElementById('reconnect-btn')
const disconnectBtn = document.getElementById('disconnect-btn')

// Chat elements
const chatToggle = document.getElementById('chat-toggle')
const chatPanel = document.getElementById('chat-panel')
const closeChat = document.getElementById('close-chat')
const groupTab = document.getElementById('group-tab')
const privateTab = document.getElementById('private-tab')
const recipientSelector = document.getElementById('recipient-selector')
const recipientSelect = document.getElementById('recipient-select')
const chatMessages = document.getElementById('chat-messages')
const chatInput = document.getElementById('chat-input')
const sendMessageBtn = document.getElementById('send-message')

// Check if we have a stored peer ID from a previous session
const storedPeerId = sessionStorage.getItem('myPeerId')

// Get environment configuration
const isSecure = window.location.protocol === 'https:';
const isLocalhost = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';

// Create Peer connection with appropriate configuration
const myPeer = new Peer(storedPeerId, {
  host: window.location.hostname,
  port: isLocalhost ? '3002' : '443', // Use 443 in production
  path: '/peerjs', // Use the path we configured on the server
  secure: isSecure,
  debug: 3,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      // Add TURN servers for better connectivity across networks
      {
        urls: 'turn:numb.viagenie.ca',
        credential: 'muazkh',
        username: 'webrtc@live.com'
      },
      {
        urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
        credential: 'webrtc',
        username: 'webrtc'
      }
    ],
    iceTransportPolicy: 'all',
    sdpSemantics: 'unified-plan',
    // Optimize for lower latency
    iceCandidatePoolSize: 10, // Increase candidate gathering speed
    bundlePolicy: 'max-bundle', // Bundle all media tracks
    rtcpMuxPolicy: 'require' // Require RTCP multiplexing
  }
})

// Configure WebRTC peer connection options for lower latency
myPeer.on('call', call => {
  // Access the underlying RTCPeerConnection to set additional options
  if (call.peerConnection) {
    // Set high priority for audio
    call.peerConnection.getSenders().forEach(sender => {
      if (sender.track && sender.track.kind === 'audio') {
        const params = sender.getParameters();
        if (!params.priority && params.encodings) {
          params.encodings.forEach(encoding => {
            encoding.priority = 'high';
            encoding.networkPriority = 'high';
          });
          sender.setParameters(params).catch(e => console.error('Error setting priority:', e));
        }
      }
    });
  }
});

// Chat state
let currentChatMode = 'group'
let selectedRecipient = null
let userList = {}
// Create local video element
const myVideo = document.createElement('video')
myVideo.classList.add('local-video')
myVideo.muted = true
const peers = {}
let myStream = null
let screenStream = null
let isVideoEnabled = true
let isAudioEnabled = true
let isScreenSharing = false
let myPeerId = null
let myName = 'You'
let isRefreshing = false

// Network quality monitoring
let networkQuality = 'medium' // 'low', 'medium', 'high'
let lastBitrateCheck = Date.now()
let bitrateCheckInterval = null
let lastBytes = 0

// Update status message
function updateStatus(message, isError = false) {
  statusMessage.textContent = message
  statusMessage.style.backgroundColor = isError ? 'rgba(244, 67, 54, 0.2)' : 'rgba(33, 150, 243, 0.2)'
  statusMessage.style.borderLeft = `6px solid ${isError ? '#f44336' : '#2196F3'}`
}

// Function to update the video grid layout based on the number of users
function updateVideoGridLayout() {
  const remoteUsers = Object.keys(userList).filter(id => id !== myPeerId)

  if (remoteUsers.length === 1) {
    // If there's only one remote user, apply the single-user class
    videoGrid.classList.add('single-user')
  } else {
    // If there are multiple remote users, use the grid layout
    videoGrid.classList.remove('single-user')
  }
}

// Add error handling for PeerJS
myPeer.on('error', (err) => {
  console.error('PeerJS error:', err)
  updateStatus(`PeerJS error: ${err.type}`, true)
})

// Setup control buttons
videoToggleBtn.addEventListener('click', toggleVideo)
audioToggleBtn.addEventListener('click', toggleAudio)
screenShareBtn.addEventListener('click', toggleScreenShare)
reconnectBtn.addEventListener('click', forceReconnect)
disconnectBtn.addEventListener('click', disconnect)

// Setup chat UI
chatToggle.addEventListener('click', () => {
  chatPanel.classList.add('open')
})

closeChat.addEventListener('click', () => {
  chatPanel.classList.remove('open')
})

groupTab.addEventListener('click', () => {
  setActiveChatTab('group')
})

privateTab.addEventListener('click', () => {
  setActiveChatTab('private')
})

sendMessageBtn.addEventListener('click', sendMessage)
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage()
  }
})

function setActiveChatTab(mode) {
  currentChatMode = mode

  if (mode === 'group') {
    groupTab.classList.add('active')
    privateTab.classList.remove('active')
    recipientSelector.classList.remove('visible')
    selectedRecipient = null
  } else {
    privateTab.classList.add('active')
    groupTab.classList.remove('active')
    recipientSelector.classList.add('visible')
  }

  // Clear chat display when switching modes
  chatMessages.innerHTML = ''
}

function updateUserList() {
  // Clear existing options except the default one
  while (recipientSelect.options.length > 1) {
    recipientSelect.remove(1)
  }

  // Add all connected users except ourselves
  Object.keys(userList).forEach(userId => {
    if (userId !== myPeerId) {
      const option = document.createElement('option')
      option.value = userId
      option.textContent = userList[userId].name || `User ${userId.substring(0, 8)}...`
      recipientSelect.appendChild(option)
    }
  })

  // Reset selection when user list changes
  recipientSelect.value = ''
  selectedRecipient = null
}

recipientSelect.addEventListener('change', () => {
  selectedRecipient = recipientSelect.value
  chatMessages.innerHTML = '' // Clear messages when changing recipient
})

function sendMessage() {
  const message = chatInput.value.trim()
  if (!message) return

  const now = new Date()
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (currentChatMode === 'group') {
    // Send to everyone
    socket.emit('send-message', {
      sender: myPeerId,
      name: myName,
      message,
      time,
      isPrivate: false
    })

    // Add to our own chat
    addMessageToChat({
      sender: myPeerId,
      name: myName,
      message,
      time,
      isPrivate: false,
      isSelf: true
    })
  } else if (selectedRecipient) {
    // Send private message
    socket.emit('send-private-message', {
      sender: myPeerId,
      name: myName,
      recipient: selectedRecipient,
      message,
      time,
      isPrivate: true
    })

    // Add to our own chat
    addMessageToChat({
      sender: myPeerId,
      name: myName,
      message: `(Private) ${message}`,
      time,
      isPrivate: true,
      isSelf: true
    })
  }

  chatInput.value = ''
}

function addMessageToChat(messageData) {
  const { sender, name, message, time, isPrivate, isSelf } = messageData

  const messageElement = document.createElement('div')
  messageElement.classList.add('message')
  messageElement.classList.add(isSelf ? 'sent' : 'received')

  let senderName = isSelf ? 'You' : (name || `User ${sender.substring(0, 8)}...`)

  messageElement.innerHTML = `
    <div class="sender">${senderName}</div>
    <div class="content">${message}</div>
    <div class="time">${time}</div>
  `

  chatMessages.appendChild(messageElement)
  chatMessages.scrollTop = chatMessages.scrollHeight
}

function toggleVideo() {
  if (!myStream) return

  const videoTrack = myStream.getVideoTracks()[0]
  if (videoTrack) {
    isVideoEnabled = !isVideoEnabled
    videoTrack.enabled = isVideoEnabled
    videoToggleBtn.classList.toggle('off', !isVideoEnabled)
  }
}

async function toggleScreenShare() {
  if (isScreenSharing) {
    // Stop screen sharing and revert to camera
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop())
      screenStream = null
    }

    // Restore camera stream
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = isVideoEnabled
      }

      // Replace the screen share with camera in all peer connections
      Object.values(peers).forEach(call => {
        const sender = call.peerConnection.getSenders().find(s =>
          s.track && s.track.kind === 'video'
        )
        if (sender && myStream.getVideoTracks()[0]) {
          sender.replaceTrack(myStream.getVideoTracks()[0])
        }
      })

      // Update local video
      const localContainer = document.getElementById('container-local')
      if (localContainer) {
        const localVideo = localContainer.querySelector('video')
        if (localVideo) {
          localVideo.srcObject = myStream
        }
      }
    }

    isScreenSharing = false
    screenShareBtn.classList.remove('off')
    updateStatus('Camera video restored')
  } else {
    try {
      // Start screen sharing
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      })

      // Replace video track with screen share in all peer connections
      Object.values(peers).forEach(call => {
        const sender = call.peerConnection.getSenders().find(s =>
          s.track && s.track.kind === 'video'
        )
        if (sender && screenStream.getVideoTracks()[0]) {
          sender.replaceTrack(screenStream.getVideoTracks()[0])
        }
      })

      // Update local video
      const localContainer = document.getElementById('container-local')
      if (localContainer) {
        const localVideo = localContainer.querySelector('video')
        if (localVideo) {
          localVideo.srcObject = new MediaStream([
            screenStream.getVideoTracks()[0],
            myStream.getAudioTracks()[0]
          ])
        }
      }

      // Handle the case when user stops sharing via the browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        toggleScreenShare()
      }

      isScreenSharing = true
      screenShareBtn.classList.add('off')
      updateStatus('Screen sharing active')
    } catch (err) {
      console.error('Error sharing screen:', err)
      updateStatus('Failed to share screen: ' + err.message, true)
    }
  }
}

function toggleAudio() {
  if (!myStream) return

  const audioTrack = myStream.getAudioTracks()[0]
  if (audioTrack) {
    isAudioEnabled = !isAudioEnabled
    audioTrack.enabled = isAudioEnabled
    audioToggleBtn.classList.toggle('off', !isAudioEnabled)
  }
}

// Disconnect from the call and return to home page
function disconnect() {
  updateStatus('Disconnecting from the room...')

  // Stop network monitoring
  if (bitrateCheckInterval) {
    clearInterval(bitrateCheckInterval)
    bitrateCheckInterval = null
  }

  // Close all peer connections
  Object.keys(peers).forEach(userId => {
    if (peers[userId]) {
      console.log('Closing connection to:', userId)
      peers[userId].close()
      delete peers[userId]
    }
  })

  // Stop all tracks in the local stream
  if (myStream) {
    myStream.getTracks().forEach(track => {
      track.stop()
    })
    myStream = null
  }

  // Clear the stored peer ID when intentionally disconnecting
  sessionStorage.removeItem('myPeerId')

  // Disconnect from the socket
  socket.disconnect()

  // Notify the user
  updateStatus('Disconnected from the room')

  // Redirect to home page after a short delay
  setTimeout(() => {
    window.location.href = '/'
  }, 1500)
}

// Force reconnection to all peers
function forceReconnect() {
  updateStatus('Forcing reconnection to all peers...')

  // Stop network monitoring during reconnection
  if (bitrateCheckInterval) {
    clearInterval(bitrateCheckInterval)
    bitrateCheckInterval = null
  }

  // First, remove all video containers except local
  const containers = document.querySelectorAll('.video-container:not(.local)')
  containers.forEach(container => {
    container.remove()
  })

  // Close all existing peer connections
  Object.keys(peers).forEach(userId => {
    if (peers[userId]) {
      console.log('Closing connection to:', userId)
      peers[userId].close()
      delete peers[userId]
    }
  })

  // Clear any connecting placeholders that might be left
  const connectingContainers = document.querySelectorAll('.connecting')
  connectingContainers.forEach(container => {
    container.remove()
  })

  // Clear the peers object completely to ensure no stale connections
  Object.keys(peers).forEach(key => delete peers[key])

  // Emit a special message to the server to request reconnection
  socket.emit('force-reconnect', ROOM_ID, myPeerId)

  // Rejoin the room
  socket.emit('join-room', ROOM_ID, myPeerId)

  updateStatus('Reconnection initiated. Waiting for peers...')
}

// Toggle fullscreen for a video container
function toggleFullscreen(container) {
  // Exit any existing fullscreen first
  const currentFullscreen = document.querySelector('.fullscreen')
  if (currentFullscreen && currentFullscreen !== container) {
    currentFullscreen.classList.remove('fullscreen')
  }

  // Toggle fullscreen for this container
  container.classList.toggle('fullscreen')
}

// Create exit fullscreen button
function createExitButton(container) {
  const exitButton = document.createElement('button')
  exitButton.classList.add('exit-fullscreen')
  exitButton.innerHTML = '×'
  exitButton.addEventListener('click', (e) => {
    e.stopPropagation()
    container.classList.remove('fullscreen')
  })
  return exitButton
}

// Network quality detection and adaptive quality
function startNetworkMonitoring() {
  if (bitrateCheckInterval) {
    clearInterval(bitrateCheckInterval)
  }

  bitrateCheckInterval = setInterval(async () => {
    // Only check if we have active peer connections
    const activePeers = Object.values(peers).filter(peer =>
      peer && peer.peerConnection && peer.peerConnection.connectionState === 'connected'
    )

    if (activePeers.length === 0) return

    // Use the first active peer connection for stats
    const pc = activePeers[0].peerConnection

    try {
      const stats = await pc.getStats()
      let totalBitrate = 0
      let totalPacketsLost = 0
      let totalPackets = 0

      stats.forEach(report => {
        if (report.type === 'outbound-rtp' && report.bytesSent) {
          const now = Date.now()
          const bytes = report.bytesSent
          const timeDiff = now - lastBitrateCheck

          if (lastBytes > 0 && timeDiff > 0) {
            // Calculate bitrate in kbps
            const bitrate = 8 * (bytes - lastBytes) / timeDiff
            totalBitrate += bitrate
          }

          lastBytes = bytes
          lastBitrateCheck = now
        }

        if (report.type === 'outbound-rtp' && report.packetsLost) {
          totalPacketsLost += report.packetsLost
          totalPackets += report.packetsSent
        }
      })

      // Calculate packet loss rate
      const packetLossRate = totalPackets > 0 ? (totalPacketsLost / totalPackets) : 0

      // Determine network quality based on bitrate and packet loss
      let newQuality = 'medium' // Default

      if (totalBitrate > 1500 && packetLossRate < 0.01) {
        newQuality = 'high'
      } else if (totalBitrate < 500 || packetLossRate > 0.05) {
        newQuality = 'low'
      }

      // Only update if quality changed
      if (newQuality !== networkQuality) {
        networkQuality = newQuality
        console.log(`Network quality changed to: ${networkQuality}`)
        updateStatus(`Network quality: ${networkQuality.toUpperCase()}`)

        // Adjust video quality based on network conditions
        adjustVideoQuality(networkQuality)
      }
    } catch (e) {
      console.error('Error getting connection stats:', e)
    }
  }, 3000) // Check every 3 seconds
}

// Adjust video quality based on network conditions
async function adjustVideoQuality(quality) {
  if (!myStream) return

  const videoTrack = myStream.getVideoTracks()[0]
  if (!videoTrack) return

  try {
    const constraints = {}

    switch (quality) {
      case 'high':
        constraints.width = { ideal: 1280 }
        constraints.height = { ideal: 720 }
        constraints.frameRate = { ideal: 30, max: 30 }
        break
      case 'medium':
        constraints.width = { ideal: 640 }
        constraints.height = { ideal: 480 }
        constraints.frameRate = { ideal: 24, max: 30 }
        break
      case 'low':
        constraints.width = { ideal: 320 }
        constraints.height = { ideal: 240 }
        constraints.frameRate = { ideal: 15, max: 20 }
        break
    }

    // Apply constraints to the video track
    await videoTrack.applyConstraints(constraints)

    // Update video bitrates in all peer connections
    Object.values(peers).forEach(call => {
      if (call.peerConnection) {
        const sender = call.peerConnection.getSenders().find(s =>
          s.track && s.track.kind === 'video'
        )

        if (sender) {
          const params = sender.getParameters()
          if (!params.encodings) {
            params.encodings = [{}]
          }

          // Set bitrates based on quality
          switch (quality) {
            case 'high':
              params.encodings[0].maxBitrate = 2500000 // 2.5 Mbps
              break
            case 'medium':
              params.encodings[0].maxBitrate = 1000000 // 1 Mbps
              break
            case 'low':
              params.encodings[0].maxBitrate = 500000 // 500 Kbps
              break
          }

          sender.setParameters(params).catch(e =>
            console.error('Error setting video parameters:', e)
          )
        }
      }
    })

    console.log(`Video quality adjusted to ${quality}:`, constraints)
  } catch (e) {
    console.error('Error adjusting video quality:', e)
  }
}

// Check if getUserMedia is supported
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  console.log('getUserMedia is supported')
  updateStatus('Accessing camera and microphone...')

  // Get initial video constraints based on estimated network quality
  const getInitialVideoConstraints = () => {
    // Start with medium quality by default
    return {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 24, max: 30 }
    }
  }

  // Try to access camera with error handling and optimized for low latency
  navigator.mediaDevices.getUserMedia({
    video: getInitialVideoConstraints(),
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  }).then(stream => {
    console.log('Camera access successful')
    console.log('Stream tracks:', stream.getTracks().map(track => `${track.kind}: ${track.label} (${track.readyState})`))

    myStream = stream
    addVideoStream(myVideo, stream)
    updateStatus('Connected to room. Waiting for others to join...')

    myPeer.on('call', call => {
      const peerId = call.peer
      console.log('Received call from:', peerId)
      updateStatus('Someone is connecting...')

      // Answer the call with our stream
      call.answer(stream)

      // Create a video element for the remote stream
      const video = document.createElement('video')
      video.id = `remote-video`

      // Handle the incoming stream
      call.on('stream', userVideoStream => {
        console.log('Received stream from call:', peerId)
        console.log('Stream tracks:', userVideoStream.getTracks().map(track => `${track.kind}: ${track.label} (${track.readyState})`))

        addVideoStream(video, userVideoStream, peerId)
        updateStatus('Connected with another user')
      })

      // Handle errors
      call.on('error', err => {
        console.error('Call error:', err)
        updateStatus(`Error in call: ${err.message}`, true)
      })

      // Store the call in peers
      peers[peerId] = call
    })

    socket.on('user-connected', userId => {
      console.log('User connected:', userId)
      updateStatus('New user joined the room')
      // Connect immediately to reduce latency
      connectToNewUser(userId, stream)

      // Set a timeout to automatically reconnect after 3 seconds when a new user joins
      setTimeout(() => {
        console.log('Auto-reconnecting after new user joined')
        forceReconnect()
      }, 3000)
    })

    // Handle reconnection requests
    socket.on('user-reconnect-request', userId => {
      console.log('Received reconnect request from user:', userId)
      updateStatus('Reconnecting to user...')

      // Close existing connection if any
      if (peers[userId]) {
        console.log('Closing existing connection to:', userId)
        peers[userId].close()
        delete peers[userId]
      }

      // Reconnect to the user immediately to reduce latency
      connectToNewUser(userId, stream)
    })
  }).catch(err => {
    console.error('Failed to get camera access:', err)
    updateStatus(`Camera access failed: ${err.message}`, true)

    // Try with just audio as fallback
    console.log('Trying with audio only as fallback')
    updateStatus('Trying audio only as fallback...')
    return navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true
    }).then(audioStream => {
      console.log('Audio-only access successful')
      myStream = audioStream
      addVideoStream(myVideo, audioStream)
      updateStatus('Connected with audio only (no video)')

      myPeer.on('call', call => {
        call.answer(audioStream)
        const video = document.createElement('video')
        video.id = `video-${call.peer}`
        call.on('stream', userVideoStream => {
          addVideoStream(video, userVideoStream, call.peer)
        })
      })

      socket.on('user-connected', userId => {
        connectToNewUser(userId, audioStream)
      })
    }).catch(audioErr => {
      updateStatus(`Both camera and microphone access failed. Please check your permissions.`, true)
    })
  })
} else {
  console.error('getUserMedia is not supported in this browser')
  updateStatus('Your browser does not support camera access. Please try a different browser.', true)
}

socket.on('user-disconnected', userId => {
  if (peers[userId]) {
    peers[userId].close()
    updateStatus('A user has disconnected')

    // Remove the video container for this user
    const container = document.getElementById(`container-${userId}`)
    if (container) {
      container.remove()
    }

    // Remove from user list
    if (userList[userId]) {
      delete userList[userId]
      updateUserList()

      // Update the video grid layout after a user disconnects
      updateVideoGridLayout()
    }
  }
})

// Chat message handlers
socket.on('receive-message', messageData => {
  if (currentChatMode === 'group' && !messageData.isPrivate) {
    addMessageToChat({
      ...messageData,
      isSelf: messageData.sender === myPeerId
    })
  }
})

socket.on('receive-private-message', messageData => {
  if (currentChatMode === 'private' &&
      (messageData.sender === selectedRecipient ||
       (messageData.sender !== myPeerId && messageData.recipient === myPeerId))) {

    // If this is a new conversation, switch to that user
    if (messageData.sender !== myPeerId && messageData.sender !== selectedRecipient) {
      selectedRecipient = messageData.sender
      recipientSelect.value = selectedRecipient
      chatMessages.innerHTML = ''
    }

    addMessageToChat({
      ...messageData,
      isSelf: messageData.sender === myPeerId
    })
  }

  // If chat is not open, show a notification
  if (!chatPanel.classList.contains('open')) {
    chatToggle.classList.add('notification')
  }
})

socket.on('user-list-update', users => {
  userList = users
  updateUserList()

  // Update the video grid layout based on the number of users
  updateVideoGridLayout()
})

myPeer.on('open', id => {
  console.log('My peer ID is:', id)
  myPeerId = id

  // Store the peer ID for session persistence
  sessionStorage.setItem('myPeerId', id)

  updateStatus('Connected to signaling server')
  socket.emit('join-room', ROOM_ID, id, myName)
})

// Handle page refresh/unload
window.addEventListener('beforeunload', () => {
  isRefreshing = true
  // We don't remove the peer ID from sessionStorage here
  // so it can be reused when the page refreshes
})

function connectToNewUser(userId, stream) {
  console.log('Connecting to new user:', userId)

  // Check if we're already connected to this user
  if (peers[userId]) {
    console.log('Already connected to this user, closing previous connection')
    peers[userId].close()
  }

  // Create video element in advance to reduce rendering delay
  const video = document.createElement('video')
  video.id = `video-${userId}`

  // Optimize video element for lower latency
  video.playsInline = true
  video.autoplay = true
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')

  // Create a placeholder container while connection is being established
  const container = document.createElement('div')
  container.classList.add('video-container')
  container.id = `container-${userId}`
  container.classList.add('connecting')

  // Add user name label
  const userLabel = document.createElement('div')
  userLabel.classList.add('user-name')
  userLabel.textContent = `Connecting to ${userId.substring(0, 8)}...`
  container.appendChild(userLabel)

  // Add the container to the grid immediately to show connection is in progress
  videoGrid.appendChild(container)

  // Make the call with optimized options
  const call = myPeer.call(userId, stream)

  // Set up event handlers
  call.on('stream', userVideoStream => {
    console.log('Received stream from user:', userId)
    console.log('Stream tracks:', userVideoStream.getTracks().map(track => `${track.kind}: ${track.label} (${track.readyState})`))

    // Remove the placeholder container
    container.remove()

    // Add the actual video stream
    addVideoStream(video, userVideoStream, userId)
    updateStatus(`Connected with user: ${userId.substring(0, 8)}...`)

    // Optimize the peer connection if possible
    if (call.peerConnection) {
      // Set high priority for audio
      call.peerConnection.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'audio') {
          const params = sender.getParameters();
          if (params.encodings) {
            params.encodings.forEach(encoding => {
              encoding.priority = 'high';
              encoding.networkPriority = 'high';
            });
            sender.setParameters(params).catch(e => console.error('Error setting priority:', e));
          }
        }
      });

      // Start network quality monitoring when we have an active connection
      startNetworkMonitoring();
    }
  })

  call.on('error', err => {
    console.error('Call error:', err)
    updateStatus(`Error connecting to user: ${err.message}`, true)

    // Remove the placeholder on error
    const placeholderContainer = document.getElementById(`container-${userId}`)
    if (placeholderContainer) {
      placeholderContainer.remove()
    }
  })

  call.on('close', () => {
    console.log('Call closed for user:', userId)
    const container = document.getElementById(`container-${userId}`)
    if (container) {
      container.remove()
    }
  })

  peers[userId] = call
}

function addVideoStream(video, stream, userId = 'local') {
  console.log('Adding video stream for user:', userId)

  // Check if a container for this user already exists
  const existingContainer = document.getElementById(`container-${userId}`)

  // If the container already exists and this isn't a local video,
  // update the existing container instead of creating a new one
  if (existingContainer && userId !== 'local') {
    console.log('Updating existing video container for user:', userId)

    // Find the video element in the container
    const existingVideo = existingContainer.querySelector('video')
    if (existingVideo) {
      // Update the video stream
      existingVideo.srcObject = stream

      // Update the video grid layout
      updateVideoGridLayout()
      return
    }
  }

  // Optimize video element for lower latency
  video.playsInline = true // Prevent fullscreen on iOS
  video.autoplay = true // Start playing as soon as possible
  video.muted = userId === 'local' // Mute local video to prevent feedback

  // Set low latency attributes
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')

  // Set video to low latency mode if supported
  if ('lowLatency' in video) {
    video.lowLatency = true
  }

  video.srcObject = stream

  // Create a container for the video
  const container = document.createElement('div')
  container.classList.add('video-container')
  container.id = `container-${userId}`

  // Add exit fullscreen button
  const exitButton = createExitButton(container)
  container.appendChild(exitButton)

  // Add user name label
  const userLabel = document.createElement('div')
  userLabel.classList.add('user-name')
  userLabel.textContent = userId === 'local' ? 'You' : `User ${userId.substring(0, 8)}...`
  container.appendChild(userLabel)

  // Add click handler to toggle fullscreen
  container.addEventListener('click', () => {
    toggleFullscreen(container)
  })

  video.addEventListener('loadedmetadata', () => {
    console.log('Video metadata loaded, playing video')
    video.play()
      .then(() => console.log('Video playback started successfully'))
      .catch(err => console.error('Error playing video:', err))
  })

  video.addEventListener('error', (e) => {
    console.error('Video error:', e)
  })

  // Add the video to the container
  container.appendChild(video)

  // Determine if this is the local video or a remote video
  if (userId === 'local') {
    // Local video gets special styling
    container.classList.add('local')

    // Check if the container already exists
    const existingContainer = document.getElementById('container-local')
    if (existingContainer) {
      existingContainer.remove()
    }
  }

  // Add the container to the grid
  videoGrid.appendChild(container)
  console.log('Video container added to grid for user:', userId)

  // Update the video grid layout
  updateVideoGridLayout()
}
