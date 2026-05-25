/**
 * Utility functions
 */

const { v4: uuidv4 } = require('uuid');

class Utils {
  /**
   * Generate unique message ID
   */
  static generateMessageId() {
    return uuidv4();
  }

  /**
   * Get current timestamp
   */
  static getTimestamp() {
    return Date.now();
  }

  /**
   * Create message object
   */
  static createMessage(type, from, to, payload, messageId = null) {
    return {
      type,
      from,
      to,
      timestamp: this.getTimestamp(),
      message_id: messageId || this.generateMessageId(),
      payload
    };
  }

  /**
   * Parse JSON safely
   */
  static parseJSON(data) {
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Error parsing JSON:', error);
      return null;
    }
  }

  /**
   * Validate peer info
   */
  static validatePeerInfo(peerInfo) {
    const required = ['peer_id', 'ip', 'port', 'public_key'];
    return required.every(field => peerInfo[field] !== undefined && peerInfo[field] !== null);
  }
}

module.exports = Utils;
