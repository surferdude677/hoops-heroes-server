// Hoops Heroes Multiplayer Server
// Deploy on Render/Railway: node server.js
// Requires: npm install ws

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hoops Heroes Server Running');
});

const wss = new WebSocket.Server({ server });

// rooms[code] = { host: ws, guest: ws | null }
const rooms = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on('connection', ws => {
  ws.roomCode = null;
  ws.role = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create') {
      if (ws.roomCode && rooms[ws.roomCode]) {
        delete rooms[ws.roomCode];
      }
      let code = generateCode();
      while (rooms[code]) code = generateCode();
      rooms[code] = { host: ws, guest: null };
      ws.roomCode = code;
      ws.role = 'host';
      send(ws, { type: 'created', code });
    }

    else if (msg.type === 'join') {
      const code = (msg.code || '').toUpperCase().trim();
      const room = rooms[code];
      if (!room) { send(ws, { type: 'error', message: 'Room not found' }); return; }
      if (room.guest) { send(ws, { type: 'error', message: 'Room is full' }); return; }
      room.guest = ws;
      ws.roomCode = code;
      ws.role = 'guest';
      send(ws, { type: 'joined', code });
      send(room.host, { type: 'guest_joined' });
      setTimeout(() => { send(ws, { type: 'start' }); }, 1500);
    }

    else if (msg.type === 'input') {
      const room = rooms[ws.roomCode];
      if (!room) return;
      if (ws.role === 'guest' && room.host) {
        send(room.host, { type: 'input', keys: msg.keys });
      }
    }

    else if (msg.type === 'state') {
      const room = rooms[ws.roomCode];
      if (!room) return;
      if (ws.role === 'host' && room.guest) {
        send(room.guest, { type: 'state', data: msg.data });
      }
    }
  });

  ws.on('close', () => {
    const code = ws.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    if (ws.role === 'host') {
      send(room.guest, { type: 'disconnected', message: 'Host disconnected' });
      delete rooms[code];
    } else if (ws.role === 'guest') {
      send(room.host, { type: 'disconnected', message: 'Guest disconnected' });
      room.guest = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Hoops Heroes server running on port ${PORT}`);
});
