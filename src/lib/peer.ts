import { Peer, type DataConnection, type MediaConnection } from 'peerjs';
import { db } from './db';
import { decryptMessage } from './crypto';

class GhostPeer {
  peer: Peer | null = null;
  connections: Map<string, DataConnection> = new Map();
  onMessage: ((chatId: string, text: string) => void) | null = null;
  onCall: ((stream: MediaStream) => void) | null = null;

  init(id?: string): Promise<string> {
    if (this.peer) {
      this.peer.destroy();
    }

    this.peer = new Peer(id, {
      debug: 1
    });

    this.peer.on('error', (err: any) => {
      console.error('PeerJS Error:', err);
      if (err.type === 'unavailable-id') {
        console.warn('ID collision detected. Nuking instance and retrying...');
        localStorage.removeItem('ghost_peer_id');
        this.init();
      }
      
      // Handle server connection errors
      if (err.type === 'server-error' || err.type === 'network') {
        console.warn('Network or server error. Retrying in 5s...');
        setTimeout(() => {
          if (!this.peer?.open) this.init(id);
        }, 5000);
      }
    });

    this.peer.on('disconnected', () => {
      console.warn('K-BRIDGE SIGNAL LOST. Attempting re-stabilization...');
      // Try to reconnect to PeerServer
      this.peer?.reconnect();
    });

    this.peer.on('close', () => {
      console.error('Kernel connection closed permanently.');
      // Optional: auto-reinit if desired, but close is usually explicit
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });

    this.peer.on('call', (call) => {
      this.onCallIncoming?.(call);
    });

    return new Promise((resolve) => {
      this.peer?.on('open', (newId) => resolve(newId));
    });
  }

  onCallIncoming: ((call: MediaConnection) => void) | null = null;

  setupConnection(conn: DataConnection) {
    const peerId = conn.peer;
    
    conn.on('open', () => {
      console.log('Bridge established with:', peerId);
      this.connections.set(peerId, conn);
    });

    conn.on('data', async (data: any) => {
      console.log('Incoming segment:', data);
      const { type, payload, rid, senderName, senderId } = data;

      if (type === 'handshake') {
        const chat = await db.conversations.get(rid);
        // Link the room to the actual peer ID if it was 'waiting'
        if (chat && (chat.partnerUid === 'waiting' || chat.partnerUid !== peerId)) {
          await db.conversations.update(rid, {
            partnerUid: peerId,
            partnerName: senderName || chat.partnerName,
            updatedAt: Date.now()
          });
        }
        // If we received a handshake, we should probably send one back to confirm
        if (type === 'handshake' && senderId) {
           this.connections.set(senderId, conn);
        }
      }

      if (type === 'message') {
        const chat = await db.conversations.get(rid);
        if (chat && chat.isBlocked === 0) {
          const decrypted = await decryptMessage(payload, chat.encryptionKey);
          
          await db.messages.add({
            conversationId: rid,
            senderUid: conn.peer,
            encryptedText: decrypted,
            timestamp: Date.now(),
            isRead: 0
          });

          await db.conversations.update(rid, {
            lastMessage: decrypted,
            updatedAt: Date.now()
          });

          this.onMessage?.(rid, decrypted);

          if (Notification.permission === 'granted') {
            new Notification(`FLUX_KERNEL: ${chat.partnerName}`, {
              body: "DATA_FRAME_APPENDED",
              icon: '/manifest.json'
            });
          }
        }
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
    });
    
    conn.on('error', (err) => {
      console.error('Conn Error:', err);
      this.connections.delete(conn.peer);
    });
  }

  async connectToPeer(peerId: string, roomId: string) {
    if (!this.peer) return;
    
    // Always try a fresh connection if the current one is stale
    const existing = this.connections.get(peerId);
    if (existing && existing.open) return existing;

    const conn = this.peer.connect(peerId);
    this.setupConnection(conn);
    
    conn.on('open', () => {
      // Send handshake so initiator knows who joined which room
      conn.send({ 
        type: 'handshake', 
        rid: roomId, 
        senderId: this.peer?.id,
        senderName: `PEER_${this.peer?.id.substring(0, 4)}` 
      });
    });
    return conn;
  }

  async sendMessage(peerId: string, roomId: string, encryptedText: string) {
    let conn = this.connections.get(peerId);
    
    const send = (c: DataConnection) => {
      if (c && c.open) {
        c.send({ type: 'message', payload: encryptedText, rid: roomId });
      } else {
        console.warn('Attempted to send over closed connection. Reconnecting...');
        this.connections.delete(peerId);
        this.connectToPeer(peerId, roomId).then(newConn => {
          if (newConn) {
            newConn.on('open', () => {
              newConn.send({ type: 'message', payload: encryptedText, rid: roomId });
            });
          }
        });
      }
    };

    if (conn && conn.open) {
      send(conn);
    } else {
      console.log('Bridge inactive. Initializing tunnel to:', peerId);
      const newConn = await this.connectToPeer(peerId, roomId);
      if (newConn) {
        if (newConn.open) {
          send(newConn);
        } else {
          newConn.on('open', () => send(newConn));
        }
      }
    }
  }

  async callPeer(peerId: string, stream: MediaStream) {
    if (!this.peer) return;
    return this.peer.call(peerId, stream);
  }
}

export const ghostPeer = new GhostPeer();
