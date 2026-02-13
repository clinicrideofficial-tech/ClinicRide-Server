import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

interface AuthenticatedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
  role?: string;
  bookingId?: string;
  isAuthInProgress: boolean;
  pendingMessages: string[];
}

interface LocationUpdate {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number;
  heading?: number;
}

interface WSMessage {
  type: 'auth' | 'join_booking' | 'location_update' | 'ping';
  token?: string;
  bookingId?: string;
  location?: LocationUpdate;
}

// Global reference
let wssInstance: WebSocketServer | null = null;
const bookingConnections = new Map<string, Set<AuthenticatedWebSocket>>();

export function setupWebSocketServer(server: any) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssInstance = wss;

  const interval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      const socket = ws as AuthenticatedWebSocket;
      if (socket.isAlive === false) return socket.terminate();
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    ws.isAlive = true;
    ws.isAuthInProgress = false;
    ws.pendingMessages = [];
    
    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', async (data: Buffer) => {
      try {
        const rawMessage = data.toString();
        const message: WSMessage = JSON.parse(rawMessage);

        // If not authenticated and not an auth message, queue it
        if (!ws.userId && message.type !== 'auth' && message.type !== 'ping') {
          ws.pendingMessages.push(rawMessage);
          return;
        }

        switch (message.type) {
          case 'auth':
            await handleAuth(ws, message.token);
            break;
          case 'join_booking':
            handleJoinBooking(ws, message.bookingId);
            break;
          case 'location_update':
            handleLocationUpdate(ws, message.location);
            break;
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch (error) {
        console.error('WebSocket Error:', error);
      }
    });

    ws.on('close', () => handleDisconnect(ws));
    ws.on('error', () => handleDisconnect(ws));
  });

  async function handleAuth(ws: AuthenticatedWebSocket, token?: string) {
    if (!token || ws.isAuthInProgress) return;
    ws.isAuthInProgress = true;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      ws.userId = decoded.id; // Corrected from decoded.userId
      ws.role = decoded.role;

      ws.send(JSON.stringify({
        type: 'authenticated',
        userId: ws.userId,
        role: ws.role,
      }));

      // Process pending messages
      while (ws.pendingMessages.length > 0) {
        const msgStr = ws.pendingMessages.shift();
        if (msgStr) ws.emit('message', Buffer.from(msgStr));
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
    } finally {
      ws.isAuthInProgress = false;
    }
  }

  function handleJoinBooking(ws: AuthenticatedWebSocket, bookingId?: string) {
    if (!ws.userId || !bookingId) return;

    if (ws.bookingId && ws.bookingId !== bookingId) {
      bookingConnections.get(ws.bookingId)?.delete(ws);
    }

    ws.bookingId = bookingId;
    if (!bookingConnections.has(bookingId)) {
      bookingConnections.set(bookingId, new Set());
    }
    bookingConnections.get(bookingId)!.add(ws);

    ws.send(JSON.stringify({ type: 'joined_booking', bookingId }));
    console.log(`👤 User ${ws.userId} joined booking ${bookingId}`);
  }

  function handleLocationUpdate(ws: AuthenticatedWebSocket, location?: LocationUpdate) {
    if (!ws.userId || !ws.bookingId || !location) return;

    const connections = bookingConnections.get(ws.bookingId);
    if (!connections) return;

    const payload = JSON.stringify({
      type: 'location_updated',
      userId: ws.userId,
      role: ws.role,
      location: { ...location, timestamp: Date.now() }
    });

    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client !== ws) {
        client.send(payload);
      }
    });
  }

  function handleDisconnect(ws: AuthenticatedWebSocket) {
    if (ws.bookingId) {
      bookingConnections.get(ws.bookingId)?.delete(ws);
      if (bookingConnections.get(ws.bookingId)?.size === 0) {
        bookingConnections.delete(ws.bookingId);
      }
    }
  }

  return wss;
}

export function broadcastToBooking(bookingId: string, payload: any) {
  const connections = bookingConnections.get(bookingId);
  if (!connections) return;
  const message = JSON.stringify(payload);
  connections.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

export function broadcastToUser(userId: string, payload: any) {
  if (!wssInstance) return;
  const message = JSON.stringify(payload);
  wssInstance.clients.forEach((client: any) => {
    if (client.userId === userId && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function broadcastToRole(role: string, payload: any) {
  if (!wssInstance) return;
  const message = JSON.stringify(payload);
  wssInstance.clients.forEach((client: any) => {
    if (client.role === role && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
