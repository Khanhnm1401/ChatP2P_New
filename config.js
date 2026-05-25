/**
 * Configuration file for P2P Chat System
 */

module.exports = {
  // Bootstrap Server Configuration
  bootstrap: {
    port: process.env.BOOTSTRAP_PORT || 5000,
    host: process.env.BOOTSTRAP_HOST || 'localhost',
    heartbeatTimeout: 30000
  },

  // Peer Node Configuration
  peer: {
    defaultBootstrapUrl: process.env.BOOTSTRAP_URL || 'ws://localhost:5000',
    heartbeatInterval: 10000,
    messageRetryLimit: 3,
    messageRetryTimeout: 5000 
  },

  // Encryption Configuration
  encryption: {
    rsaKeySize: 2048,
    algorithm: 'aes-256-cbc',
    saltRounds: 10
  },

  // Web UI Configuration
  ui: {
    port: process.env.UI_PORT || 8080,
    host: process.env.UI_HOST || 'localhost'
  },

  // Test Configuration
  test: {
    bootstrapPort: 5000,
    peerPorts: [3001, 3002, 3003],
    peerIds: ['Peer_A', 'Peer_B', 'Peer_C']
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json'
  }
};
