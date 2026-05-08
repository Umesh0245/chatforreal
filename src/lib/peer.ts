import { Peer, type DataConnection, type MediaConnection } from 'peerjs';
import { db } from './db';
import { decryptMessage } from './crypto';

class GhostPeer {
  peer: Peer | null = null;
  connections: Map<string, DataConnection> = new Map();
  onMessage: ((chatId: string, text: string) => void) | null = null;
  onCall: ((stream: MediaStream) => void) | null = null;

  private initPromise: Promise<string> | null = null;
  private watchdogInterval: number | null = null;
  private heartbeatInterval: number | null = null;

  init(id?: string): Promise<string> {
    if (this.initPromise && this.peer?.open) return this.initPromise;
    
    // If already initializing but not open, return the same promise
    if (this.initPromise && this.peer && !this.peer.destroyed) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve) => {
      const cleanup = () => {
        if (this.peer) {
          try {
            this.peer.off('open');
            this.peer.off('error');
            this.peer.off('disconnected');
            if (!this.peer.destroyed) this.peer.destroy();
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
            ],
            sdpSemantics: 'unified-plan'
          }
        });

        const timeout = setTimeout(() => {
          if (this.peer && !this.peer.open) {
            console.warn('Init timeout. Use current ID state.');
            const finalId = this.peer.id || targetId || generateRandomId();
            resolve(finalId);
          }
        }, 8000);

        this.peer.on('open', (newId) => {
          clearTimeout(timeout);
          console.log('Bridge ready:', newId);
          this.startWatchdog();
          resolve(newId);
        });

        this.peer.on('error', (err: any) => {
          clearTimeout(timeout);
          console.error('Peer Fault:', err.type);

          if (err.type === 'unavailable-id' || err.type === 'invalid-id' || err.type === 'peer-unavailable') {
            localStorage.removeItem('ghost_peer_id');
            const nextId = generateRandomId();
            setTimeout(() => attemptInit(nextId), 300);
          } else {
            resolve(this.peer?.id || targetId || generateRandomId());
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

        this.peer.on('call', async (call) => {
          const chat = await db.conversations.filter(c => c.partnerUid === call.peer).first();
          const senderDisplay = chat?.partnerName || 'REMOTE_PEER';

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const notification = new Notification(`INCOMING_LINK [${senderDisplay}]`, {
              body: "SECURE_P2P_VOICE_STREAM_INITIATED",
              icon: 'https://img.icons8.com/fluency/512/link.png',
              requireInteraction: true,
              tag: 'incoming-call'
            });
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }
          
          if ('vibrate' in navigator) {
            navigator.vibrate([100, 50, 100]);
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

  private startWatchdog() {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    // Re-check connections every 10 seconds
    this.watchdogInterval = window.setInterval(async () => {
      if (!this.peer || this.peer.disconnected || this.peer.destroyed) {
        console.log("Kernel watchdog: Peer signaling lost. Rebooting...");
        this.init();
        return;
      }

      // Check if we have pending outbox items for known peers and try to reconnect
      const outbox = await db.outbox.toArray();
      if (outbox.length > 0) {
        for (const item of outbox) {
          const chat = await db.conversations.get(item.conversationId);
          if (chat && chat.partnerUid && chat.partnerUid !== 'waiting') {
            const conn = this.connections.get(chat.partnerUid);
            if (!conn || !conn.open) {
              console.log(`Kernel watchdog: Attempting reconnection to ${chat.partnerUid}...`);
              this.connectToPeer(chat.partnerUid, chat.id);
            }
          }
        }
      }
    }, 10000);

    // Heartbeat to keep connection active
    this.heartbeatInterval = window.setInterval(() => {
      this.connections.forEach((conn) => {
        if (conn.open) {
          conn.send({ type: 'heartbeat', timestamp: Date.now() });
        }
      });
    }, 25000);
  }

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
    
    conn.on('open', async () => {
      console.log('Bridge established with:', peerId);
      this.connections.set(peerId, conn);

      // Flush outbox for this peer
      try {
        const outboxItems = await db.outbox.toArray();
        for (const item of outboxItems) {
          const chat = await db.conversations.get(item.conversationId);
          if (chat && chat.partnerUid === peerId) {
            conn.send(item.data);
            if (item.data.mid) {
              await db.messages.update(item.data.mid, { isSynced: 1 });
            }
            await db.outbox.delete(item.id!);
            console.log('Kernel: Outbox segment transmitted successfully', item.id);
          }
        }
      } catch (err) {
        console.error('Kernel Outbox fault:', err);
      }
    });

    conn.on('data', async (data: any) => {
      console.log('Incoming segment:', data);
      const { type, payload, rid, senderName, senderId } = data;

      if (type === 'handshake') {
        const chat = await db.conversations.get(rid);
        // Link the room to the actual peer ID
        if (chat && (chat.partnerUid === 'waiting' || chat.partnerUid !== peerId || chat.partnerName === 'AWAITING_HANDSHAKE')) {
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

      if (type === 'call-signal') {
        const chat = await db.conversations.get(rid);
        if (chat && chat.isBlocked === 0) {
          const senderDisplay = senderName || chat.partnerName || 'REMOTE_PEER';
          
          await db.messages.add({
            conversationId: rid,
            senderUid: conn.peer,
            encryptedText: `[SYSTEM_SIGNAL]: INCOMING_CALL_REQUEST`,
            timestamp: Date.now(),
            isRead: 0
          });

          this.onMessage?.(rid, `[SIGNAL]: Incoming request from ${senderDisplay}`);
          
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const notification = new Notification(`CALL_SIGNAL [${senderDisplay}]`, {
              body: "REMOTE_PEER_ATTEMPTING_INIT",
              icon: 'https://img.icons8.com/fluency/512/link.png',
              tag: 'call-signal-' + rid,
              renotify: true
            } as any);
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }

          if ('vibrate' in navigator) {
            navigator.vibrate(50);
          }
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

          const senderDisplay = chat.partnerName || 'REMOTE_PEER';
          
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const notification = new Notification(`${senderDisplay}`, {
              body: decrypted,
              icon: 'https://img.icons8.com/fluency/512/link.png',
              tag: rid,
              badge: 'https://img.icons8.com/fluency/128/link.png',
              renotify: true
            } as any);
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }

          if ('vibrate' in navigator) {
            navigator.vibrate(100);
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

  async sendMessage(peerId: string, roomId: string, encryptedText: string, messageId: number) {
    await this.ensurePeerOpen();
    let conn = this.connections.get(peerId);
    
    const messageData = { 
      type: 'message', 
      payload: encryptedText, 
      rid: roomId, 
      timestamp: Date.now(),
      mid: messageId 
    };

    const queueInOutbox = async () => {
      await db.outbox.add({
        conversationId: roomId,
        data: messageData,
        timestamp: Date.now()
      });
      console.log('Signal lost: Segment queued in outbox kernel.');
    };

    if (conn && conn.open) {
      try {
        conn.send(messageData);
        await db.messages.update(messageId, { isSynced: 1 });
      } catch (err) {
        console.warn('Send failure, queueing...', err);
        await queueInOutbox();
      }
    } else {
      console.log('Bridge inactive. Initializing tunnel to:', peerId);
      try {
        const newConn = await this.connectToPeer(peerId, roomId);
        if (newConn) {
          if (newConn.open) {
            newConn.send(messageData);
            await db.messages.update(messageId, { isSynced: 1 });
          } else {
            await queueInOutbox();
          }
        } else {
          await queueInOutbox();
        }
      } catch (err) {
        await queueInOutbox();
      }
    }
  }

  async callPeer(peerId: string, roomId: string, stream: MediaStream) {
    await this.ensurePeerOpen();
    if (!this.peer) return;

    // Send a call signal message first
    const signalData = {
      type: 'call-signal',
      rid: roomId,
      senderName: localStorage.getItem('ghost_user_name') || 'REMOTE_PEER',
      timestamp: Date.now()
    };

    let conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(signalData);
    } else {
      // Outbox it if needed
      await db.outbox.add({
        conversationId: roomId,
        data: signalData,
        timestamp: Date.now()
      });
    }

    return this.peer.call(peerId, stream);
  }
}

export const ghostPeer = new GhostPeer();
