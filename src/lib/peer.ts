import { Peer, type DataConnection, type MediaConnection } from 'peerjs';
import { db } from './db';
import { decryptMessage } from './crypto';

class GhostPeer {
  peer: Peer | null = null;
  connections: Map<string, DataConnection> = new Map();
  onMessage: ((chatId: string, text: string) => void) | null = null;
  onCall: ((stream: MediaStream) => void) | null = null;

  init(id?: string) {
    this.peer = new Peer(id, {
      debug: 1
    });

    this.peer.on('error', (err: any) => {
      console.error('PeerJS Error:', err);
      if (err.type === 'unavailable-id') {
        console.warn('Peer ID taken, retrying with fresh identity...');
        localStorage.removeItem('ghost_peer_id');
        // Re-initialize without an ID to let server generate one
        this.init();
      }
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });

    this.peer.on('call', (call) => {
      // Auto-answer logic or UI prompt
      this.onCallIncoming?.(call);
    });

    return new Promise((resolve) => {
      this.peer?.on('open', (id) => resolve(id));
    });
  }

  onCallIncoming: ((call: MediaConnection) => void) | null = null;

  setupConnection(conn: DataConnection) {
    conn.on('open', () => {
      console.log('Connection established with:', conn.peer);
      this.connections.set(conn.peer, conn);
    });

    conn.on('data', async (data: any) => {
      console.log('Received data:', data);
      const { type, payload, rid, senderName } = data;

      if (type === 'handshake') {
        // Receiver tells initiator who they are and which room they are joining
        const chat = await db.conversations.get(rid);
        if (chat && chat.partnerUid === 'waiting') {
          await db.conversations.update(rid, {
            partnerUid: conn.peer,
            partnerName: senderName || chat.partnerName,
            updatedAt: Date.now()
          });
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

          // Show browser notification if permitted
          if (Notification.permission === 'granted') {
            new Notification(`DIAG_UPDATE: ${chat.partnerName}`, {
              body: "NEW_DATA_FRAME_RECEIVED",
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
    if (!this.peer || this.connections.has(peerId)) return;
    const conn = this.peer.connect(peerId);
    this.setupConnection(conn);
    
    conn.on('open', () => {
      // Send handshake so initiator knows who joined which room
      conn.send({ 
        type: 'handshake', 
        rid: roomId, 
        senderName: `PEER_${this.peer?.id.substring(0, 4)}` 
      });
    });
    return conn;
  }

  async sendMessage(peerId: string, roomId: string, encryptedText: string) {
    let conn = this.connections.get(peerId);
    
    const send = (c: DataConnection) => {
      c.send({ type: 'message', payload: encryptedText, rid: roomId });
    };

    if (conn && conn.open) {
      send(conn);
    } else {
      console.log('Reconnecting to peer:', peerId);
      conn = this.peer?.connect(peerId);
      if (conn) {
        this.setupConnection(conn);
        conn.on('open', () => send(conn!));
      }
    }
  }

  async callPeer(peerId: string, stream: MediaStream) {
    if (!this.peer) return;
    return this.peer.call(peerId, stream);
  }
}

export const ghostPeer = new GhostPeer();
