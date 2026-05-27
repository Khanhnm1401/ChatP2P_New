/**
 * Peer Node for P2P Chat System
 * Each peer can act as both client and server
 */

const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { MESSAGE_TYPES, STATUS, HEARTBEAT_INTERVAL, MESSAGE_RETRY_LIMIT, MESSAGE_RETRY_TIMEOUT } = require('../common/constants');
const Encryption = require('../common/encryption');
const Utils = require('../common/utils');

class PeerNode {
  constructor(peerId, port = 3001, bootstrapUrl = 'ws://localhost:5000') {
    this.peerId = peerId;
    this.port = port;
    this.bootstrapUrl = bootstrapUrl;

    // Peer info
    this.peerList = new Map();
    this.sharedKeys = new Map(); // peer_id -> shared_aes_key
    this.peerPublicKeys = new Map(); // peer_id -> public_key

    // Message tracking
    this.pendingMessages = new Map(); // message_id -> { message, retries }
    this.receivedMessages = new Set();
    this.messageHistory = []; // Array of {from, to, message, timestamp, type, encrypted}
    this.maxMessages = 100; // Limit message history
    this.connectionAttempts = new Map(); // peer_id -> connection in progress
    this.lastUiActivityAt = 0;

    // Connections to other peers
    this.peerConnections = new Map(); // peer_id -> websocket

    // RSA key pair
    const { publicKey, privateKey } = Encryption.generateKeyPair();
    this.publicKeyPem = publicKey;
    this.privateKeyPem = privateKey;

    // Express app for when this peer acts as server
    this.app = express();
    this.setupRoutes();
  }

  /**
   * Setup Express routes
   */
  setupRoutes() {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      this.markUiActivity();
      next();
    });
    this.app.use(express.static(path.join(__dirname, '..', 'ui')));

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'ui', 'index.html'));
    });

    this.app.get('/info', (req, res) => {
      const peers = Array.from(this.peerList.values()).map(p => ({
        peer_id: p.peer_id,
        port: p.port,
        ip: p.ip,
        status: p.ui_active === true ? STATUS.ONLINE : STATUS.OFFLINE
      }));

      res.json({
        peerId: this.peerId,
        peers,
        messageCount: this.messageHistory.length
      });
    });

    this.app.get('/peers', (req, res) => {
      const peers = Array.from(this.peerList.values()).map(p => ({
        peer_id: p.peer_id,
        port: p.port,
        status: p.ui_active === true ? STATUS.ONLINE : STATUS.OFFLINE
      }));

      res.json(peers);
    });

    this.app.post('/send', (req, res) => {
      const { to, message, isGroup = false, recipients = [] } = req.body;

      if (!message || (!to && !isGroup)) {
        return res.status(400).json({ error: 'Missing target or message' });
      }

      try {
        if (isGroup) {
          const result = this.sendGroupMessage(recipients, message);
          return res.json({
            success: true,
            from: this.peerId,
            to: 'GROUP',
            recipients: result.recipients,
            message
          });
        }

        this.sendMessage(to, message, false);
        res.json({
          success: true,
          from: this.peerId,
          to,
          message
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/messages', (req, res) => {
      res.json({
        messages: this.messageHistory.slice(-100)
      });
    });

    this.app.get('/messages/group/all', (req, res) => {
      res.json({
        messages: this.messageHistory
          .filter(message => message.type === 'GROUP_CHAT')
          .slice(-100),
        myId: this.peerId
      });
    });

    this.app.get('/messages/:peerId', (req, res) => {
      const { peerId } = req.params;
      const filtered = this.messageHistory.filter(m =>
        (m.from === this.peerId && m.to === peerId) ||
        (m.from === peerId && m.to === this.peerId) ||
        (m.type === 'GROUP_CHAT' && (m.from === peerId || m.from === this.peerId))
      );

      res.json({
        messages: filtered.slice(-50),
        myId: this.peerId
      });
    });
  }

  /**
   * Start peer node
   */
  start(existingServer = null) {
    // Start HTTP server or attach to an existing one
    const server = existingServer || http.createServer(this.app);
    this.wsServer = new WebSocket.Server({ server });

    this.wsServer.on('connection', (socket) => {
      console.log(`[${this.peerId}] New peer connection received`);

      socket.on('message', (message) => {
        this.handlePeerMessage(socket, message);
      });

      socket.on('close', () => {
        console.log(`[${this.peerId}] Peer connection closed`);
      });

      socket.on('error', (error) => {
        console.error(`[${this.peerId}] WebSocket error:`, error.message);
      });
    });

    if (!existingServer) {
      server.listen(this.port, () => {
        console.log(`\n✓ Peer [${this.peerId}] started on ws://localhost:${this.port}`);
      });
    } else {
      console.log(`\n✓ Peer [${this.peerId}] attached to existing HTTP server on port ${this.port}`);
    }

    // Connect to bootstrap server
    setTimeout(() => {
      this.connectToBootstrap();
    }, 1000);

    return server;
  }

  /**
   * Connect to bootstrap server
   */
  connectToBootstrap() {
    try {
      this.bootstrapSocket = new WebSocket(this.bootstrapUrl);

      this.bootstrapSocket.on('open', () => {
        console.log(`[${this.peerId}] Connected to bootstrap server`);
        this.registerWithBootstrap();
        this.startHeartbeat();
      });

      this.bootstrapSocket.on('message', (data) => {
        this.handleBootstrapMessage(data);
      });

      this.bootstrapSocket.on('close', () => {
        console.log(`[${this.peerId}] Disconnected from bootstrap server`);
        setTimeout(() => this.connectToBootstrap(), 5000);
      });

      this.bootstrapSocket.on('error', (error) => {
        console.error(`[${this.peerId}] Bootstrap connection error:`, error.message);
      });
    } catch (error) {
      console.error(`[${this.peerId}] Error connecting to bootstrap:`, error);
    }
  }

  /**
   * Register with bootstrap server
   */
  registerWithBootstrap() {
    const message = Utils.createMessage(
      MESSAGE_TYPES.REGISTER,
      this.peerId,
      'bootstrap',
      {
        ip: 'localhost',
        port: this.port,
        public_key: this.publicKeyPem,
        ui_active: this.isUiActive()
      }
    );

    this.bootstrapSocket.send(JSON.stringify(message));
    console.log(`[${this.peerId}] Sent registration to bootstrap`);
  }

  /**
   * Handle messages from bootstrap server
   */
  handleBootstrapMessage(data) {
    const message = Utils.parseJSON(data);
    if (!message) return;

    switch (message.type) {
      case MESSAGE_TYPES.PEER_LIST:
        this.handlePeerList(message);
        break;
      case 'PEER_JOINED':
        this.handlePeerJoined(message);
        break;
      case MESSAGE_TYPES.PEER_STATUS_UPDATE:
        this.handlePeerStatusUpdate(message);
        break;
      case 'PEER_LEFT':
        this.handlePeerLeft(message);
        break;
      default:
        console.log(`[${this.peerId}] Unknown message from bootstrap:`, message.type);
    }
  }

  /**
   * Handle peer list from bootstrap
   */
  handlePeerList(message) {
    const { peers } = message.payload;
    console.log(`[${this.peerId}] Received peer list: ${peers.length} peers`);

    peers.forEach(peer => {
      peer.status = peer.status || STATUS.ONLINE;
      peer.ui_active = peer.ui_active === true;
      this.peerList.set(peer.peer_id, peer);
      if (peer.public_key) {
        this.peerPublicKeys.set(peer.peer_id, peer.public_key);
      }
    });

    // Connect to all peers
    peers.forEach(peer => {
      this.connectToPeer(peer);
    });
  }

  /**
   * Handle new peer joined
   */
  handlePeerJoined(message) {
    const peer = message.payload;
    console.log(`[${this.peerId}] Peer joined: ${peer.peer_id}`);
    peer.status = STATUS.ONLINE;
    peer.ui_active = peer.ui_active === true;
    this.peerList.set(peer.peer_id, peer);
    if (peer.public_key) {
      this.peerPublicKeys.set(peer.peer_id, peer.public_key);
    }
    this.connectToPeer(peer);
  }

  /**
   * Handle peer left
   */
  handlePeerLeft(message) {
    const peer_id = message.payload.peer_id;
    console.log(`[${this.peerId}] Peer left: ${peer_id}`);
    const peer = this.peerList.get(peer_id);
    if (peer) {
      peer.status = STATUS.OFFLINE;
      this.peerList.set(peer_id, peer);
    }
    this.peerConnections.delete(peer_id);
    this.connectionAttempts.delete(peer_id);
  }

  handlePeerStatusUpdate(message) {
    const { peer_id, ui_active } = message.payload;
    const peer = this.peerList.get(peer_id);

    if (!peer) {
      return;
    }

    peer.ui_active = ui_active === true;
    this.peerList.set(peer_id, peer);
  }

  /**
   * Connect to another peer
   */
  connectToPeer(peerInfo) {
    const { peer_id, ip, port } = peerInfo;

    if (peer_id === this.peerId) return;
    if (this.connectionAttempts.has(peer_id)) return;

    const existingSocket = this.peerConnections.get(peer_id);
    if (existingSocket && existingSocket.readyState === WebSocket.OPEN) return;

    try {
      const peerUrl = `ws://${ip}:${port}`;
      const socket = new WebSocket(peerUrl);
      this.connectionAttempts.set(peer_id, true);

      socket.on('open', () => {
        console.log(`[${this.peerId}] Connected to peer ${peer_id}`);
        this.peerConnections.set(peer_id, socket);
        this.connectionAttempts.delete(peer_id);

        const knownPeer = this.peerList.get(peer_id);
        if (knownPeer) {
          knownPeer.status = STATUS.ONLINE;
          this.peerList.set(peer_id, knownPeer);
        }

        // Exchange public keys
        this.exchangePublicKey(socket, peer_id, peerInfo.public_key);
      });

      socket.on('message', (data) => {
        this.handlePeerMessage(socket, data, peer_id);
      });

      socket.on('close', () => {
        console.log(`[${this.peerId}] Disconnected from peer ${peer_id}`);
        this.peerConnections.delete(peer_id);
        this.connectionAttempts.delete(peer_id);
      });

      socket.on('error', (error) => {
        console.error(`[${this.peerId}] Error connecting to peer ${peer_id}:`, error.message);
        this.peerConnections.delete(peer_id);
        this.connectionAttempts.delete(peer_id);
      });
    } catch (error) {
      console.error(`[${this.peerId}] Error creating peer connection:`, error);
      this.connectionAttempts.delete(peer_id);
    }
  }

  /**
   * Exchange public key with peer
   */
  exchangePublicKey(socket, peerId, peerPublicKey) {
    if (peerPublicKey) {
      this.peerPublicKeys.set(peerId, peerPublicKey);
    }

    const message = Utils.createMessage(
      'PUBLIC_KEY_EXCHANGE',
      this.peerId,
      peerId,
      { public_key: this.publicKeyPem }
    );

    socket.send(JSON.stringify(message));
  }

  /**
   * Handle messages from other peers
   */
  handlePeerMessage(socket, data, senderId = null) {
    const message = Utils.parseJSON(data);
    if (!message) return;

    const from = message.from;

    // Identify sender if not provided
    if (!senderId && from !== this.peerId) {
      senderId = from;
    }

    if (senderId && senderId !== this.peerId) {
      this.peerConnections.set(senderId, socket);

      const knownPeer = this.peerList.get(senderId);
      if (knownPeer) {
        knownPeer.status = STATUS.ONLINE;
        this.peerList.set(senderId, knownPeer);
      }
    }

    switch (message.type) {
      case 'PUBLIC_KEY_EXCHANGE':
        this.handlePublicKeyExchange(message, senderId);
        break;
      case 'AES_KEY_EXCHANGE':
        this.handleAESKeyExchange(message, senderId);
        break;
      case MESSAGE_TYPES.CHAT:
      case MESSAGE_TYPES.GROUP_CHAT:
        this.handleChatMessage(message);
        break;
      case MESSAGE_TYPES.ACK:
        this.handleACK(message);
        break;
      default:
        console.log(`[${this.peerId}] Unknown message from ${senderId}:`, message.type);
    }
  }

  /**
   * Handle public key exchange
   */
  handlePublicKeyExchange(message, peerId) {
    const { public_key } = message.payload;
    console.log(`[${this.peerId}] Received public key from ${peerId}`);
    this.peerPublicKeys.set(peerId, public_key);

    // Generate shared AES key if not exist
    // Only the peer with the larger ID creates the key to avoid conflicts
    if (!this.sharedKeys.has(peerId) && this.peerId > peerId) {
      const aesKey = Encryption.generateAESKey();
      this.sharedKeys.set(peerId, aesKey);

      // Send AES key encrypted with peer's public key
      const encryptedAESKey = Encryption.encryptAESKey(aesKey, public_key);
      const keyExchangeMsg = Utils.createMessage(
        'AES_KEY_EXCHANGE',
        this.peerId,
        peerId,
        { encrypted_aes_key: encryptedAESKey }
      );

      const peerSocket = this.peerConnections.get(peerId);
      if (peerSocket) {
        peerSocket.send(JSON.stringify(keyExchangeMsg));
        this.flushPendingMessagesForPeer(peerId);
      }
    }
  }

  /**
   * Handle AES key exchange
   */
  handleAESKeyExchange(message, peerId) {
    const { encrypted_aes_key } = message.payload;
    const aesKey = Encryption.decryptAESKey(encrypted_aes_key, this.privateKeyPem);

    if (aesKey) {
      this.sharedKeys.set(peerId, aesKey);
      console.log(`[${this.peerId}] AES key established with ${peerId}`);
      this.flushPendingMessagesForPeer(peerId);
    }
  }

  /**
   * Handle incoming chat message
   */
  handleChatMessage(message) {
    const { from, message_id, payload, type } = message;

    // Check if already received (deduplication)
    if (this.receivedMessages.has(message_id)) {
      return;
    }

    this.receivedMessages.add(message_id);

    // Extract text and encryption flag from payload
    let messageText = payload;
    let isEncrypted = false;

    if (payload && typeof payload === 'object' && payload.text !== undefined) {
      messageText = payload.text;
      isEncrypted = payload.encrypted === true;
    }

    // Get shared key for decryption
    const aesKey = this.sharedKeys.get(from);
    let decryptedPayload = messageText; // default: raw payload
    let wasEncrypted = false;

    // Only attempt decrypt if payload was marked as encrypted AND we have a shared key
    if (isEncrypted && aesKey && messageText && typeof messageText === 'string') {
      try {
        // Check if messageText is encrypted JSON format {iv, data}
        const parsed = JSON.parse(messageText);
        if (parsed && parsed.iv && parsed.data) {
          const decrypted = Encryption.decryptMessage(messageText, aesKey);
          if (decrypted !== null && decrypted !== undefined) {
            decryptedPayload = decrypted;
            wasEncrypted = true;
          } else {
            // Decrypt returned null — fallback to raw payload
            console.warn(`[${this.peerId}] Decrypt returned null from ${from}, using raw payload`);
            decryptedPayload = messageText;
          }
        }
      } catch (e) {
        // If encrypted flag is set but decrypt fails, log it
        console.error(`[${this.peerId}] Error decrypting message from ${from}:`, e.message);
        decryptedPayload = '[Tin nhắn không đọc được]';
      }
    }

    // Ensure we never store null/undefined as message content
    if (decryptedPayload === null || decryptedPayload === undefined) {
      decryptedPayload = '[Tin nhắn không đọc được]';
    }

    // Display message
    const typeLabel = type === MESSAGE_TYPES.GROUP_CHAT ? '[GROUP]' : '[PRIVATE]';
    console.log(`[${this.peerId}] ${typeLabel} From ${from}: ${decryptedPayload}`);

    // Store in message history
    this.messageHistory.push({
      from,
      to: this.peerId,
      message: decryptedPayload,
      timestamp: Date.now(),
      type: type === MESSAGE_TYPES.GROUP_CHAT ? 'GROUP_CHAT' : 'PRIVATE',
      encrypted: wasEncrypted,
      message_id
    });

    // Keep only last 100 messages
    if (this.messageHistory.length > this.maxMessages) {
      this.messageHistory.shift();
    }

    // Send ACK
    this.sendACK(from, message_id);
  }

  /**
   * Handle ACK
   */
  handleACK(message) {
    const ackedMessageId = message.payload && message.payload.acked_message_id
      ? message.payload.acked_message_id
      : message.message_id;
    const pending = this.pendingMessages.get(ackedMessageId);

    if (pending) {
      this.pendingMessages.delete(ackedMessageId);
      console.log(`[${this.peerId}] Received ACK for message ${ackedMessageId}`);
    }
  }

  /**
   * Send message to specific peer
   */
  sendMessage(toPeerId, messageText, isGroupChat = false) {
    if (isGroupChat) {
      return this.sendGroupMessage([], messageText);
    }

    const messageId = Utils.generateMessageId();
    this.storeMessageHistory({
      from: this.peerId,
      to: toPeerId,
      message: messageText,
      timestamp: Date.now(),
      type: 'PRIVATE',
      encrypted: true,
      message_id: messageId
    });

    this.pendingMessages.set(messageId, {
      messageId,
      text: messageText,
      retries: 0,
      targetPeer: toPeerId,
      type: MESSAGE_TYPES.CHAT
    });

    this.attemptPendingDelivery(messageId);
    this.setupRetry(messageId);
    return messageId;
  }

  /**
   * Send one group message to multiple peers
   */
  sendGroupMessage(recipients, messageText) {
    const resolvedRecipients = (Array.isArray(recipients) && recipients.length > 0
      ? recipients
      : Array.from(this.peerList.values())
          .filter(peer => peer.status !== STATUS.OFFLINE)
          .map(peer => peer.peer_id))
      .filter(peerId => peerId && peerId !== this.peerId);

    if (resolvedRecipients.length === 0) {
      throw new Error('Không có peer online để nhận group message');
    }

    const timestamp = Date.now();
    const groupId = `group-${timestamp}`;

    this.storeMessageHistory({
      from: this.peerId,
      to: 'GROUP',
      message: messageText,
      timestamp,
      type: 'GROUP_CHAT',
      encrypted: true,
      message_id: groupId,
      recipients: resolvedRecipients
    });

    resolvedRecipients.forEach(peerId => {
      const messageId = Utils.generateMessageId();
      this.pendingMessages.set(messageId, {
        messageId,
        text: messageText,
        retries: 0,
        targetPeer: peerId,
        type: MESSAGE_TYPES.GROUP_CHAT,
        groupId,
        recipients: resolvedRecipients
      });

      this.attemptPendingDelivery(messageId);
      this.setupRetry(messageId);
    });

    return {
      groupId,
      recipientCount: resolvedRecipients.length,
      recipients: resolvedRecipients
    };
  }

  /**
   * Send message to socket
   */
  sendToSocket(toPeerId, message) {
    const socket = this.peerConnections.get(toPeerId);

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      console.log(`[${this.peerId}] Sent message to ${toPeerId}`);
      return true;
    }

    console.warn(`[${this.peerId}] Cannot send to ${toPeerId} (not connected)`);
    return false;
  }

  /**
   * Setup retry for unacknowledged messages
   */
  setupRetry(messageId) {
    setTimeout(() => {
      const pending = this.pendingMessages.get(messageId);

      if (pending) {
        pending.retries++;

        if (pending.retries < MESSAGE_RETRY_LIMIT) {
          console.log(`[${this.peerId}] Retrying message ${messageId} (attempt ${pending.retries})`);
          this.attemptPendingDelivery(messageId);
          this.setupRetry(messageId);
        } else {
          console.warn(`[${this.peerId}] Message ${messageId} failed after ${MESSAGE_RETRY_LIMIT} retries`);
          this.pendingMessages.delete(messageId);
        }
      }
    }, MESSAGE_RETRY_TIMEOUT);
  }

  /**
   * Send ACK
   */
  sendACK(toPeerId, messageId) {
    const ackMessage = Utils.createMessage(
      MESSAGE_TYPES.ACK,
      this.peerId,
      toPeerId,
      { acked_message_id: messageId },
      messageId
    );

    const socket = this.peerConnections.get(toPeerId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(ackMessage));
    }
  }

  /**
   * Attempt to deliver a pending message when the peer connection is ready
   */
  attemptPendingDelivery(messageId) {
    const pending = this.pendingMessages.get(messageId);
    if (!pending) {
      return false;
    }

    const peerInfo = this.peerList.get(pending.targetPeer);
    if (!peerInfo) {
      console.warn(`[${this.peerId}] Unknown peer ${pending.targetPeer}`);
      return false;
    }

    this.ensurePeerConnection(peerInfo);

    const sharedKey = this.sharedKeys.get(pending.targetPeer);
    if (!sharedKey) {
      const peerSocket = this.peerConnections.get(pending.targetPeer);
      const peerPublicKey = this.peerPublicKeys.get(pending.targetPeer) || peerInfo.public_key;

      if (peerSocket && peerSocket.readyState === WebSocket.OPEN && peerPublicKey) {
        this.exchangePublicKey(peerSocket, pending.targetPeer, peerPublicKey);
      }

      return false;
    }

    const encryptedPayload = Encryption.encryptMessage(pending.text, sharedKey);
    if (!encryptedPayload) {
      console.warn(`[${this.peerId}] Failed to encrypt message ${messageId}`);
      return false;
    }

    const payload = {
      text: encryptedPayload,
      encrypted: true
    };

    if (pending.groupId) {
      payload.group_id = pending.groupId;
      payload.recipients = pending.recipients || [];
    }

    const message = Utils.createMessage(
      pending.type,
      this.peerId,
      pending.targetPeer,
      payload,
      messageId
    );

    return this.sendToSocket(pending.targetPeer, message);
  }

  ensurePeerConnection(peerInfo) {
    const socket = this.peerConnections.get(peerInfo.peer_id);
    if (socket && socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.connectToPeer(peerInfo);
  }

  flushPendingMessagesForPeer(peerId) {
    this.pendingMessages.forEach((pending, messageId) => {
      if (pending.targetPeer === peerId) {
        this.attemptPendingDelivery(messageId);
      }
    });
  }

  storeMessageHistory(message) {
    this.messageHistory.push(message);

    if (this.messageHistory.length > this.maxMessages) {
      this.messageHistory.shift();
    }
  }

  /**
   * Start heartbeat to bootstrap server
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.bootstrapSocket && this.bootstrapSocket.readyState === WebSocket.OPEN) {
        const heartbeat = Utils.createMessage(
          MESSAGE_TYPES.HEARTBEAT,
          this.peerId,
          'bootstrap',
          {
            ui_active: this.isUiActive()
          }
        );

        this.bootstrapSocket.send(JSON.stringify(heartbeat));
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  markUiActivity() {
    this.lastUiActivityAt = Date.now();
    this.notifyBootstrapUiState();
  }

  isUiActive() {
    return Date.now() - this.lastUiActivityAt < HEARTBEAT_INTERVAL * 2;
  }

  notifyBootstrapUiState() {
    if (!this.bootstrapSocket || this.bootstrapSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const heartbeat = Utils.createMessage(
      MESSAGE_TYPES.HEARTBEAT,
      this.peerId,
      'bootstrap',
      {
        ui_active: this.isUiActive()
      }
    );

    this.bootstrapSocket.send(JSON.stringify(heartbeat));
  }
}

module.exports = PeerNode;
