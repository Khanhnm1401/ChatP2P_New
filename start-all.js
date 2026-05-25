#!/usr/bin/env node

/**
 * Launcher script to start all services
 */

const { spawn } = require('child_process');
const path = require('path');

let processes = [];

function startService(name, script, args = []) {
  console.log(`\n▶ Starting ${name}...`);

  const proc = spawn('node', [script, ...args], {
    stdio: 'inherit',
    cwd: __dirname
  });

  proc.on('error', (error) => {
    console.error(`✗ Error starting ${name}:`, error);
  });

  processes.push(proc);
  return proc;
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║   P2P SECURE CHAT SYSTEM - All Services Launcher        ║
╚══════════════════════════════════════════════════════════╝
  `);

  // Start Bootstrap Server
  startService('Bootstrap Server', path.join(__dirname, 'src/bootstrap-server/server.js'));

  // Wait a bit for bootstrap to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Start Test Peers
  startService('Test Peers', path.join(__dirname, 'src/peer-node/test-peers.js'));

  // Start Web UI Server
  await new Promise(resolve => setTimeout(resolve, 1000));
  startService('Web UI Server', path.join(__dirname, 'src/ui/server.js'));

  console.log(`
╔══════════════════════════════════════════════════════════╗
║              Services Started Successfully!             ║
║                                                          ║
║  Bootstrap Server: ws://localhost:5000                  ║
║  Peer A:          ws://localhost:3001                   ║
║  Peer B:          ws://localhost:3002                   ║
║  Peer C:          ws://localhost:3003                   ║
║  Web UI:          http://localhost:8080                 ║
║                                                          ║
║  Open http://localhost:8080 in your browser!           ║
╚══════════════════════════════════════════════════════════╝
  `);

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down all services...');
    processes.forEach(proc => {
      try {
        proc.kill('SIGTERM');
      } catch (error) {
        // Process already dead
      }
    });
    setTimeout(() => process.exit(0), 1000);
  });
}

main().catch(console.error);
