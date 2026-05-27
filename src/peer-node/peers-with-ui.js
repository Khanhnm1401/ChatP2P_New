

const PeerNode = require('../peer-node/peer');
const express = require('express');
const path = require('path');

// ===================== CREATE PEER NODES =====================
const peers = [];

function createPeer(peerId, port) {
  const peer = new PeerNode(peerId, port, 'ws://localhost:5000');
  peer.start();
  peers.push(peer);
  console.log(`✓ Created ${peerId} on port ${port}`);
  return peer;
}

console.log('\n=== P2P Chat System - Test Peers with UI ===\n');

const peerA = createPeer('Peer_A', 3001);
const peerB = createPeer('Peer_B', 3002);
const peerC = createPeer('Peer_C', 3003);

// ===================== SETUP UNIFIED UI SERVER =====================
const app = express();
const UI_PORT = 8080;

const peerNodes = {
  'Peer_A': peerA,
  'Peer_B': peerB,
  'Peer_C': peerC
};

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.use(express.static(path.join(__dirname)));

// Serve UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'peer-ui.html'));
});

// Get peer info
app.get('/info', (req, res) => {
  const { peerId } = req.query;
  const peer = peerNodes[peerId];
  
  if (!peer) {
    return res.status(400).json({ error: 'Peer not found' });
  }

  const peers = Array.from(peer.peerList.values()).map(p => ({
    peer_id: p.peer_id,
    port: p.port,
    ip: p.ip,
    status: p.status || 'online'
  }));

  res.json({
    peerId: peer.peerId,
    peers: peers,
    messageCount: peer.messageHistory.length
  });
});

// Get peer list
app.get('/peers', (req, res) => {
  const { peerId } = req.query;
  const peer = peerNodes[peerId];
  
  if (!peer) {
    return res.status(400).json({ error: 'Peer not found' });
  }

  const peers = Array.from(peer.peerList.values()).map(p => ({
    peer_id: p.peer_id,
    port: p.port,
    status: p.status || 'online'
  }));

  res.json(peers);
});

// Send message
app.post('/send', (req, res) => {
  const { peerId, to, message, isGroup } = req.body;
  const peer = peerNodes[peerId];

  if (!peer) {
    return res.status(400).json({ error: 'Peer not found' });
  }

  if (!to || !message) {
    return res.status(400).json({ error: 'Missing to or message' });
  }

  try {
    peer.sendMessage(to, message, isGroup || false);
    res.json({ success: true, from: peerId, to, message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all messages
app.get('/messages', (req, res) => {
  const { peerId } = req.query;
  const peer = peerNodes[peerId];
  
  if (!peer) {
    return res.status(400).json({ error: 'Peer not found' });
  }

  res.json({
    messages: peer.messageHistory.slice(-100)
  });
});

// Get messages for specific conversation
app.get('/messages/:targetPeerId', (req, res) => {
  const { peerId } = req.query;
  const { targetPeerId } = req.params;
  const peer = peerNodes[peerId];

  if (!peer) {
    return res.status(400).json({ error: 'Peer not found' });
  }

  const filtered = peer.messageHistory.filter(m =>
    (m.from === peerId && m.to === targetPeerId) ||
    (m.from === targetPeerId && m.to === peerId) ||
    (m.type === 'GROUP_CHAT' && (m.from === targetPeerId || m.from === peerId))
  );

  res.json({
    messages: filtered.slice(-50),
    myId: peerId
  });
});

// Start UI Server
app.listen(UI_PORT, () => {
  console.log(`\n✓ Unified UI Server started on port ${UI_PORT}`);
  console.log(`\n  Access Messenger UI at:`);
  console.log(`    - Peer_A: http://localhost:${UI_PORT}?peerId=Peer_A`);
  console.log(`    - Peer_B: http://localhost:${UI_PORT}?peerId=Peer_B`);
  console.log(`    - Peer_C: http://localhost:${UI_PORT}?peerId=Peer_C\n`);
});

// ===================== TEST MESSAGES (after 10s) =====================
setTimeout(() => {
  console.log('\n=== Starting Test Messages ===\n');

  // Peer A sends to Peer B
  peerA.sendMessage('Peer_B', 'Hello from Peer A!', false);

  // Peer B replies after 2 seconds
  setTimeout(() => {
    peerB.sendMessage('Peer_A', 'Hi! Thanks for the message!', false);
  }, 2000);

  // Group message from Peer A
  setTimeout(() => {
    peerA.sendMessage('Peer_B', 'Hello everyone!', true);
  }, 4000);

}, 10000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  peers.forEach(peer => {
    peer.stopHeartbeat();
  });
  process.exit(0);
});

module.exports = { peers, peerNodes, app };
