const socket = io('/')
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

const myPeer = new Peer(undefined, {
  host: window.location.hostname,
  port: '3002',
  secure: true,  // Enable HTTPS
  debug: 3
})

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

// Update status message
function updateStatus(message, isError = false) {
  statusMessage.textContent = message
  statusMessage.style.backgroundColor = isError ? 'rgba(244, 67, 54, 0.2)' : 'rgba(33, 150, 243, 0.2)'
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
      message,
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

  // Close all existing peer connections
  Object.keys(peers).forEach(userId => {
    if (peers[userId]) {
      console.log('Closing connection to:', userId)
      peers[userId].close()
      delete peers[userId]
    }
  })

  // Clear the video grid except for our own video container
  const containers = document.querySelectorAll('.video-container:not(.local)')
  containers.forEach(container => {
    container.remove()
  })

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
})

myPeer.on('open', id => {
  console.log('My peer ID is:', id)
  myPeerId = id
  updateStatus('Connected to signaling server')
  socket.emit('join-room', ROOM_ID, id, myName)
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
  video.id = `video-${userId}`

  call.on('stream', userVideoStream => {
    console.log('Received stream from user:', userId)
    console.log('Stream tracks:', userVideoStream.getTracks().map(track => `${track.kind}: ${track.label} (${track.readyState})`))

    addVideoStream(video, userVideoStream, userId)
    updateStatus(`Connected with user: ${userId.substring(0, 8)}...`)
  })

  call.on('error', err => {
    console.error('Call error:', err)
    updateStatus(`Error connecting to user: ${err.message}`, true)
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
}
