// Canvas elements and context
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// UI elements
const clearButton = document.getElementById('clearButton');
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');
const hostButton = document.getElementById('hostButton');
const joinButton = document.getElementById('joinButton');
const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const connectionStatus = document.getElementById('connectionStatus');
const connectionCodeInput = document.getElementById('connectionCodeInput');
const connectionCodeDisplay = document.getElementById('connectionCodeDisplay');

// WebRTC variables
let peerConnection;
let dataChannel;
let isHost = false;
let roomCode = '';
let connectedPeers = new Map(); // Map to store all connected peers

// Drawing variables
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Initialize canvas size
function initCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    clearCanvas();
}

// Set up event listeners
function setupEventListeners() {
    // Canvas drawing events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch events for mobile
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', stopDrawing);
    
    // Button events
    clearButton.addEventListener('click', clearCanvas);
    hostButton.addEventListener('click', hostSession);
    joinButton.addEventListener('click', joinSession);
    connectButton.addEventListener('click', connectWithCode);
    disconnectButton.addEventListener('click', disconnect);
    
    // Window resize event
    window.addEventListener('resize', debounce(initCanvas, 250));
}

// Drawing functions
function startDrawing(e) {
    isDrawing = true;
    
    // Get the correct coordinates
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
}

function draw(e) {
    if (!isDrawing) return;
    
    // Get current coordinates
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    // Draw line
    drawLine(lastX, lastY, currentX, currentY, colorPicker.value, brushSize.value);
    
    // Send drawing data to all connected peers
    broadcastDrawingData(lastX, lastY, currentX, currentY, colorPicker.value, brushSize.value);
    
    // Update last position
    lastX = currentX;
    lastY = currentY;
}

function stopDrawing() {
    isDrawing = false;
}

function drawLine(startX, startY, endX, endY, color, width) {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
}

function clearCanvas() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Send clear command to all peers
    broadcastClearCanvas();
}

// Handle touch events for mobile devices
function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

// Generate a random 6-digit code
function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Signal server functions (these would connect to a real signal server in production)
// For simplicity, we're simulating the signaling with local data
const signalServer = {
    // Store room info by code
    rooms: {},
    
    // Create a new room
    createRoom(roomCode, sdp) {
        this.rooms[roomCode] = {
            host: { sdp },
            peers: []
        };
        return roomCode;
    },
    
    // Join an existing room
    joinRoom(roomCode, peerSdp) {
        if (!this.rooms[roomCode]) {
            return { success: false, message: 'Room not found' };
        }
        
        const peerInfo = {
            id: `peer-${Date.now()}`,
            sdp: peerSdp
        };
        
        this.rooms[roomCode].peers.push(peerInfo);
        
        return {
            success: true,
            hostSdp: this.rooms[roomCode].host.sdp,
            peerId: peerInfo.id
        };
    },
    
    // Get room info
    getRoomInfo(roomCode) {
        return this.rooms[roomCode];
    }
};

// WebRTC functions
function createPeerConnection(peerId = null) {
    // Configuration with STUN server for NAT traversal
    const servers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };
    
    const pc = new RTCPeerConnection(servers);
    
    // Set up ICE candidate handling
    pc.onicecandidate = event => {
        if (event.candidate) {
            console.log('ICE candidate generated');
        } else {
            console.log('All ICE candidates gathered');
            // In a real implementation, we would send this to the signal server
            if (isHost) {
                // Store in signal server
                signalServer.createRoom(roomCode, pc.localDescription);
                
                // Display connection code
                connectionCodeDisplay.textContent = roomCode;
                
                // Show connection info
                document.getElementById('hostConnectionInfo').style.display = 'block';
            }
        }
    };
    
    // Connection state change
    pc.onconnectionstatechange = event => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
            if (peerId) {
                updateStatus(`Peer ${peerId} connected`, true);
            } else {
                updateStatus('Connected', true);
            }
            
            hostButton.disabled = true;
            joinButton.disabled = true;
            disconnectButton.disabled = false;
        } else if (pc.connectionState === 'disconnected' || 
                  pc.connectionState === 'failed' || 
                  pc.connectionState === 'closed') {
            if (peerId) {
                console.log(`Peer ${peerId} disconnected`);
                connectedPeers.delete(peerId);
            } else {
                updateStatus('Disconnected');
                resetConnectionButtons();
            }
        }
    };
    
    return pc;
}

function hostSession() {
    isHost = true;
    updateStatus('Creating host session...');
    
    // Generate a 6-digit room code
    roomCode = generateRoomCode();
    
    peerConnection = createPeerConnection();
    
    // Create data channel as the host
    dataChannel = peerConnection.createDataChannel('drawingData');
    setupDataChannel(dataChannel);
    
    // Create and set local description (offer)
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            updateStatus('Session created! Share the connection code with others.');
        })
        .catch(error => {
            console.error('Error creating offer:', error);
            updateStatus(`Error: ${error.message}`);
        });
    
    // Prepare for multiple connections
    setInterval(() => {
        checkForNewPeers();
    }, 5000);
}

function joinSession() {
    isHost = false;
    updateStatus('Ready to join session. Enter the 6-digit code.');
    
    document.getElementById('joinConnectionInfo').style.display = 'block';
}

function connectWithCode() {
    const code = connectionCodeInput.value.trim();
    
    if (code.length !== 6 || !/^\d+$/.test(code)) {
        updateStatus('Please enter a valid 6-digit code');
        return;
    }
    
    updateStatus('Connecting to session...');
    
    // Get room info from signal server
    const roomInfo = signalServer.getRoomInfo(code);
    
    if (!roomInfo) {
        updateStatus('Session not found. Check the code and try again.');
        return;
    }
    
    // Join the room
    roomCode = code;
    
    // Create peer connection
    peerConnection = createPeerConnection();
    
    // Set up data channel as the joining peer
    peerConnection.ondatachannel = event => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };
    
    // Set remote description (offer from host)
    peerConnection.setRemoteDescription(new RTCSessionDescription(roomInfo.host.sdp))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
            // In a real implementation, we would send this answer to the signal server
            const joinResult = signalServer.joinRoom(roomCode, peerConnection.localDescription);
            
            if (joinResult.success) {
                updateStatus('Connected to session! You can now draw collaboratively.', true);
                document.getElementById('joinConnectionInfo').style.display = 'none';
            } else {
                updateStatus(joinResult.message);
            }
        })
        .catch(error => {
            console.error('Error joining session:', error);
            updateStatus(`Error: ${error.message}`);
        });
}

// Check for new peers to connect with (for host)
function checkForNewPeers() {
    if (!isHost || !roomCode) return;
    
    const roomInfo = signalServer.getRoomInfo(roomCode);
    
    if (!roomInfo) return;
    
    // Look for new peers that we haven't connected to yet
    roomInfo.peers.forEach(peer => {
        if (!connectedPeers.has(peer.id)) {
            connectToPeer(peer);
        }
    });
}

// Connect to a new peer (host only)
function connectToPeer(peer) {
    console.log(`Connecting to peer ${peer.id}`);
    
    const peerConnection = createPeerConnection(peer.id);
    const peerDataChannel = peerConnection.createDataChannel('drawingData');
    
    setupDataChannel(peerDataChannel);
    
    // Store peer connection
    connectedPeers.set(peer.id, {
        connection: peerConnection,
        dataChannel: peerDataChannel
    });
    
    // Connect with peer's SDP
    peerConnection.setRemoteDescription(new RTCSessionDescription(peer.sdp))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
            console.log(`Connected to peer ${peer.id}`);
        })
        .catch(error => {
            console.error(`Error connecting to peer ${peer.id}:`, error);
            connectedPeers.delete(peer.id);
        });
}

function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('Data channel is open');
        updateStatus('Connected! You can now draw collaboratively.', true);
        disconnectButton.disabled = false;
    };
    
    channel.onclose = () => {
        console.log('Data channel is closed');
        if (!isHost) {
            updateStatus('Disconnected');
            resetConnectionButtons();
        }
    };
    
    channel.onmessage = event => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'draw') {
            // Draw the line received from the peer
            drawLine(data.startX, data.startY, data.endX, data.endY, data.color, data.size);
            
            // If we're the host, relay to all other connected peers
            if (isHost && data.sourceId !== 'host') {
                broadcastDrawingData(data.startX, data.startY, data.endX, data.endY, data.color, data.size, data.sourceId);
            }
        } else if (data.type === 'clear') {
            // Clear the canvas when requested by peer
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // If we're the host, relay to all other connected peers
            if (isHost && data.sourceId !== 'host') {
                broadcastClearCanvas(data.sourceId);
            }
        }
    };
}

// Broadcast drawing data to all connected peers
function broadcastDrawingData(startX, startY, endX, endY, color, size, excludeId = null) {
    const drawData = {
        type: 'draw',
        sourceId: isHost ? 'host' : 'peer',
        startX,
        startY,
        endX,
        endY,
        color,
        size
    };
    
    const jsonData = JSON.stringify(drawData);
    
    // Send to direct connection
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(jsonData);
    }
    
    // If host, send to all connected peers except the source
    if (isHost) {
        connectedPeers.forEach((peer, peerId) => {
            if (peerId !== excludeId && peer.dataChannel.readyState === 'open') {
                peer.dataChannel.send(jsonData);
            }
        });
    }
}

// Broadcast clear canvas to all connected peers
function broadcastClearCanvas(excludeId = null) {
    const clearData = {
        type: 'clear',
        sourceId: isHost ? 'host' : 'peer'
    };
    
    const jsonData = JSON.stringify(clearData);
    
    // Send to direct connection
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(jsonData);
    }
    
    // If host, send to all connected peers except the source
    if (isHost) {
        connectedPeers.forEach((peer, peerId) => {
            if (peerId !== excludeId && peer.dataChannel.readyState === 'open') {
                peer.dataChannel.send(jsonData);
            }
        });
    }
}

function disconnect() {
    // Close all peer connections if host
    if (isHost) {
        connectedPeers.forEach((peer, peerId) => {
            if (peer.dataChannel) {
                peer.dataChannel.close();
            }
            if (peer.connection) {
                peer.connection.close();
            }
        });
        connectedPeers.clear();
    }
    
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    resetConnectionButtons();
    updateStatus('Disconnected');
    
    // Hide connection info divs
    document.getElementById('hostConnectionInfo').style.display = 'none';
    document.getElementById('joinConnectionInfo').style.display = 'none';
}

function resetConnectionButtons() {
    hostButton.disabled = false;
    joinButton.disabled = false;
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    connectionCodeInput.value = '';
    connectionCodeDisplay.textContent = '';
    roomCode = '';
    isHost = false;
}

// Update status display
function updateStatus(message, connected = false) {
    connectionStatus.textContent = message;
    connectionStatus.className = connected ? 'connected' : 'disconnected';
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

// Initialize the app
function init() {
    initCanvas();
    setupEventListeners();
    updateStatus('Click "Host Session" to create a new drawing room or "Join Session" to connect to an existing one');
}

// Start the application when page loads
window.addEventListener('load', init);