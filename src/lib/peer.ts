import { Peer, type DataConnection, type MediaConnection } from 'peerjs';
import { db } from './db';
import { decryptMessage } from './crypto';

class GhostPeer {
  peer: Peer | null = null;
  connections: Map<string, DataConnection> = new Map();
  onMessage: ((chatId: string, text: string) => void) | null = null;
  onCall: ((stream: MediaStream) => void) | null = null;

  private initPromise: Promise<string> | null = null;

  init(id?: string): Promise<string> {
    if (this.initPromise && this.peer?.open) return this.initPromise;
    if (this.initPromise && !this.peer?.destroyed) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      const cleanup = () => {
        if (this.peer) {
          try {
            this.peer.off('open');
            this.peer.off('error');
            this.peer.destroy();
            this.peer = null;
          } catch (e) {
            console.error("Cleanup error:", e);
          }
        }
      };

      const generateRandomId = () => `node-${Math.random().toString(36).substring(2, 9)}`;
      
      const attemptInit = (targetId?: string) => {
        cleanup();
        
        this.peer = new Peer(targetId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        const timeout = setTimeout(() => {
          if (this.peer && !this.peer.open) {
            console.warn('Init timeout. Proceeding with current node state.');
            const finalId = this.peer.id || targetId || generateRandomId();
            resolve(finalId);
          }
        }, 12000);

        this.peer.on('open', (newId) => {
          clearTimeout(timeout);
          console.log('Kernel node bridge active:', newId);
          resolve(newId);
        });

        this.peer.on('error', (err: any) => {
          clearTimeout(timeout);
          console.error('PeerJS Fault:', err.type, err.message);

          if (err.type === 'unavailable-id' || err.type === 'invalid-id') {
            localStorage.removeItem('ghost_peer_id');
            const nextId = generateRandomId();
            console.warn('Collision detected. Retrying with:', nextId);
            setTimeout(() => attemptInit(nextId), 500);
          } else {
            // For other errors, we resolve to avoid blocking the app
            const fallback = this.peer?.id || targetId || generateRandomId();
            resolve(fallback);
          }
        });

        this.peer.on('disconnected', () => {
          console.warn('Signal unstable. Attempting reconnection...');
          this.peer?.reconnect();
        });

        this.peer.on('close', () => {
          console.warn('Bridge closed.');
          this.initPromise = null;
        });

        this.peer.on('connection', (conn) => {
          this.setupConnection(conn);
        });

        this.peer.on('call', (call) => {
          if (Notification.permission === 'granted' && document.hidden) {
            new Notification(`FLUX_BRIDGE: SECURE_VOICE`, {
              body: "INCOMING_P2P_SIGNAL_DETECTED",
              icon: 'https://img.icons8.com/fluency/512/link.png',
              requireInteraction: true
            });
          }
          this.onCallIncoming?.(call);
        });
      };

      const initialId = id || localStorage.getItem('ghost_peer_id') || undefined;
      attemptInit(initialId);
    });

    return this.initPromise;
  }

  onCallIncoming: ((call: MediaConnection) => void) | null = null;

  private async ensurePeerOpen(): Promise<void> {
    if (!this.peer) {
      await this.init();
    }
    if (this.peer?.open) return;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('PEER_OPEN_TIMEOUT')), 10000);
      this.peer?.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.peer?.on('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    });
  }

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
        // Link the room to the actual peer ID
        if (chat && (chat.partnerUid === 'waiting' || chat.partnerUid !== peerId)) {
          await db.conversations.update(rid, {
            partnerUid: peerId,
            partnerName: senderName || chat.partnerName,
            updatedAt: Date.now()
          });
        }
        
        // Register the connection for outgoing messages
        this.connections.set(peerId, conn);

        // If we received a handshake with a senderId and we haven't sent ours yet, respond back
        if (senderId && type === 'handshake' && !data.isResponse) {
          conn.send({
            type: 'handshake',
            rid,
            senderId: this.peer?.id,
            senderName: localStorage.getItem('ghost_user_name') || `PEER_${this.peer?.id.substring(0, 4)}`,
            isResponse: true
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

          if (Notification.permission === 'granted' && document.hidden) {
            new Notification(`FLUX_BRIDGE: ${chat.partnerName}`, {
              body: decrypted,
              icon: 'https://img.icons8.com/fluency/512/link.png',
              tag: rid
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
    await this.ensurePeerOpen();
    if (!this.peer) return;
    
    const existing = this.connections.get(peerId);
    if (existing && existing.open) return existing;

    const conn = this.peer.connect(peerId);
    this.setupConnection(conn);
    
    conn.on('open', () => {
      conn.send({ 
        type: 'handshake', 
        rid: roomId, 
        senderId: this.peer?.id,
        senderName: localStorage.getItem('ghost_user_name') || `PEER_${this.peer?.id.substring(0, 4)}`
      });
    });
    return conn;
  }

  async sendMessage(peerId: string, roomId: string, encryptedText: string) {
    await this.ensurePeerOpen();
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
    await this.ensurePeerOpen();
    if (!this.peer) return;
    return this.peer.call(peerId, stream);
  }
}

export const ghostPeer = new GhostPeer();
