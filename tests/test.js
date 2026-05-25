const assert = require('assert');
const WebSocket = require('ws');

const Encryption = require('../src/common/encryption');
const PeerNode = require('../src/peer-node/peer');

function createOpenSocket(onSend) {
  return {
    readyState: WebSocket.OPEN,
    send(payload) {
      onSend(JSON.parse(payload));
    }
  };
}

function testEncryptionRoundTrip() {
  const aesKey = Encryption.generateAESKey();
  const plainText = 'secure hello';
  const encrypted = Encryption.encryptMessage(plainText, aesKey);
  const decrypted = Encryption.decryptMessage(encrypted, aesKey);

  assert.ok(encrypted, 'Encryption should return a payload');
  assert.strictEqual(decrypted, plainText, 'AES encryption should be reversible');
}

function testDirectMessageUsesEncryption() {
  const peer = new PeerNode('Peer_A', 3101);
  const recipientKey = Encryption.generateAESKey();
  let outboundMessage = null;

  peer.setupRetry = () => {};
  peer.peerList.set('Peer_B', {
    peer_id: 'Peer_B',
    ip: 'localhost',
    port: 3102,
    status: 'online',
    public_key: 'dummy'
  });
  peer.sharedKeys.set('Peer_B', recipientKey);
  peer.peerConnections.set('Peer_B', createOpenSocket(message => {
    outboundMessage = message;
  }));

  peer.sendMessage('Peer_B', 'hello direct', false);

  assert.ok(outboundMessage, 'Direct message should be sent immediately');
  assert.strictEqual(outboundMessage.type, 'CHAT');
  assert.strictEqual(outboundMessage.payload.encrypted, true);
  assert.strictEqual(
    Encryption.decryptMessage(outboundMessage.payload.text, recipientKey),
    'hello direct',
    'Direct messages should be AES encrypted before sending'
  );
}

function testGroupMessageTargetsAllOnlinePeers() {
  const peer = new PeerNode('Peer_A', 3201);
  const delivered = [];

  peer.setupRetry = () => {};

  ['Peer_B', 'Peer_C'].forEach((peerId, index) => {
    const sharedKey = Encryption.generateAESKey();
    peer.peerList.set(peerId, {
      peer_id: peerId,
      ip: 'localhost',
      port: 3202 + index,
      status: 'online',
      public_key: 'dummy'
    });
    peer.sharedKeys.set(peerId, sharedKey);
    peer.peerConnections.set(peerId, createOpenSocket(message => {
      delivered.push({ peerId, message, sharedKey });
    }));
  });

  const result = peer.sendGroupMessage([], 'hello group');

  assert.strictEqual(result.recipientCount, 2, 'Group chat should target all online peers');
  assert.strictEqual(delivered.length, 2, 'Each recipient should receive one group message');
  delivered.forEach(({ message, sharedKey }) => {
    assert.strictEqual(message.type, 'GROUP_CHAT');
    assert.strictEqual(message.payload.encrypted, true);
    assert.strictEqual(
      Encryption.decryptMessage(message.payload.text, sharedKey),
      'hello group',
      'Group messages should be AES encrypted per peer'
    );
  });
}

function run() {
  testEncryptionRoundTrip();
  testDirectMessageUsesEncryption();
  testGroupMessageTargetsAllOnlinePeers();
  console.log('All tests passed');
}

run();
