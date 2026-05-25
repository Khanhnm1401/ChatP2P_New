/**
 * Encryption/Decryption Module for P2P Chat
 * Using RSA (key exchange) + AES (message encryption)
 */

const crypto = require('crypto');
const { RSA_KEY_SIZE, AES_ALGORITHM } = require('./constants');

class Encryption {
  /**
   * Generate RSA key pair
   */
  static generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: RSA_KEY_SIZE,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
  }

  /**
   * Generate AES key
   */
  static generateAESKey() {
    return crypto.randomBytes(32);
  }

  /**
   * Encrypt AES key with RSA public key
   */
  static encryptAESKey(aesKey, publicKeyPem) {
    try {
      const publicKey = crypto.createPublicKey({
        key: publicKeyPem,
        format: 'pem'
      });

      const encrypted = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
        },
        aesKey
      );

      return encrypted.toString('base64');
    } catch (error) {
      console.error('Error encrypting AES key:', error);
      return null;
    }
  }

  /**
   * Decrypt AES key with RSA private key
   */
  static decryptAESKey(encryptedAESKey, privateKeyPem) {
    try {
      const privateKey = crypto.createPrivateKey({
        key: privateKeyPem,
        format: 'pem'
      });

      const decrypted = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
        },
        Buffer.from(encryptedAESKey, 'base64')
      );

      return decrypted;
    } catch (error) {
      console.error('Error decrypting AES key:', error);
      return null;
    }
  }

  /**
   * Encrypt message with AES
   */
  static encryptMessage(message, aesKey) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(AES_ALGORITHM, aesKey, iv);

      let encrypted = cipher.update(message, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return JSON.stringify({
        iv: iv.toString('hex'),
        data: encrypted
      });
    } catch (error) {
      console.error('Error encrypting message:', error);
      return null;
    }
  }

  /**
   * Decrypt message with AES
   */
  static decryptMessage(encryptedData, aesKey) {
    try {
      const parsedData = JSON.parse(encryptedData);
      const decipher = crypto.createDecipheriv(
        AES_ALGORITHM,
        aesKey,
        Buffer.from(parsedData.iv, 'hex')
      );

      let decrypted = decipher.update(parsedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Error decrypting message:', error);
      return null;
    }
  }
}

module.exports = Encryption;
