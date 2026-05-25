/**
 * Bootstrap Server for P2P Chat System
 * Responsible for peer discovery and peer list management
 */

const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const { MESSAGE_TYPES, STATUS, HEARTBEAT_TIMEOUT } = require('../common/constants');
const Utils = require('../common/utils');

class BootstrapServer {
  constructor(port = 5000) {
    this.port = port;
    this.peers = new Map(); // peer_id -> peer_info
    this.heartbeatTimers = new Map();
    this.app = express();
    this.setupRoutes();
  }

  /**
   * Setup Express routes
   */
  setupRoutes() {
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', peers: this.peers.size });
    });

    // Get all online peers
    this.app.get('/peers', (req, res) => {
      const peerList = Array.from(this.peers.values()).map(peer => ({
        peer_id: peer.peer_id,
        ip: peer.ip,
        port: peer.port,
        public_key: peer.public_key,
        status: peer.status,
        ui_active: peer.ui_active === true
      }));
      res.json({ peers: peerList });
    });

    // Get specific peer
    this.app.get('/peer/:peer_id', (req, res) => {
      const peer = this.peers.get(req.params.peer_id);
      if (peer) {
        res.json(peer);
      } else {
        res.status(404).json({ error: 'Peer not found' });
      }
    });
  }

  /**
   * Start server
   */
  start() {
    const server = http.createServer(this.app);
    this.ws = new WebSocket.Server({ server });

    this.ws.on('connection', (socket) => {
      console.log('[Bootstrap] New WebSocket connection');

      socket.on('message', (message) => {
        this.handleMessage(socket, message);
      });

      socket.on('close', () => {
        this.handleDisconnect(socket);
      });

      socket.on('error', (error) => {
        console.error('[Bootstrap] WebSocket error:', error);
      });
    });

    server.listen(this.port, () => {
      console.log(`\n✓ Bootstrap Server started on ws://localhost:${this.port}`);
      console.log(`✓ REST API available at http://localhost:${this.port}\n`);
    });

    return server;
  }

  /**
   * Handle incoming messages
   */
  handleMessage(socket, data) {
    const message = Utils.parseJSON(data);
    if (!message) {
      console.error('[Bootstrap] Invalid message format');
      return;
    }

    console.log(`[Bootstrap] Message: ${message.type} from ${message.from}`);

    switch (message.type) {
      case MESSAGE_TYPES.REGISTER:
        this.handleRegister(socket, message);
        break;
      case MESSAGE_TYPES.HEARTBEAT:
        this.handleHeartbeat(message);
        break;
      case MESSAGE_TYPES.DISCONNECT:
        this.handleDisconnect(socket, message);
        break;
      default:
        console.warn('[Bootstrap] Unknown message type:', message.type);
    }
  }

  /**
   * Handle peer registration
   */
  handleRegister(socket, message) {
    const { from, payload } = message;
    const { ip, port, public_key, ui_active = false } = payload;

    if (!ip || !port || !public_key) {
      this.sendError(socket, 'Missing required fields: ip, port, public_key');
      return;
    }

    const peerInfo = {
      peer_id: from,
      ip,
      port,
      public_key,
      status: STATUS.ONLINE,
      ui_active: ui_active === true,
      socket,
      registered_at: Utils.getTimestamp()
    };

    this.peers.set(from, peerInfo);
    console.log(`[Bootstrap] Peer registered: ${from} at ${ip}:${port}`);

    // Setup heartbeat timeout
    this.setupHeartbeatTimeout(from);

    // Send peer list to registered peer
    const peerList = Array.from(this.peers.values())
      .filter(p => p.peer_id !== from)
      .map(p => ({
        peer_id: p.peer_id,
        ip: p.ip,
        port: p.port,
        public_key: p.public_key,
        status: p.status,
        ui_active: p.ui_active === true
      }));

    const response = Utils.createMessage(
      MESSAGE_TYPES.PEER_LIST,
      'bootstrap',
      from,
      { peers: peerList }
    );

    socket.send(JSON.stringify(response));
    console.log(`[Bootstrap] Sent peer list to ${from}: ${peerList.length} peers`);

    // Broadcast new peer to all other peers
    this.broadcastNewPeer(peerInfo);
  }

  /**
   * Handle heartbeat
   */
  handleHeartbeat(message) {
    const peer_id = message.from;
    const peer = this.peers.get(peer_id);

    if (peer) {
      const nextUiActive = message.payload && message.payload.ui_active === true;
      const shouldBroadcastStatus = peer.ui_active !== nextUiActive;
      peer.status = STATUS.ONLINE;
      peer.ui_active = nextUiActive;
      peer.last_heartbeat = Utils.getTimestamp();
      this.resetHeartbeatTimeout(peer_id);
      console.log(`[Bootstrap] Heartbeat from ${peer_id}`);

      if (shouldBroadcastStatus) {
        this.broadcastPeerStatus(peer_id, nextUiActive);
      }
    }
  }

  /**
   * Handle peer disconnect
   */
  handleDisconnect(socket, message = null) {
    let peer_id = null;

    if (message) {
      peer_id = message.from;
    } else {
      // Find peer by socket
      for (let [id, peer] of this.peers.entries()) {
        if (peer.socket === socket) {
          peer_id = id;
          break;
        }
      }
    }

    if (peer_id) {
      this.peers.delete(peer_id);
      this.heartbeatTimers.delete(peer_id);
      console.log(`[Bootstrap] Peer disconnected: ${peer_id}`);

      // Notify others
      this.broadcastPeerDisconnected(peer_id);
    }
  }

  /**
   * Setup heartbeat timeout for peer
   */
  setupHeartbeatTimeout(peer_id) {
    const timer = setTimeout(() => {
      const peer = this.peers.get(peer_id);
      if (peer) {
        peer.status = STATUS.OFFLINE;
        console.log(`[Bootstrap] Peer ${peer_id} marked as offline (heartbeat timeout)`);
        this.broadcastPeerDisconnected(peer_id);
      }
    }, HEARTBEAT_TIMEOUT);

    this.heartbeatTimers.set(peer_id, timer);
  }

  /**
   * Reset heartbeat timeout
   */
  resetHeartbeatTimeout(peer_id) {
    const oldTimer = this.heartbeatTimers.get(peer_id);
    if (oldTimer) {
      clearTimeout(oldTimer);
    }
    this.setupHeartbeatTimeout(peer_id);
  }

  /**
   * Broadcast new peer to all
   */
  broadcastNewPeer(newPeer) {
    const message = Utils.createMessage(
      'PEER_JOINED',
      'bootstrap',
      'all',
      {
        peer_id: newPeer.peer_id,
        ip: newPeer.ip,
        port: newPeer.port,
        public_key: newPeer.public_key,
        status: newPeer.status,
        ui_active: newPeer.ui_active === true
      }
    );

    this.peers.forEach((peer) => {
      if (peer.peer_id !== newPeer.peer_id && peer.socket && peer.socket.readyState === WebSocket.OPEN) {
        peer.socket.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Broadcast peer disconnection
   */
  broadcastPeerDisconnected(disconnectedPeerId) {
    const message = Utils.createMessage(
      'PEER_LEFT',
      'bootstrap',
      'all',
      { peer_id: disconnectedPeerId }
    );

    this.peers.forEach((peer) => {
      if (peer.socket && peer.socket.readyState === WebSocket.OPEN) {
        peer.socket.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Broadcast peer UI activity status
   */
  broadcastPeerStatus(peerId, isUiActive) {
    const message = Utils.createMessage(
      MESSAGE_TYPES.PEER_STATUS_UPDATE,
      'bootstrap',
      'all',
      {
        peer_id: peerId,
        status: STATUS.ONLINE,
        ui_active: isUiActive === true
      }
    );

    this.peers.forEach((peer) => {
      if (peer.peer_id !== peerId && peer.socket && peer.socket.readyState === WebSocket.OPEN) {
        peer.socket.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Send error message
   */
  sendError(socket, errorMsg) {
    const error = Utils.createMessage(MESSAGE_TYPES.ERROR, 'bootstrap', 'peer', {
      error: errorMsg
    });
    socket.send(JSON.stringify(error));
  }
}

// Start server
if (require.main === module) {
  const bootstrapServer = new BootstrapServer(5000);
  bootstrapServer.start();
}

module.exports = BootstrapServer;
