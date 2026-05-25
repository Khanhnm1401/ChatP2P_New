# P2P Secure Chat System for Students

A complete peer-to-peer (P2P) chat system for students with decentralized architecture, end-to-end encryption, and real-time communication.

## Key Features

- **Decentralized P2P Chat**: Direct communication between peers without complete dependence on a central server
- **Secure Encryption**: RSA + AES encryption to protect user privacy
- **Peer Discovery**: Automatic bootstrap system to discover new peers
- **Group Chat**: Support for group messages via broadcast
- **Reliable Messaging**: ACK + Retry mechanism to guarantee delivery
- **Online/Offline Status**: Automatic tracking via heartbeat
- **Web Interface**: Modern interface for chatting

## Requirements

- Node.js >= 14.0.0
- npm

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start All Services

**Quick Start (Recommended) - All Platforms:**
```bash
npm start
```

This will start all 3 services (Bootstrap, Peers, Web UI) automatically.


**Manual Start (separate terminals):**
```bash
# Terminal 1: Bootstrap Server
npm run start:bootstrap

# Terminal 2: Test Peers (after 2 seconds)
node src/peer-node/test-peers.js

# Terminal 3: Web UI (after 3 seconds)
node src/ui/server.js
```

### 3. Access Web Interface

Open your browser at `http://localhost:8080`

The project now uses a single web interface on port `8080`. Any older UI entrypoint on port `9090` is legacy-only and redirects back to `8080`.

## Project Structure

```
ChatP2P/
├── src/
│   ├── bootstrap-server/
│   │   └── server.js          # Bootstrap server for peer discovery
│   ├── peer-node/
│   │   ├── peer.js            # Peer node implementation
│   │   └── test-peers.js      # Test peer instances
│   ├── common/
│   │   ├── constants.js       # Global constants
│   │   ├── encryption.js      # RSA + AES module
│   │   └── utils.js           # Utility functions
│   └── ui/
│       ├── index.html         # Main web interface on port 8080
│       ├── server.js          # Main web server
│       └── peer-ui-server.js  # Legacy redirect to port 8080
├── package.json
├── start-all.js               # Script to start all services
├── bussiness_plan.md          # Business plan
├── technical_plan.md          # Technical plan
└── README.md
```

## Ports Used

- **5000**: Bootstrap Server (WebSocket)
- **3001**: Peer A
- **3002**: Peer B
- **3003**: Peer C
- **8080**: Main Web UI (HTTP)

## System Architecture

```
        +----------------------+
        |   Bootstrap Server   |
        |    (Peer Discovery)  |
        +----------------------+
                  |
    ---------------------------------
    |               |               |
+--------+     +--------+     +--------+
| Peer A |<--->| Peer B |<--->| Peer C |
+--------+     +--------+     +--------+
    |               |               |
    ---- Web UI (HTTP) ----
```

## Security & Encryption

### Hybrid Encryption Approach

The system uses RSA-2048 for key exchange and AES-256 for message encryption.

**Step 1: RSA Key Exchange**
- Each peer generates a unique RSA-2048 key pair
- Public keys are exchanged over WebSocket
- Private keys are never transmitted

**Step 2: AES Key Establishment**
- One peer generates an AES-256 shared key
- This key is encrypted using the other peer's RSA public key
- The encrypted AES key is sent securely
- The recipient decrypts it using their RSA private key

**Step 3: Message Encryption**
- All subsequent messages are encrypted with the shared AES-256 key
- Each message includes an IV (Initialization Vector) for security
- Messages are decrypted locally before display

### Security Guarantees

- **Confidentiality**: Messages encrypted end-to-end
- **Integrity**: Message IDs track delivery
- **Replay Protection**: Timestamps included in messages
- **No Central Storage**: Messages never stored on bootstrap server

## Message Flow

### 1. Direct Chat (1-to-1)

```
Peer A → [Encrypted] → Peer B
         ← [ACK]     ←
```

### 2. Group Chat (Broadcast)

```
Peer A → Peer B
      ↘ Peer C
       ↘ Peer D
```

### 3. Key Exchange

```
1. Peer A sends RSA public key
2. Peer B generates AES key
3. Peer B encrypts AES with Peer A's RSA public key
4. Peer A decrypts AES
5. Both can now encrypt/decrypt messages
```

## Testing

The system includes 3 test peers that communicate automatically:

```bash
node src/peer-node/test-peers.js
```

You'll see logs like:
```
[Peer_A] Connected to bootstrap server
[Peer_B] Connected to bootstrap server
[Peer_C] Connected to bootstrap server
[Peer_A] Connected to peer Peer_B
[Peer_A] Sent message to Peer_B: Hello from Peer A!
```

## Implemented Features

| Requirement | Implementation |
|-------------|---|
| P2P Model | Direct WebSocket between peers |
| Peer Discovery | Bootstrap Server with HTTP/WS registration |
| Direct Chat | Point-to-point messages |
| Group Chat | Broadcast to multiple peers |
| Online/Offline | Heartbeat every 10 seconds, timeout 30s |
| Reliable Messaging | ACK + Retry (max 3 attempts) |
| Security | RSA (2048 bits) + AES-256 |
| Web Interface | HTML5 + CSS + JavaScript |
| Concurrency | Event-driven (Node.js) |

## Message Types

```json
{
  "type": "CHAT|GROUP_CHAT|REGISTER|HEARTBEAT|ACK",
  "from": "Peer_A",
  "to": "Peer_B",
  "timestamp": 1234567890,
  "message_id": "uuid",
  "payload": "encrypted_data"
}
```

## Bootstrap Server API

### HTTP REST

- `GET /health` - Server status
- `GET /peers` - List all online peers
- `GET /peer/:peer_id` - Specific peer information

### WebSocket

- `REGISTER` - Register new peer
- `PEER_LIST` - Receive peer list
- `HEARTBEAT` - Keep connection alive
- `DISCONNECT` - Disconnect gracefully

## Error Handling

The system implements:

- **Automatic Reconnection**: Peers reconnect if they lose bootstrap connection
- **Message Retries**: Retries up to 3 times if no ACK received
- **Heartbeat Timeout**: Marks peers as offline after 30 seconds
- **Data Validation**: Verifies message integrity

## Monitoring

Check bootstrap server status:
```bash
curl http://localhost:5000/health
curl http://localhost:5000/peers
```

Check peer information:
```bash
curl http://localhost:3001/info
```

## Technical Documentation

- [Installation Guide](INSTALL.md)
- [Project Guide](GUIDE.md)  
- [API Documentation](API.md)
- [Technical Plan](technical_plan.md)
- [Business Plan](bussiness_plan.md)

## Use Cases

1. **Classroom Group Chat**: Students in the same class share messages without depending on internet
2. **LAN Communication**: Collaborative work on local network
3. **Academic Chat**: Private and secure study groups
4. **Distributed System**: Educational demo of P2P architecture

## Current Limitations

- Messages do not persist (lost on restart)
- Web interface is basic (not integrated with real WebSocket)
- Single bootstrap server (no replication)
- No user authentication
- No chat history

## Future Improvements

- [ ] Message persistence in database
- [ ] Real WebSocket integration in web interface
- [ ] Multiple bootstrap servers (replication)
- [ ] JWT token authentication
- [ ] Historical message search
- [ ] Real-time notifications
- [ ] File sharing support
- [ ] P2P Video/Audio

## License

MIT


