const socket = io('/')
const videoGrid = document.getElementById('video-grid')
const statusMessage = document.getElementById('status-message')
const videoToggleBtn = document.getElementById('video-toggle')
const audioToggleBtn = document.getElementById('audio-toggle')
const reconnectBtn = document.getElementById('reconnect-btn')

const myPeer = new Peer(undefined, {
  host: window.location.hostname,
  port: '3002',
  secure: true,  // Enable HTTPS
  debug: 3
})
const myVideo = document.createElement('video')
myVideo.muted = true
const peers = {}
let myStream = null
let isVideoEnabled = true
let isAudioEnabled = true
let myPeerId = null

// Update status message
function updateStatus(message, isError = false) {
  statusMessage.textContent = message
  statusMessage.style.backgroundColor = isError ? '#ffebee' : '#e7f3fe'
  statusMessage.style.borderLeft = `6px solid ${isError ? '#f44336' : '#2196F3'}`
}

// Add error handling for PeerJS
myPeer.on('error', (err) => {
  console.error('PeerJS error:', err)
  updateStatus(`PeerJS error: ${err.type}`, true)
})

// Setup control buttons
videoToggleBtn.addEventListener('click', toggleVideo)
audioToggleBtn.addEventListener('click', toggleAudio)
reconnectBtn.addEventListener('click', forceReconnect)

function toggleVideo() {
  if (!myStream) return

  const videoTrack = myStream.getVideoTracks()[0]
  if (videoTrack) {
    isVideoEnabled = !isVideoEnabled
    videoTrack.enabled = isVideoEnabled
    videoToggleBtn.textContent = isVideoEnabled ? 'Video Off' : 'Video On'
    videoToggleBtn.classList.toggle('off', !isVideoEnabled)
  }
}

function toggleAudio() {
  if (!myStream) return

  const audioTrack = myStream.getAudioTracks()[0]
  if (audioTrack) {
    isAudioEnabled = !isAudioEnabled
    audioTrack.enabled = isAudioEnabled
    audioToggleBtn.textContent = isAudioEnabled ? 'Audio Off' : 'Audio On'
    audioToggleBtn.classList.toggle('off', !isAudioEnabled)
  }
}

// Force reconnection to all peers
function forceReconnect() {
  updateStatus('Forcing reconnection to all peers...')

  // Close all existing peer connections
  Object.keys(peers).forEach(userId => {
    if (peers[userId]) {
      console.log('Closing connection to:', userId)
      peers[userId].close()
      delete peers[userId]
    }
  })

  // Clear the video grid except for our own video
  const videos = document.querySelectorAll('#video-grid video')
  videos.forEach(video => {
    if (video !== myVideo) {
      video.remove()
    }
  })

  // Emit a special message to the server to request reconnection
  socket.emit('force-reconnect', ROOM_ID, myPeerId)

  // Rejoin the room
  socket.emit('join-room', ROOM_ID, myPeerId)

  updateStatus('Reconnection initiated. Waiting for peers...')
}

// Check if getUserMedia is supported
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  console.log('getUserMedia is supported')
  updateStatus('Accessing camera and microphone...')

  // Try to access camera with error handling
  navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
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
      video.id = `video-${peerId}`

      // Handle the incoming stream
      call.on('stream', userVideoStream => {
        console.log('Received stream from call:', peerId)
        console.log('Stream tracks:', userVideoStream.getTracks().map(track => `${track.kind}: ${track.label} (${track.readyState})`))

        // Check if this video is already in the grid
        const existingVideo = document.getElementById(`video-${peerId}`)
        if (existingVideo) {
          console.log('Video already exists for this user, updating stream')
          existingVideo.srcObject = userVideoStream
        } else {
          addVideoStream(video, userVideoStream)
        }

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
      // Add a slight delay before connecting to the new user
      // This gives time for the signaling to complete
      setTimeout(() => {
        connectToNewUser(userId, stream)
      }, 1000)
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

      // Reconnect to the user
      setTimeout(() => {
        connectToNewUser(userId, stream)
      }, 1000)
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
        call.on('stream', userVideoStream => {
          addVideoStream(video, userVideoStream)
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
  }
})

myPeer.on('open', id => {
  console.log('My peer ID is:', id)
  myPeerId = id
  updateStatus('Connected to signaling server')
  socket.emit('join-room', ROOM_ID, id)
})

function connectToNewUser(userId, stream) {
  console.log('Connecting to new user:', userId)

  // Check if we're already connected to this user
  if (peers[userId]) {
    console.log('Already connected to this user, closing previous connection')
    peers[userId].close()
  }

  const call = myPeer.call(userId, stream)
  const video = document.createElement('video')
  video.id = `video-${userId}`  // Add an ID to the video element

  call.on('stream', userVideoStream => {
    console.log('Received stream from user:', userId)
    console.log('Stream tracks:', userVideoStream.getTracks().map(track => `${track.kind}: ${track.label} (${track.readyState})`))

    // Check if this video is already in the grid
    const existingVideo = document.getElementById(`video-${userId}`)
    if (existingVideo) {
      console.log('Video already exists for this user, updating stream')
      existingVideo.srcObject = userVideoStream
    } else {
      addVideoStream(video, userVideoStream)
    }

    updateStatus(`Connected with user: ${userId.substring(0, 8)}...`)
  })

  call.on('error', err => {
    console.error('Call error:', err)
    updateStatus(`Error connecting to user: ${err.message}`, true)
  })

  call.on('close', () => {
    console.log('Call closed for user:', userId)
    video.remove()
  })

  peers[userId] = call
}

function addVideoStream(video, stream) {
  console.log('Adding video stream to grid')
  video.srcObject = stream

  video.addEventListener('loadedmetadata', () => {
    console.log('Video metadata loaded, playing video')
    video.play()
      .then(() => console.log('Video playback started successfully'))
      .catch(err => console.error('Error playing video:', err))
  })

  video.addEventListener('error', (e) => {
    console.error('Video error:', e)
  })

  videoGrid.append(video)
  console.log('Video element added to grid')
}
