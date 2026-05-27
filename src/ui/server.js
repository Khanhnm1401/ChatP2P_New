/**
 * Web UI Server + P2P Peer
 * localhost:8080 acts as a full P2P peer (like Peer_A, B, C)
 * The web UI is served via the same HTTP server as the peer
 */

const express = require('express');
const http = require('http');
const path = require('path');
const PeerNode = require('../peer-node/peer');

const app = express();
const PORT = 8080;

// Create a peer node for the web UI (will use port 8080 for both HTTP and WebSocket)
const webPeer = new PeerNode('Web_Peer', PORT, 'ws://localhost:5000');

// Middleware must be added to the app BEFORE calling start()
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.use(express.static(path.dirname(__filename)));

// Serve UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Get peer info and connected peers
app.get('/info', (req, res) => {
  const peers = Array.from(webPeer.peerList.values()).map(p => ({
    peer_id: p.peer_id,
    port: p.port,
    ip: p.ip,
    status: p.ui_active === true ? 'online' : 'offline'
  }));

  res.json({
    peerId: webPeer.peerId,
    peers: peers,
    messageCount: webPeer.messageHistory.length
  });
});

// Get peer list
app.get('/peers', (req, res) => {
  const peers = Array.from(webPeer.peerList.values()).map(p => ({
    peer_id: p.peer_id,
    port: p.port,
    status: p.ui_active === true ? 'online' : 'offline'
  }));
  res.json(peers);
});

// Send message to another peer
app.post('/send', (req, res) => {
  const { to, message, isGroup, recipients } = req.body;

  if (!message || (!to && !isGroup)) {
    return res.status(400).json({ error: 'Missing target or message' });
  }

  try {
    if (isGroup) {
      const result = webPeer.sendGroupMessage(Array.isArray(recipients) ? recipients : [], message);
      return res.json({
        success: true,
        from: webPeer.peerId,
        to: 'GROUP',
        recipients: result.recipients,
        message
      });
    }

    webPeer.sendMessage(to, message, false);
    res.json({ success: true, from: webPeer.peerId, to, message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all message history (last 100)
app.get('/messages', (req, res) => {
  res.json({
    messages: webPeer.messageHistory.slice(-100)
  });
});

app.get('/messages/group/all', (req, res) => {
  res.json({
    messages: webPeer.messageHistory
      .filter(message => message.type === 'GROUP_CHAT')
      .slice(-100),
    myId: webPeer.peerId
  });
});

// Get messages for a specific conversation (filter by peerId)
app.get('/messages/:peerId', (req, res) => {
  const { peerId } = req.params;
  const myId = webPeer.peerId;

  const filtered = webPeer.messageHistory.filter(m =>
    (m.from === myId && m.to === peerId) ||
    (m.from === peerId && m.to === myId) ||
    // Include group messages involving either party
    (m.type === 'GROUP_CHAT' && (m.from === peerId || m.from === myId))
  );

  res.json({
    messages: filtered.slice(-50),
    myId: myId
  });
});

// Start the peer (this starts HTTP + WebSocket server on port 8080)
console.log(`\n✓ Web UI + Peer Server starting...`);
const httpServer = http.createServer(app);
webPeer.start(httpServer);
httpServer.listen(PORT, () => {
  console.log(`  Web UI available at http://localhost:${PORT}`);
});

// Log server started after a delay (when peer has connected)
setTimeout(() => {
  console.log(`  Peer ID: ${webPeer.peerId}`);
  console.log(`  Open http://localhost:${PORT} in your browser\n`);
}, 2000);

module.exports = { app, webPeer, httpServer };
