/**
 * Test peer instances for development
 */

const PeerNode = require('../peer-node/peer');

// Create multiple peer instances for testing
const peers = [];

function createPeer(peerId, port) {
  const peer = new PeerNode(peerId, port, 'ws://localhost:5000');
  peer.start();
  peers.push(peer);
  return peer;
}

// Create 3 test peers
console.log('\n=== P2P Chat System - Test Instance ===\n');

const peerA = createPeer('Peer_A', 3001);
const peerB = createPeer('Peer_B', 3002);
const peerC = createPeer('Peer_C', 3003);

// Wait for peers to connect and exchange keys, then test messaging
setTimeout(() => {
  console.log('\n=== Starting Test Messages ===\n');

  // Peer A sends a message to Peer B
  peerA.sendMessage('Peer_B', 'Hello from Peer A!', false);

  // Peer B sends a reply after 2 seconds
  setTimeout(() => {
    peerB.sendMessage('Peer_A', 'Hi! Thanks for the message!', false);
  }, 2000);

  // Group message from Peer A
  setTimeout(() => {
    peerA.sendMessage('Peer_B', 'Hello everyone!', true);
  }, 4000);

}, 6000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  peers.forEach(peer => {
    peer.stopHeartbeat();
  });
  process.exit(0);
});

module.exports = { peers };
