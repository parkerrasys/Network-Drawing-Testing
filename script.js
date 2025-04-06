// Detect if user is on mobile
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isIPhone = /iPhone/i.test(navigator.userAgent);

// DOM elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('color-picker');
const mobileColorPicker = document.getElementById('mobile-color-picker');
const brushSize = document.getElementById('brush-size');
const mobileBrushSize = document.getElementById('mobile-brush-size');
const sizeDisplay = document.getElementById('size-display');
const mobileSizeDisplay = document.getElementById('mobile-size-display');
const clearBtn = document.getElementById('clear-btn');
const mobileClearBtn = document.getElementById('mobile-clear-btn');
const hostBtn = document.getElementById('host-btn');
const connectBtn = document.getElementById('connect-btn');
const leaveBtn = document.getElementById('leave-btn');
const userList = document.getElementById('user-list');
const toggleSidebar = document.getElementById('toggle-sidebar');
const sidebar = document.getElementById('sidebar');
const toolbar = document.getElementById('toolbar');
const joinModal = document.getElementById('join-modal');
const hostModal = document.getElementById('host-modal');
const sessionIdInput = document.getElementById('session-id-input');
const sessionIdDisplay = document.getElementById('session-id-display');
const joinBtn = document.getElementById('join-btn');
const joinCancelBtn = document.getElementById('join-cancel-btn');
const closeHostModalBtn = document.getElementById('close-host-modal');
const copySessionIdBtn = document.getElementById('copy-session-id');
const scanQrBtn = document.getElementById('scan-qr-btn');
const qrVideo = document.getElementById('qr-video');
const scannerContainer = document.getElementById('scanner-container');
const notification = document.getElementById('notification');

// Application state
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = '#000000';
let currentSize = 5;
let peer = null;
let connections = [];
let sessionId = null;
let isHost = false;
let username = generateGuestName();
let userRole = 'viewer';
let users = [];
let myUserId = null;
let drawingHistory = []; // Store drawing operations for replay

// Generate a random guest name
function generateGuestName() {
    return `Guest${Math.floor(1000 + Math.random() * 9000)}`;
}

// Initialize the application
function init() {
    // Set up canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize PeerJS
    initPeerJS();
    
    // Apply mobile-specific changes
    if (isMobile) {
        setupMobileView();
    }
    
    // Update status
    updateStatus('Ready', false);
}

// Resize canvas to fill container
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // Redraw canvas content if needed
    replayDrawingHistory();
}

// Replay drawing history on canvas
function replayDrawingHistory() {
    // Clear canvas first
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Replay all drawing operations
    drawingHistory.forEach(op => {
        if (op.type === 'draw') {
            ctx.beginPath();
            ctx.moveTo(op.from[0], op.from[1]);
            ctx.lineTo(op.to[0], op.to[1]);
            ctx.strokeStyle = op.color;
            ctx.lineWidth = op.size;
            ctx.lineCap = 'round';
            ctx.stroke();
        } else if (op.type === 'clear') {
            // If we encounter a clear operation, reset the canvas and start over
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawingHistory = drawingHistory.filter(item => item.timestamp > op.timestamp);
        }
    });
}

// Set up event listeners
function setupEventListeners() {
    // Drawing events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch events for mobile
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);
    
    // Controls
    colorPicker.addEventListener('input', updateColor);
    mobileColorPicker.addEventListener('input', updateColor);
    brushSize.addEventListener('input', updateSize);
    mobileBrushSize.addEventListener('input', updateSize);
    clearBtn.addEventListener('click', clearCanvas);
    mobileClearBtn.addEventListener('click', clearCanvas);
    
    // Session controls
    hostBtn.addEventListener('click', showHostModal);
    connectBtn.addEventListener('click', showJoinModal);
    leaveBtn.addEventListener('click', leaveSession);
    joinBtn.addEventListener('click', joinSession);
    joinCancelBtn.addEventListener('click', hideJoinModal);
    closeHostModalBtn.addEventListener('click', hideHostModal);
    copySessionIdBtn.addEventListener('click', copySessionId);
    scanQrBtn.addEventListener('click', toggleQRScanner);
    
    // Mobile UI
    toggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

// Initialize PeerJS
function initPeerJS() {
    peer = new Peer({
        debug: 2
    });
    
    peer.on('open', (id) => {
        console.log('My peer ID is: ' + id);
        myUserId = id;
        updateStatus('Ready', false);
        enableControls();
    });
    
    peer.on('connection', (conn) => {
        handleConnection(conn);
    });
    
    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        showNotification('Connection error: ' + err.type);
        updateStatus('Error', false);
    });
}

// Set up mobile-specific view
function setupMobileView() {
    if (isIPhone) {
        // iPhone-specific adjustments
        document.documentElement.style.setProperty('--status-bar-height', '40px');
    }
    
    // Hide host button on mobile
    hostBtn.style.display = 'none';
}

// Drawing functions
function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = getPointerPosition(e);
}

function handleMouseMove(e) {
    const [x, y] = getPointerPosition(e);
    
    // Always send cursor position update, whether drawing or not
    if (connections.length > 0) {
        broadcastToPeers({
            type: 'cursor',
            position: [x, y]
        });
    }
    
    // If we're drawing, handle that separately
    if (isDrawing) {
        draw(e);
    }
}

function draw(e) {
    if (!isDrawing) return;
    
    e.preventDefault();
    
    const [x, y] = getPointerPosition(e);
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Record the drawing operation in history
    const drawOperation = {
        type: 'draw',
        from: [lastX, lastY],
        to: [x, y],
        color: currentColor,
        size: currentSize,
        timestamp: Date.now()
    };
    
    drawingHistory.push(drawOperation);
    
    // Send drawing data to peers
    if (connections.length > 0) {
        broadcastToPeers(drawOperation);
    }
    
    [lastX, lastY] = [x, y];
}

function stopDrawing() {
    isDrawing = false;
}

// Handle touch events
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

function handleTouchEnd(e) {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    canvas.dispatchEvent(mouseEvent);
}

// Get pointer position relative to canvas
function getPointerPosition(e) {
    const rect = canvas.getBoundingClientRect();
    return [
        e.clientX - rect.left,
        e.clientY - rect.top
    ];
}

// Update color
function updateColor(e) {
    currentColor = e.target.value;
    colorPicker.value = currentColor;
    mobileColorPicker.value = currentColor;
}

// Update brush size
function updateSize(e) {
    currentSize = e.target.value;
    sizeDisplay.textContent = `${currentSize}px`;
    mobileSizeDisplay.textContent = `${currentSize}px`;
    brushSize.value = currentSize;
    mobileBrushSize.value = currentSize;
}

// Clear canvas
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Record clear operation in history
    const clearOperation = {
        type: 'clear',
        timestamp: Date.now()
    };
    
    // Reset drawing history
    drawingHistory = [clearOperation];
    
    // Broadcast clear command to peers
    if (connections.length > 0) {
        broadcastToPeers(clearOperation);
    }
}

// Show host modal
function showHostModal() {
    hostSession();
    hostModal.classList.add('active');
}

// Hide host modal
function hideHostModal() {
    hostModal.classList.remove('active');
}

// Show join modal
function showJoinModal() {
    joinModal.classList.add('active');
}

// Hide join modal
function hideJoinModal() {
    joinModal.classList.remove('active');
    scannerContainer.style.display = 'none';
    if (qrVideo.srcObject) {
        const tracks = qrVideo.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        qrVideo.srcObject = null;
    }
}

// Host a new session
function hostSession() {
    sessionId = peer.id;
    isHost = true;
    userRole = 'host';
    
    // Add self to users list
    const myColor = getRandomColor();
    users = [{
        id: peer.id,
        name: username,
        color: myColor,
        role: 'host'
    }];
    
    // Update UI
    updateUserList();
    sessionIdDisplay.textContent = sessionId;
    generateQRCode(sessionId);
    
    // Show leave button
    connectBtn.style.display = 'none';
    hostBtn.style.display = 'none';
    leaveBtn.style.display = 'block';
    
    updateStatus('Hosting session', true);
    
    // Send a notification to everyone that you've created a session
    globalNotification(`${username} started a new drawing session`);
}

// Join an existing session
function joinSession() {
    const id = sessionIdInput.value.trim();
    if (!id) {
        showNotification('Please enter a session ID');
        return;
    }
    
    // Set up my user data
    const myColor = getRandomColor();
    const myMetadata = {
        name: username,
        color: myColor,
        role: 'viewer'
    };
    
    // Connect to the host
    const conn = peer.connect(id, {
        reliable: true,
        metadata: myMetadata
    });
    
    conn.on('open', () => {
        console.log('Connected to host');
        sessionId = id;
        connections.push(conn);
        hideJoinModal();
        
        // Add myself to users list locally first
        addUser(myUserId, username, myColor, 'viewer');
        
        // Send join data to host/peers
        conn.send({
            type: 'join',
            name: username,
            color: myColor,
            role: 'viewer'
        });
        
        // Request canvas state
        conn.send({
            type: 'requestCanvasState'
        });
        
        // Show leave button
        connectBtn.style.display = 'none';
        hostBtn.style.display = 'none';
        leaveBtn.style.display = 'block';
        
        updateStatus('Connected', true);
    });
    
    handleConnection(conn);
}

// Leave the current session
function leaveSession() {
    // Send leave notification before closing connections
    if (connections.length > 0) {
        globalNotification(`${username} left the session`);
    }
    
    // Close all connections
    connections.forEach(conn => conn.close());
    connections = [];
    
    // Reset session state
    sessionId = null;
    isHost = false;
    users = [];
    drawingHistory = [];
    
    // Clear the canvas
    clearCanvas();
    
    // Update UI
    updateUserList();
    connectBtn.style.display = 'block';
    if (!isMobile) hostBtn.style.display = 'block';
    leaveBtn.style.display = 'none';
    
    // Remove all cursors
    const cursors = document.querySelectorAll('.cursor');
    cursors.forEach(cursor => cursor.remove());
    
    updateStatus('Ready', false);
}

// Handle a new connection
function handleConnection(conn) {
    console.log('New connection:', conn);
    
    // Track the connection
    if (!connections.find(c => c.peer === conn.peer)) {
        connections.push(conn);
    }
    
    conn.on('data', data => {
        handleData(data, conn);
    });
    
    conn.on('close', () => {
        console.log('Connection closed:', conn);
        connections = connections.filter(c => c !== conn);
        const userId = conn.peer;
        const disconnectedUser = users.find(u => u.id === userId);
        
        if (disconnectedUser) {
            // Send notification about user leaving
            globalNotification(`${disconnectedUser.name} disconnected from the session`);
            
            // Remove user from the list
            users = users.filter(u => u.id !== userId);
            
            // Update user list for everyone
            if (isHost) {
                broadcastToPeers({
                    type: 'users',
                    users: users
                });
            }
            
            // Update UI
            updateUserList();
        }
        
        // Remove cursor
        const cursor = document.querySelector(`#cursor-${userId}`);
        if (cursor) cursor.remove();
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
        showNotification('Connection error');
    });
}

// Handle data received from peers
function handleData(data, conn) {
    console.log('Received data:', data);
    
    switch (data.type) {
        case 'draw':
            // Draw the line
            ctx.beginPath();
            ctx.moveTo(data.from[0], data.from[1]);
            ctx.lineTo(data.to[0], data.to[1]);
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.size;
            ctx.lineCap = 'round';
            ctx.stroke();
            
            // Add to drawing history
            if (!data.timestamp) {
                data.timestamp = Date.now();
            }
            drawingHistory.push(data);
            break;
            
        case 'clear':
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Reset drawing history
            if (!data.timestamp) {
                data.timestamp = Date.now();
            }
            drawingHistory = [data];
            break;
            
        case 'cursor':
            // Update cursor position
            updateCursor(conn.peer, data.position, conn.metadata);
            break;
            
        case 'join':
            // A user joined with info
            addUser(conn.peer, data.name, data.color, data.role || 'viewer');
            
            // If we're the host, send the current users and canvas state
            if (isHost) {
                // Send notification to everyone about the new user
                globalNotification(`${data.name} joined the session`);
                
                // Send updated users list to everyone
                broadcastToPeers({
                    type: 'users',
                    users: users
                });
            }
            break;
            
        case 'requestCanvasState':
            // Send current canvas state to the new user if we're the host
            if (isHost) {
                sendToPeer(conn.peer, {
                    type: 'canvasState',
                    history: drawingHistory
                });
            }
            break;
            
        case 'canvasState':
            // Receive canvas state from host
            if (data.history && data.history.length > 0) {
                drawingHistory = data.history;
                replayDrawingHistory();
            }
            break;
            
        case 'users':
            // Update the users list
            if (data.users) {
                // Make sure we're in the list (in case we were removed)
                const me = users.find(u => u.id === myUserId);
                
                // Update with new user list
                users = data.users;
                
                // Add ourselves back if we were removed somehow
                if (me && !users.find(u => u.id === myUserId)) {
                    users.push(me);
                }
                
                updateUserList();
            }
            break;
            
        case 'admin':
            // Change user role to admin
            if (data.userId) {
                changeUserRole(data.userId, 'admin');
                
                // If it's about me, update my role
                if (data.userId === myUserId) {
                    userRole = 'admin';
                    showNotification('You are now an admin');
                }
            }
            break;
            
        case 'viewer':
            // Change user role to viewer
            if (data.userId) {
                changeUserRole(data.userId, 'viewer');
                
                // If it's about me, update my role
                if (data.userId === myUserId) {
                    userRole = 'viewer';
                    showNotification('You are now a viewer');
                }
            }
            break;
            
        case 'kick':
            // Kick user
            if (data.userId === myUserId) {
                showNotification('You have been removed from the session');
                leaveSession();
            }
            break;
            
        case 'notification':
            // Display global notification
            if (data.message) {
                showNotification(data.message);
            }
            break;
    }
}

// Broadcast data to all connected peers
function broadcastToPeers(data) {
    connections.forEach(conn => {
        if (conn.open) {
            conn.send(data);
        }
    });
}

// Send data to specific peer
function sendToPeer(peerId, data) {
    const conn = connections.find(c => c.peer === peerId);
    if (conn && conn.open) {
        conn.send(data);
    }
}

// Send a global notification to all peers
function globalNotification(message) {
    // Show the notification locally
    showNotification(message);
    
    // Send to all peers
    broadcastToPeers({
        type: 'notification',
        message: message
    });
}

// Add user to the list
function addUser(id, name, color, role) {
    // Check if user already exists
    const existingUser = users.find(u => u.id === id);
    if (existingUser) {
        // Update existing user with latest data
        existingUser.name = name;
        existingUser.color = color;
        existingUser.role = role;
    } else {
        // Add user
        users.push({
            id,
            name,
            color,
            role
        });
    }
    
    updateUserList();
}

// Update user list in the UI
function updateUserList() {
    userList.innerHTML = '';
    
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.dataset.userId = user.id;
        
        const colorDiv = document.createElement('div');
        colorDiv.className = 'user-color';
        colorDiv.style.backgroundColor = user.color;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'user-name';
        nameSpan.textContent = user.name + (user.id === myUserId ? ' (You)' : '');
        
        const roleSpan = document.createElement('span');
        roleSpan.className = `user-badge badge-${user.role}`;
        roleSpan.textContent = user.role;
        
        li.appendChild(colorDiv);
        li.appendChild(nameSpan);
        li.appendChild(roleSpan);
        
        // Add actions if we're the host
        if (isHost && user.id !== myUserId) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'user-controls';
            
            if (user.role !== 'admin') {
                const adminBtn = document.createElement('button');
                adminBtn.className = 'btn btn-sm btn-outline';
                adminBtn.textContent = 'Admin';
                adminBtn.onclick = () => promoteToAdmin(user.id);
                actionsDiv.appendChild(adminBtn);
            }
            
            if (user.role !== 'viewer' && user.role !== 'host') {
                const viewerBtn = document.createElement('button');
                viewerBtn.className = 'btn btn-sm btn-outline';
                viewerBtn.textContent = 'Viewer';
                viewerBtn.onclick = () => demoteToViewer(user.id);
                actionsDiv.appendChild(viewerBtn);
            }
            
            const kickBtn = document.createElement('button');
            kickBtn.className = 'btn btn-sm btn-danger';
            kickBtn.textContent = 'Kick';
            kickBtn.onclick = () => kickUser(user.id);
            actionsDiv.appendChild(kickBtn);
            
            li.appendChild(actionsDiv);
        }
        
        userList.appendChild(li);
    });
}

// Change user role
function changeUserRole(userId, newRole) {
    const user = users.find(u => u.id === userId);
    if (user) {
        user.role = newRole;
        updateUserList();
        
        // Broadcast role change to all users
        if (isHost) {
            broadcastToPeers({
                type: 'users',
                users: users
            });
            
            // Send notification
            const roleChangeMsg = `${user.name} is now a ${newRole}`;
            globalNotification(roleChangeMsg);
        }
    }
}

// Promote user to admin
function promoteToAdmin(userId) {
    changeUserRole(userId, 'admin');
    
    // Notify the specific user
    sendToPeer(userId, {
        type: 'admin',
        userId: userId
    });
}

// Demote user to viewer
function demoteToViewer(userId) {
    changeUserRole(userId, 'viewer');
    
    // Notify the specific user
    sendToPeer(userId, {
        type: 'viewer',
        userId: userId
    });
}

// Kick user from session
function kickUser(userId) {
    const userToKick = users.find(u => u.id === userId);
    if (!userToKick) return;
    
    // Send notification before kicking
    globalNotification(`${userToKick.name} has been removed from the session`);
    
    // Remove from users list
    users = users.filter(u => u.id !== userId);
    updateUserList();
    
    // Notify all users about updated list
    broadcastToPeers({
        type: 'users',
        users: users
    });
    
    // Notify the specific user
    sendToPeer(userId, {
        type: 'kick',
        userId: userId
    });
    
    // Remove connection
    const conn = connections.find(c => c.peer === userId);
    if (conn) {
        conn.close();
        connections = connections.filter(c => c !== conn);
    }
}

// Update cursor position for a user
function updateCursor(userId, position, metadata) {
    let cursor = document.querySelector(`#cursor-${userId}`);
    
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = `cursor-${userId}`;
        cursor.className = 'cursor';
        
        // Create name label for cursor
        const nameLabel = document.createElement('div');
        nameLabel.className = 'cursor-name';
        nameLabel.textContent = metadata.name;
        cursor.appendChild(nameLabel);
        
        canvas.parentElement.appendChild(cursor);
    }
    
    // Always use the color from metadata
    cursor.style.backgroundColor = metadata.color;
    cursor.style.left = `${position[0]}px`;
    cursor.style.top = `${position[1]}px`;
}

// Generate a QR code for the session ID
function generateQRCode(text) {
    const qrcodeElement = document.getElementById('qrcode');
    qrcodeElement.innerHTML = '';
    
    new QRCode(qrcodeElement, {
        text: text,
        width: 128,
        height: 128,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
}

// Copy session ID to clipboard
function copySessionId() {
    const textToCopy = sessionIdDisplay.textContent;
    
    navigator.clipboard.writeText(textToCopy)
        .then(() => {
            showNotification('Session ID copied to clipboard');
        })
        .catch(err => {
            console.error('Failed to copy text: ', err);
            showNotification('Failed to copy Session ID');
        });
}

// Toggle QR code scanner
function toggleQRScanner() {
    if (scannerContainer.style.display === 'none') {
        scannerContainer.style.display = 'block';
        startQRScanner();
    } else {
        scannerContainer.style.display = 'none';
        stopQRScanner();
    }
}

// Start QR code scanner
function startQRScanner() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(function(stream) {
            qrVideo.srcObject = stream;
            qrVideo.setAttribute('playsinline', true);
            qrVideo.play();
            
            // Set up QR code scanning using jsQR library
            scanQRCode();
        })
        .catch(function(err) {
            console.error("Error accessing camera: ", err);
            showNotification('Error accessing camera');
        });
}

// Stop QR code scanner
function stopQRScanner() {
    if (qrVideo.srcObject) {
        const tracks = qrVideo.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        qrVideo.srcObject = null;
    }
}

// Scan QR code from video stream using jsQR library
function scanQRCode() {
    const videoElement = qrVideo;
    const canvasElement = document.createElement('canvas');
    const canvas = canvasElement.getContext('2d');
    
    // Use requestAnimationFrame for smooth scanning
    function scan() {
        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
            canvasElement.height = videoElement.videoHeight;
            canvasElement.width = videoElement.videoWidth;
            canvas.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            
            const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
            
            // jsQR is expected to be loaded as a separate library
            try {
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });
                
                if (code) {
                    // Found a QR code
                    const scannedData = code.data;
                    console.log("QR code detected:", scannedData);
                    
                    // Set the session ID input and stop scanning
                    sessionIdInput.value = scannedData;
                    stopQRScanner();
                    scannerContainer.style.display = 'none';
                    showNotification('QR code detected: ' + scannedData);
                    
                    // Automatically join session
                    joinSession();
                    return;
                }
            } catch (e) {
                console.error("jsQR error:", e);
            }
        }
        
        // Continue scanning if container is still visible
        if (scannerContainer.style.display !== 'none') {
            requestAnimationFrame(scan);
        }
    }
    
    requestAnimationFrame(scan);
}

// Show notification
function showNotification(message) {
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Update connection status
function updateStatus(message, connected) {
    statusText.textContent = message;
    
    if (connected) {
        statusDot.classList.add('connected');
    } else {
        statusDot.classList.remove('connected');
    }
}

// Enable controls when ready
function enableControls() {
    hostBtn.disabled = false;
    connectBtn.disabled = false;
}

// Get a random color
function getRandomColor() {
    const colors = [
        '#4361ee', '#3a0ca3', '#7209b7', '#f72585',
        '#4cc9f0', '#4895ef', '#560bad', '#f3722c',
        '#f8961e', '#f9c74f', '#90be6d', '#43aa8b'
    ];
    
    return colors[Math.floor(Math.random() * colors.length)];
}

// Initialize the app when document is loaded
window.addEventListener('DOMContentLoaded', init);