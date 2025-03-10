// Configure Socket.io with options for better reliability and lower latency
const socket = io('/', {
  transports: ['websocket', 'polling'], // Allow fallback to polling if WebSocket fails
  upgrade: true, // Allow transport upgrades
  reconnectionDelay: 1000, // Faster reconnection
  reconnectionAttempts: Infinity, // Unlimited reconnection attempts
  timeout: 30000, // Longer timeout for more reliable connections
  reconnection: true, // Enable automatic reconnection
  reconnectionDelayMax: 5000, // Maximum delay between reconnection attempts
  randomizationFactor: 0.5, // Add some randomization to the reconnection delay
  autoConnect: true, // Connect automatically
  forceNew: false, // Reuse existing connection if possible
  multiplex: true // Allow multiple connections to the same endpoint
})

// Add a heartbeat to detect disconnections early
setInterval(() => {
  if (socket.connected) {
    socket.emit('heartbeat');
  }
}, 10000);

// Add socket.io connection event handlers for better debugging and reliability
socket.on('connect', () => {
  console.log('Socket.io connected with ID:', socket.id)
  updateStatus('Connected to signaling server')

  // If we already have a peer ID and room ID, rejoin the room
  if (myPeerId && typeof ROOM_ID !== 'undefined') {
    console.log('Rejoining room after socket reconnection')
    socket.emit('join-room', ROOM_ID, myPeerId, myName)
  }
})

socket.on('connect_error', (error) => {
  console.error('Socket.io connection error:', error)
  updateStatus('Connection error. Attempting to reconnect...', true)
})

socket.on('disconnect', (reason) => {
  console.log('Socket.io disconnected. Reason:', reason)
  updateStatus('Disconnected from signaling server. Reconnecting...', true)

  // If the disconnect was due to a server disconnect, try to reconnect
  if (reason === 'io server disconnect') {
    socket.connect()
  }
})

socket.on('reconnect', (attemptNumber) => {
  console.log('Socket.io reconnected after', attemptNumber, 'attempts')
  updateStatus('Reconnected to signaling server')

  // Rejoin the room after reconnection
  if (myPeerId && typeof ROOM_ID !== 'undefined') {
    console.log('Rejoining room after socket reconnection')
    socket.emit('join-room', ROOM_ID, myPeerId, myName)
  }
})

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log('Socket.io reconnection attempt:', attemptNumber)
  updateStatus(`Reconnection attempt ${attemptNumber}...`)
})

socket.on('reconnect_error', (error) => {
  console.error('Socket.io reconnection error:', error)
  updateStatus('Error reconnecting. Will try again...', true)
})

socket.on('reconnect_failed', () => {
  console.error('Socket.io failed to reconnect')
  updateStatus('Failed to reconnect to server. Please refresh the page.', true)
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

// Determine if we're in production (Render) or development
const isProduction = window.location.hostname.includes('render.com') ||
                     window.location.hostname === 'rexmeet.onrender.com';

// Function to create a new PeerJS instance with optimized settings
function createPeer(peerId) {
  // Try to use a more reliable configuration
  return new Peer(peerId, {
    host: window.location.hostname,
    port: window.location.port || (window.location.protocol === 'https:' ? 443 : 80),
    path: '/', // Use root path to avoid path duplication issues
    secure: window.location.protocol === 'https:', // Use HTTPS if the page is loaded over HTTPS
    debug: 3,
    pingInterval: 3000, // Ping even more frequently to detect connection issues earlier
    reconnectTimer: 1000, // Faster reconnection attempts
    retryTimers: [1000, 2000, 4000, 8000], // Progressive backoff for retries
    config: {
      iceServers: [
        // STUN servers - multiple options for better connectivity
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Free TURN servers (multiple options with different transports)
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        // Additional TURN servers for better connectivity
        {
          urls: 'turn:relay.metered.ca:80',
          username: 'e8c5847a6c5e31e3f988751a',
          credential: 'OBMhFfXVcHZWGkgO'
        },
        {
          urls: 'turn:relay.metered.ca:443',
          username: 'e8c5847a6c5e31e3f988751a',
          credential: 'OBMhFfXVcHZWGkgO'
        },
        {
          urls: 'turn:relay.metered.ca:443?transport=tcp',
          username: 'e8c5847a6c5e31e3f988751a',
          credential: 'OBMhFfXVcHZWGkgO'
        }
      ],
      iceTransportPolicy: 'all', // Try direct connections first, fall back to TURN servers
      sdpSemantics: 'unified-plan',
      // Optimize for better connectivity rather than just low latency
      iceCandidatePoolSize: 10, // Increase candidate gathering speed
      bundlePolicy: 'max-bundle', // Bundle all media tracks
      rtcpMuxPolicy: 'require', // Require RTCP multiplexing
      iceServersTransportPolicy: 'all', // Try all transport policies
      iceTransportPolicyRelay: false // Don't force relay initially
    }
  });
}

// Initialize the peer connection
let myPeer = createPeer(storedPeerId);

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

// Add enhanced error handling for PeerJS
myPeer.on('error', (err) => {
  console.error('PeerJS error:', err)

  let errorMessage = `PeerJS error: ${err.type}`;
  let shouldAttemptReconnect = true;
  let reconnectDelay = 3000; // Default reconnect delay

  // Provide more specific error messages based on error type
  switch(err.type) {
    case 'peer-unavailable':
      errorMessage = `Connection failed: The peer you're trying to connect to is not available. They may have left the room or have connection issues.`;
      reconnectDelay = 2000;
      break;
    case 'network':
      errorMessage = `Network error: Connection to the signaling server was lost. Attempting to reconnect...`;
      // Try switching to a different ICE transport policy if we're having network issues
      if (myPeer.options && myPeer.options.config && myPeer.options.config.iceTransportPolicy === 'all') {
        console.log('Switching to relay-only ICE policy for more reliable connections');
        myPeer.options.config.iceTransportPolicy = 'relay';
      }
      reconnectDelay = 2000;
      break;
    case 'server-error':
      errorMessage = `Server error: The signaling server is experiencing issues. Attempting to reconnect...`;
      reconnectDelay = 4000; // Wait a bit longer for server errors
      break;
    case 'browser-incompatible':
      errorMessage = `Your browser may not fully support WebRTC. Please try using Chrome, Firefox, or Edge.`;
      shouldAttemptReconnect = false;
      break;
    case 'disconnected':
      errorMessage = `Disconnected from signaling server. Attempting to reconnect...`;
      reconnectDelay = 1500;
      break;
    case 'socket-error':
      errorMessage = `Socket connection error. Attempting to reconnect...`;
      reconnectDelay = 2000;
      break;
    case 'socket-closed':
      errorMessage = `Socket connection closed. Attempting to reconnect...`;
      reconnectDelay = 2000;
      break;
    case 'unavailable-id':
      errorMessage = `The ID ${myPeerId} is already taken. Generating a new ID...`;
      // Clear the stored peer ID so we get a new one
      sessionStorage.removeItem('myPeerId');
      reconnectDelay = 1000;
      break;
    default:
      errorMessage = `Connection error (${err.type}). Attempting to reconnect...`;
      reconnectDelay = 3000;
  }

  updateStatus(errorMessage, true);

  // Attempt to reconnect for most error types
  if (shouldAttemptReconnect) {
    console.log(`Scheduling reconnection attempt in ${reconnectDelay/1000} seconds due to ${err.type} error`);

    // Wait a bit before trying to reconnect
    setTimeout(() => {
      if (ROOM_ID) {
        console.log('Attempting automatic reconnection after PeerJS error');

        // For network-related errors, try a full reconnection
        if (err.type === 'network' || err.type === 'disconnected' ||
            err.type === 'socket-error' || err.type === 'socket-closed' ||
            err.type === 'server-error') {

          // Destroy the current peer connection
          if (myPeer) {
            console.log('Destroying current peer connection');
            try {
              myPeer.destroy();
            } catch (e) {
              console.error('Error destroying peer:', e);
              // Continue anyway
            }
          }

          // Create a new peer with the same ID (or a new one if unavailable-id)
          console.log('Creating new peer connection');
          const newPeerId = err.type === 'unavailable-id' ? undefined : myPeerId;

          // Recreate the peer with optimized settings
          myPeer = createPeer(newPeerId);

          // Set up all the event handlers again
          setupPeerEventHandlers();

          // The 'open' event handler will rejoin the room when the connection is established
        } else {
          // For other errors, just try to reconnect to the room
          forceReconnect();
        }
      }
    }, reconnectDelay);
  }
})

// Function to set up all peer event handlers
function setupPeerEventHandlers() {
  // Track reconnection attempts to prevent infinite loops
  let reconnectionAttempts = 0;
  const MAX_RECONNECTION_ATTEMPTS = 5;

  // Re-add the error handler
  myPeer.on('error', (err) => {
    console.error('PeerJS error in new connection:', err);

    // Only try to reconnect a limited number of times to prevent infinite loops
    if (reconnectionAttempts < MAX_RECONNECTION_ATTEMPTS) {
      reconnectionAttempts++;
      console.log(`Reconnection attempt ${reconnectionAttempts}/${MAX_RECONNECTION_ATTEMPTS}`);

      // For critical errors, try a more aggressive approach
      if (err.type === 'network' || err.type === 'server-error') {
        setTimeout(() => {
          console.log('Attempting to recreate peer connection after critical error');
          try {
            myPeer.destroy();
          } catch (e) {
            console.error('Error destroying peer:', e);
          }

          // Try with a completely new peer ID to avoid conflicts
          sessionStorage.removeItem('myPeerId');
          myPeer = createPeer();

          // Set up event handlers again, but with a clean reconnection counter
          setupPeerEventHandlers();
        }, 3000);
      } else {
        updateStatus(`Connection error: ${err.type}. Attempting to reconnect...`, true);
      }
    } else {
      // We've tried too many times, suggest manual refresh
      updateStatus(`Connection error: ${err.type}. Please try refreshing the page.`, true);
    }
  });

  // Re-add the open handler
  myPeer.on('open', id => {
    console.log('PeerJS connection successful! My peer ID is:', id);
    myPeerId = id;

    // Reset reconnection attempts counter on successful connection
    reconnectionAttempts = 0;

    // Store the peer ID for session persistence
    sessionStorage.setItem('myPeerId', id);

    // Log connection details
    console.log('PeerJS connection details:', {
      host: myPeer.options.host,
      port: myPeer.options.port,
      path: myPeer.options.path,
      secure: myPeer.options.secure,
      iceTransportPolicy: myPeer.options.config.iceTransportPolicy
    });

    updateStatus('Connected to signaling server');

    // Make sure we're connected to socket.io before joining the room
    if (socket.connected) {
      socket.emit('join-room', ROOM_ID, id, myName);
    } else {
      console.log('Socket not connected, waiting for connection before joining room');
      socket.once('connect', () => {
        console.log('Socket connected, now joining room');
        socket.emit('join-room', ROOM_ID, id, myName);
      });
    }
  });

  // Re-add the connection handler
  myPeer.on('connection', (conn) => {
    console.log('Incoming peer data connection:', conn.peer);

    conn.on('open', () => {
      console.log('Peer data connection opened with:', conn.peer);
    });

    // Handle data messages from peers
    conn.on('data', (data) => {
      console.log('Received data from peer:', data);

      // Handle ready-for-call message
      if (data.type === 'ready-for-call') {
        console.log(`Peer ${conn.peer} is ready for call`);

        // If we're not already connected to this peer and we have a stream, initiate a call
        if (!peers[conn.peer] && myStream) {
          console.log(`Initiating call to ${conn.peer} after receiving ready signal`);

          // Small delay to ensure both sides are ready
          setTimeout(() => {
            const call = myPeer.call(conn.peer, myStream);

            // Store the call in peers
            if (call) {
              peers[conn.peer] = call;
              console.log(`Call initiated to ${conn.peer}`);
            }
          }, 500);
        }
      }
    });

    conn.on('error', (err) => {
      console.error('Peer data connection error with ' + conn.peer + ':', err);
    });
  });

  // Re-add the call handler
  myPeer.on('call', call => {
    if (myStream) {
      const peerId = call.peer;
      console.log('Received call from:', peerId);
      updateStatus('Someone is connecting...');

      // Answer the call with our stream
      call.answer(myStream);

      // Create a video element for the remote stream
      const video = document.createElement('video');
      video.id = `remote-video`;

      // Handle the incoming stream
      call.on('stream', userVideoStream => {
        console.log('Received stream from call:', peerId);
        console.log('Stream tracks:', userVideoStream.getTracks().map(track =>
          `${track.kind}: ${track.label} (${track.readyState})`));

        addVideoStream(video, userVideoStream, peerId);
        updateStatus('Connected with another user');
      });

      // Handle errors
      call.on('error', err => {
        console.error('Call error:', err);
        updateStatus(`Error in call: ${err.message}`, true);
      });

      // Store the call in peers
      peers[peerId] = call;
    }
  });
}

// Add connection state monitoring
function monitorPeerConnections() {
  setInterval(() => {
    Object.values(peers).forEach(call => {
      if (call && call.peerConnection) {
        const state = call.peerConnection.connectionState || call.peerConnection.iceConnectionState;
        console.log(`Connection state with peer ${call.peer}: ${state}`);

        // If connection is failed, try to reconnect
        if (state === 'failed' || state === 'disconnected') {
          console.log(`Connection with peer ${call.peer} is ${state}, attempting to reconnect`);
          // Close the failed connection
          call.close();
          delete peers[call.peer];

          // Try to reconnect if we have a stream
          if (myStream) {
            setTimeout(() => {
              connectToNewUser(call.peer, myStream);
            }, 2000);
          }
        }
      }
    });
  }, 10000); // Check every 10 seconds
}

// Start monitoring peer connections
monitorPeerConnections();

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

  // Add all users except ourselves
  Object.keys(userList).forEach(userId => {
    if (userId !== myPeerId) {
      const user = userList[userId];
      const option = document.createElement('option');
      option.value = userId;

      // Show connection status in the user list
      const connectionStatus = user.connected === false ? ' (disconnected)' : '';
      option.textContent = (user.name || `User ${userId.substring(0, 8)}...`) + connectionStatus;

      // Disable selecting disconnected users for private messages
      if (user.connected === false) {
        option.disabled = true;
      }

      recipientSelect.appendChild(option);

      // Update video container labels if they exist
      const userContainer = document.getElementById(`container-${userId}`);
      if (userContainer) {
        const nameLabel = userContainer.querySelector('.user-name');
        if (nameLabel) {
          const userName = user.name || `User ${userId.substring(0, 8)}...`;
          nameLabel.textContent = userName + connectionStatus;

          // Add visual indication for disconnected users
          if (user.connected === false) {
            userContainer.classList.add('disconnected');
          } else {
            userContainer.classList.remove('disconnected');
          }
        }
      }
    }
  });

  // Reset selection when user list changes
  recipientSelect.value = '';
  selectedRecipient = null;
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
    // Use the current protocol and hostname instead of hardcoded values
    window.location.href = `${window.location.protocol}//${window.location.host}/`
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

      // Connect to the new user with a slight delay to ensure signaling is ready
      setTimeout(() => {
        connectToNewUser(userId, stream)
      }, 1000)

      // Set a timeout to automatically reconnect after 5 seconds if needed
      // This helps establish connections in difficult network conditions
      setTimeout(() => {
        // Only reconnect if we don't already have a successful connection
        const peerConnection = peers[userId]?.peerConnection;
        const connectionState = peerConnection?.connectionState || peerConnection?.iceConnectionState;

        if (!peerConnection || connectionState === 'failed' || connectionState === 'disconnected') {
          console.log('Connection not established or in bad state, forcing reconnect')

          // If we have a connection but it's in a bad state, close it first
          if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
          }

          // Try connecting again
          connectToNewUser(userId, stream);
        }
      }, 5000)
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

// Add more detailed PeerJS connection logging
myPeer.on('open', id => {
  console.log('PeerJS connection successful! My peer ID is:', id)
  myPeerId = id

  // Store the peer ID for session persistence
  sessionStorage.setItem('myPeerId', id)

  // Log connection details
  console.log('PeerJS connection details:', {
    host: myPeer.options.host,
    port: myPeer.options.port,
    path: myPeer.options.path,
    secure: myPeer.options.secure,
    iceTransportPolicy: myPeer.options.config.iceTransportPolicy
  })

  updateStatus('Connected to signaling server')
  socket.emit('join-room', ROOM_ID, id, myName)
})

// Add additional connection event handlers for better debugging
myPeer.on('connection', (conn) => {
  console.log('Incoming peer data connection:', conn.peer)

  conn.on('open', () => {
    console.log('Peer data connection opened with:', conn.peer)
  })

  // Handle data messages from peers
  conn.on('data', (data) => {
    console.log('Received data from peer:', data);

    // Handle ready-for-call message
    if (data.type === 'ready-for-call') {
      console.log(`Peer ${conn.peer} is ready for call`);

      // If we're not already connected to this peer and we have a stream, initiate a call
      if (!peers[conn.peer] && myStream) {
        console.log(`Initiating call to ${conn.peer} after receiving ready signal`);

        // Small delay to ensure both sides are ready
        setTimeout(() => {
          const call = myPeer.call(conn.peer, myStream);

          // Store the call in peers
          if (call) {
            peers[conn.peer] = call;
            console.log(`Call initiated to ${conn.peer}`);
          }
        }, 500);
      }
    }
  });

  conn.on('error', (err) => {
    console.error('Peer data connection error with ' + conn.peer + ':', err)
  })
})

// Handle page refresh/unload
window.addEventListener('beforeunload', () => {
  isRefreshing = true
  // We don't remove the peer ID from sessionStorage here
  // so it can be reused when the page refreshes
})

// Set up ping/pong with server to maintain connection and detect network issues
function setupPingPong() {
  let pingInterval
  let missedPongs = 0
  const MAX_MISSED_PONGS = 3

  function startPinging() {
    // Clear any existing interval
    if (pingInterval) {
      clearInterval(pingInterval)
    }

    // Reset missed pongs counter
    missedPongs = 0

    // Start sending pings every 15 seconds
    pingInterval = setInterval(() => {
      if (socket.connected && myPeerId && ROOM_ID) {
        console.log('Sending ping to server')

        // Track if we get a pong back
        let pongReceived = false

        // Send ping with user and room info
        socket.emit('ping-server', {
          userId: myPeerId,
          roomId: ROOM_ID,
          timestamp: Date.now()
        })

        // Set a timeout to check if we got a pong back
        setTimeout(() => {
          if (!pongReceived) {
            console.warn('No pong received from server')
            missedPongs++

            if (missedPongs >= MAX_MISSED_PONGS) {
              console.error(`Missed ${MAX_MISSED_PONGS} pongs, connection may be unstable`)
              updateStatus('Connection unstable. Attempting to reconnect...', true)

              // Try to reconnect
              forceReconnect()

              // Reset the counter
              missedPongs = 0
            }
          }
        }, 5000) // Wait 5 seconds for a pong

        // Listen for pong response
        socket.once('pong-server', (data) => {
          pongReceived = true
          const latency = Date.now() - data.timestamp
          console.log(`Received pong from server, latency: ${latency}ms`)

          // If latency is very high, show a warning
          if (latency > 1000) {
            console.warn(`High latency detected: ${latency}ms`)
            updateStatus(`High latency detected: ${latency}ms`, true)
          }
        })
      }
    }, 15000) // Ping every 15 seconds
  }

  // Start pinging when socket connects
  socket.on('connect', () => {
    console.log('Socket connected, starting ping/pong')
    startPinging()
  })

  // Stop pinging when socket disconnects
  socket.on('disconnect', () => {
    console.log('Socket disconnected, stopping ping/pong')
    if (pingInterval) {
      clearInterval(pingInterval)
    }
  })

  // Start pinging immediately if socket is already connected
  if (socket.connected) {
    startPinging()
  }
}

// Start the ping/pong mechanism
setupPingPong()

function connectToNewUser(userId, stream) {
  console.log('Connecting to new user:', userId)

  // Check if we're already connected to this user
  if (peers[userId]) {
    console.log('Already connected to this user, closing previous connection')
    peers[userId].close()
    delete peers[userId]
  }

  // Add a small delay before connecting to ensure signaling is ready
  setTimeout(() => {
    initiateConnection(userId, stream)
  }, 1000)
}

function initiateConnection(userId, stream) {
  console.log(`Initiating connection to user ${userId}`)

  // First establish a data connection to help with signaling
  const dataConnection = myPeer.connect(userId, {
    reliable: true,
    serialization: 'json'
  });

  dataConnection.on('open', () => {
    console.log(`Data connection established with ${userId}, now initiating media call`);
    dataConnection.send({
      type: 'ready-for-call',
      sender: myPeerId
    });
  });

  dataConnection.on('error', (err) => {
    console.error(`Data connection error with ${userId}:`, err);
  });

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

  // Set a connection timeout
  const connectionTimeout = setTimeout(() => {
    console.log(`Connection to ${userId} timed out, retrying...`)

    // If we still have a connecting container, it means the connection didn't complete
    const connectingContainer = document.getElementById(`container-${userId}`)
    if (connectingContainer && connectingContainer.classList.contains('connecting')) {
      // Remove the old container
      connectingContainer.remove()

      // If we have a call in the peers object, close it
      if (peers[userId]) {
        peers[userId].close()
        delete peers[userId]
      }

      // Try to connect again after a short delay
      setTimeout(() => {
        console.log(`Retrying connection to ${userId}`)
        connectToNewUser(userId, stream)
      }, 2000)
    }
  }, 15000) // 15 second timeout

  try {
    // Make the call with optimized options
    const call = myPeer.call(userId, stream)

    // Set up event handlers
    call.on('stream', userVideoStream => {
      // Clear the timeout since we got a stream
      clearTimeout(connectionTimeout)

      console.log('Received stream from user:', userId)
      console.log('Stream tracks:', userVideoStream.getTracks().map(track => `${track.kind}: ${track.label} (${track.readyState})`))

      // Remove the placeholder container
      const connectingContainer = document.getElementById(`container-${userId}`)
      if (connectingContainer) {
        connectingContainer.remove()
      }

      // Add the actual video stream
      addVideoStream(video, userVideoStream, userId)
      updateStatus(`Connected with user: ${userId.substring(0, 8)}...`)

      // Optimize the peer connection if possible
      if (call.peerConnection) {
        // Monitor this specific connection
        monitorSpecificConnection(call.peerConnection, userId)

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
      // Clear the timeout since we got an error
      clearTimeout(connectionTimeout)

      console.error('Call error:', err)
      updateStatus(`Error connecting to user: ${err.message}. Retrying...`, true)

      // Remove the placeholder on error
      const placeholderContainer = document.getElementById(`container-${userId}`)
      if (placeholderContainer) {
        placeholderContainer.remove()
      }

      // Remove from peers
      delete peers[userId]

      // Try to reconnect after a short delay
      setTimeout(() => {
        console.log(`Retrying connection to ${userId} after error`)
        connectToNewUser(userId, stream)
      }, 3000)
    })

    call.on('close', () => {
      // Clear the timeout since the call was closed
      clearTimeout(connectionTimeout)

      console.log('Call closed for user:', userId)
      const container = document.getElementById(`container-${userId}`)
      if (container) {
        container.remove()
      }

      // Remove from peers
      delete peers[userId]
    })

    // Store the call in peers
    peers[userId] = call

    // Add ice connection state change listener
    if (call.peerConnection) {
      call.peerConnection.addEventListener('iceconnectionstatechange', () => {
        const state = call.peerConnection.iceConnectionState
        console.log(`ICE connection state with ${userId}: ${state}`)

        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          console.log(`ICE connection with ${userId} is ${state}, attempting to reconnect`)

          // Close the failed connection
          call.close()
          delete peers[userId]

          // Remove the video container
          const container = document.getElementById(`container-${userId}`)
          if (container) {
            container.remove()
          }

          // Try to reconnect after a short delay
          setTimeout(() => {
            if (myStream) {
              console.log(`Retrying connection to ${userId} after ICE failure`)
              connectToNewUser(userId, myStream)
            }
          }, 2000)
        }
      })
    }
  } catch (err) {
    // Clear the timeout if we caught an error
    clearTimeout(connectionTimeout)

    console.error('Error creating call:', err)
    updateStatus(`Failed to connect to user: ${err.message}`, true)

    // Remove the placeholder container
    const placeholderContainer = document.getElementById(`container-${userId}`)
    if (placeholderContainer) {
      placeholderContainer.remove()
    }
  }
}

// Function to monitor a specific peer connection
function monitorSpecificConnection(peerConnection, userId) {
  // Monitor connection stats periodically
  const statsInterval = setInterval(() => {
    // Check if the connection still exists
    if (!peers[userId] || !peerConnection) {
      clearInterval(statsInterval)
      return
    }

    // Get connection state
    const connectionState = peerConnection.connectionState || peerConnection.iceConnectionState
    console.log(`Connection state with ${userId}: ${connectionState}`)

    // If connection is in a problematic state, try to reconnect
    if (connectionState === 'failed' || connectionState === 'disconnected') {
      console.log(`Connection with ${userId} is ${connectionState}, will attempt to reconnect`)
      clearInterval(statsInterval)

      // Close the connection
      if (peers[userId]) {
        peers[userId].close()
        delete peers[userId]
      }

      // Try to reconnect if we have a stream
      if (myStream) {
        setTimeout(() => {
          console.log(`Reconnecting to ${userId} after detecting ${connectionState} state`)
          connectToNewUser(userId, myStream)
        }, 2000)
      }
    }

    // Get detailed stats to check for issues
    peerConnection.getStats().then(stats => {
      let hasActiveAudio = false
      let hasActiveVideo = false

      stats.forEach(report => {
        // Check for active media tracks
        if (report.type === 'inbound-rtp' && report.kind === 'audio' && report.bytesReceived > 0) {
          hasActiveAudio = true
        }
        if (report.type === 'inbound-rtp' && report.kind === 'video' && report.bytesReceived > 0) {
          hasActiveVideo = true
        }

        // Log any significant packet loss
        if (report.type === 'inbound-rtp' && report.packetsLost > 0 && report.packetsReceived > 0) {
          const lossRate = report.packetsLost / (report.packetsLost + report.packetsReceived)
          if (lossRate > 0.1) { // More than 10% packet loss
            console.warn(`High packet loss (${(lossRate * 100).toFixed(1)}%) detected with ${userId}`)
          }
        }
      })

      // If we should have media but don't detect any, there might be an issue
      if (!hasActiveAudio && !hasActiveVideo && connectionState === 'connected') {
        console.warn(`Connection with ${userId} appears to be connected but no media is flowing`)
      }
    }).catch(err => {
      console.error(`Error getting stats for connection with ${userId}:`, err)
    })
  }, 5000) // Check every 5 seconds
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
