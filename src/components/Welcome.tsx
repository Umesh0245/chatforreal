import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Activity, Share2, Smartphone, ArrowRight, Plus, Terminal, Cpu, Scan, RefreshCw } from 'lucide-react';
import { generateKey } from '../lib/crypto';
import { db } from '../lib/db';
import { ghostPeer } from '../lib/peer';
import { motion, AnimatePresence } from 'motion/react';

interface WelcomeProps {
  currentPeerId: string | null;
  onJoinChat: (id: string) => void;
  onOpenScanner?: () => void;
}

export function Welcome({ currentPeerId, onJoinChat, onOpenScanner }: WelcomeProps) {
  const [pairingUrl, setPairingUrl] = useState('');
  const [step, setStep] = useState(1);
  const [newRoomId, setNewId] = useState('');
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get('rid');
    const key = params.get('key');
    const name = params.get('name');
    const pid = params.get('pid'); // Peer ID

    if (rid && key && name && pid) {
      handleJoinShared(rid, key, name, pid);
    }

    // Auto-request or check notifications
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        setTimeout(() => {
          Notification.requestPermission();
        }, 1500);
      }
    }
  }, []);

  const handleJoinShared = async (rid: string, key: string, name: string, pid: string) => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const myName = localStorage.getItem('ghost_user_name') || `NODE-${Math.floor(Math.random() * 900) + 100}`;
    localStorage.setItem('ghost_user_name', myName);

    const existing = await db.conversations.get(rid);
    if (!existing) {
      await db.conversations.add({
        id: rid,
        partnerUid: pid,
        partnerName: name,
        encryptionKey: key,
        lastMessage: 'SECURE_TUNNEL_INITIALIZED',
        updatedAt: Date.now(),
        isBlocked: 0
      });
    }
    
    // Immediately try to connect to establish the bridge
    ghostPeer.connectToPeer(pid, rid);
    
    // Clean URL
    window.history.replaceState({}, '', window.location.origin + window.location.pathname);
    
    // Slight delay to allow DB commit
    setTimeout(() => onJoinChat(rid), 200);
  };

  const createRoom = async () => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const rid = Math.random().toString(36).substring(2, 10);
    const key = await generateKey();
    const name = customName.trim() || `BUFFER-${Math.floor(Math.random() * 900) + 100}`;
    localStorage.setItem('ghost_user_name', name);
    
    // Explicitly use window.location.origin to ensure absolute URL for QR
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('rid', rid);
    url.searchParams.set('key', key);
    url.searchParams.set('name', name);
    url.searchParams.set('pid', currentPeerId || '');
    
    setNewId(rid);
    setPairingUrl(url.toString());
    
    await db.conversations.add({
      id: rid,
      partnerUid: 'waiting',
      partnerName: 'AWAITING_HANDSHAKE',
      encryptionKey: key,
      updatedAt: Date.now(),
      isBlocked: 0
    });
    
    setStep(2);
  };

  const [feedback, setFeedback] = useState('');

  const copyUrl = () => {
    navigator.clipboard.writeText(pairingUrl);
    setFeedback('BUFFER_SYMLINK_COPIED');
    setTimeout(() => setFeedback(''), 2000);
  };

  return (
    <div className="max-w-md w-full px-4 mx-auto">
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl p-6 md:p-8 text-center shadow-2xl"
          >
            <div className="w-16 h-16 bg-[var(--accent)]/5 rounded-sm flex items-center justify-center mx-auto mb-6 border border-[var(--accent)]/10 transform rotate-45">
              <div className="transform -rotate-45">
                <Cpu className="w-8 h-8 text-[var(--accent)]" />
              </div>
            </div>
            <h2 className="text-2xl font-mono uppercase tracking-[0.2em] mb-2 text-[var(--fg-app)]">BRIDGE_NODE</h2>
            <p className="text-[var(--fg-muted)] text-[9px] font-mono mb-10 opacity-40 uppercase leading-relaxed text-center tracking-widest px-4">
              SECURE_P2P_BRIDGE_ACTIVE // BUFFER_AUTO_WIPE
            </p>
            
            <div className="space-y-4">
              <div className="relative">
                <input 
                  type="text"
                  placeholder="BUFFER_NAME (OPTIONAL)"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value.toUpperCase())}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-xl py-4 px-4 text-xs font-mono text-[var(--accent)] focus:outline-none focus:border-[var(--accent)]/50 transition-all placeholder:text-[var(--fg-muted)]/20"
                />
                {!customName && (
                  <Terminal className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)]/20" />
                )}
              </div>

              <button 
                onClick={createRoom}
                disabled={!currentPeerId}
                className="w-full bg-[var(--accent)] text-[#050505] font-mono py-4 rounded-xl flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[var(--accent)]/10 font-bold disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
              >
                {currentPeerId ? <Plus className="w-5 h-5" /> : <RefreshCw className="w-5 h-5 animate-spin" />}
                {currentPeerId ? 'INITIALIZE NODE BUFFER' : 'SYNCING_WITH_PEER_KERNEL...'}
              </button>
              
              {onOpenScanner && (
                <button 
                  onClick={onOpenScanner}
                  className="w-full border border-[var(--border-color)] text-[var(--fg-app)] font-mono py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[var(--bg-input)] active:scale-95 transition-all"
                >
                  <Scan className="w-5 h-5 text-[var(--accent)]" /> SYNC_SCAN_REMOTE
                </button>
              )}

              <div className="flex items-center gap-4 py-2">
                <div className="h-[1px] flex-grow bg-[var(--border-color)]" />
                <span className="text-[10px] font-mono text-[var(--fg-muted)]">OFFLINE READY</span>
                <div className="h-[1px] flex-grow bg-[var(--border-color)]" />
              </div>

              <div className="bg-[var(--bg-app)]/50 border border-[var(--border-color)] rounded-xl p-4 flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-[var(--fg-muted)]" />
                <p className="text-[9px] font-mono text-[var(--fg-muted)] text-left leading-tight">
                  NOTE: IOS SANDBOX LIMITS. IF YOU "ADD TO HOME SCREEN", STORAGE IS FRESH. START NEW BRIDGE THERE.
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="step2"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl p-6 md:p-8 shadow-2xl text-center w-full max-w-[calc(100vw-2rem)] sm:max-w-sm mx-auto"
          >
            <div className="mb-6 flex justify-center">
              <div className="bg-white p-4 rounded-2xl border-4 border-[var(--accent)] inline-block">
                <QRCodeSVG value={pairingUrl} size={180} />
              </div>
            </div>
            
            <h3 className="text-xl font-mono uppercase tracking-tighter mb-4 text-[var(--accent)]">SYNC_NODE_DATA</h3>
            <p className="text-[var(--fg-muted)] text-[10px] font-mono mb-6 uppercase text-center">
              SCAN THIS CODE WITH REMOTE PEER TO ESTABLISH AN E2EE KERNEL TUNNEL.
            </p>
            
            <div className="flex gap-2 mb-6">
              <div className="flex-grow bg-[var(--bg-app)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs font-mono text-[var(--fg-muted)] truncate flex items-center">
                {feedback || pairingUrl}
              </div>
              <button 
                onClick={copyUrl}
                className="p-3 bg-[var(--bg-surface)] text-[var(--fg-app)] rounded-xl hover:bg-[var(--bg-input)] border border-[var(--border-color)]"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>

            <button 
              onClick={() => onJoinChat(newRoomId)}
              className="w-full border border-[var(--accent)] text-[var(--accent)] font-mono py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[var(--accent)] hover:text-[#050505] transition-all"
            >
              ACCESS BUFFER <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
