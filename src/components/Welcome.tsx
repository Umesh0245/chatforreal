import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Activity, Share2, Smartphone, ArrowRight, Plus, Terminal, Cpu } from 'lucide-react';
import { generateKey } from '../lib/crypto';
import { db } from '../lib/db';
import { motion, AnimatePresence } from 'motion/react';

interface WelcomeProps {
  currentPeerId: string | null;
  onJoinChat: (id: string) => void;
}

export function Welcome({ currentPeerId, onJoinChat }: WelcomeProps) {
  const [pairingUrl, setPairingUrl] = useState('');
  const [step, setStep] = useState(1);
  const [newRoomId, setNewId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get('rid');
    const key = params.get('key');
    const name = params.get('name');
    const pid = params.get('pid'); // Peer ID

    if (rid && key && name && pid) {
      handleJoinShared(rid, key, name, pid);
    }
  }, []);

  const handleJoinShared = async (rid: string, key: string, name: string, pid: string) => {
    const existing = await db.conversations.get(rid);
    if (!existing) {
      await db.conversations.add({
        id: rid,
        partnerUid: pid,
        partnerName: name,
        encryptionKey: key,
        updatedAt: Date.now(),
        isBlocked: 0
      });
    }
    
    // Immediately try to connect to establish the bridge
    ghostPeer.connectToPeer(pid, rid);
    
    window.history.replaceState({}, '', window.location.pathname);
    onJoinChat(rid);
  };

  const createRoom = async () => {
    const rid = Math.random().toString(36).substring(2, 10);
    const key = await generateKey();
    const name = `GHOST-${Math.floor(Math.random() * 9000) + 1000}`;
    
    const url = new URL(window.location.href);
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
    <div className="max-w-md w-full">
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-[#151619] border border-[#141414] rounded-3xl p-8 text-center shadow-2xl"
          >
            <div className="w-16 h-16 bg-[#F27D26]/5 rounded-sm flex items-center justify-center mx-auto mb-6 border border-[#F27D26]/10 transform rotate-45">
              <div className="transform -rotate-45">
                <Cpu className="w-8 h-8 text-[#F27D26]" />
              </div>
            </div>
            <h2 className="text-2xl font-mono uppercase tracking-[0.4em] mb-2 text-[#E4E3E0]">BRIDGE_NODE[v4.0]</h2>
            <p className="text-[#8E9299] text-[10px] font-mono mb-10 opacity-40 uppercase leading-relaxed text-center tracking-widest">
              SECURE_P2P_BRIDGE_ACTIVE // BUFFER_AUTO_WIPE
            </p>
            
            <div className="space-y-4">
              <button 
                onClick={createRoom}
                className="w-full bg-[#F27D26] text-[#050505] font-mono py-4 rounded-xl flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#F27D26]/10"
              >
                <Plus className="w-5 h-5" /> INITIALIZE NODE BUFFER
              </button>
              
              <div className="flex items-center gap-4 py-4">
                <div className="h-[1px] flex-grow bg-[#141414]" />
                <span className="text-[10px] font-mono text-[#8E9299]">OFFLINE READY</span>
                <div className="h-[1px] flex-grow bg-[#141414]" />
              </div>

              <div className="bg-[#050505] border border-[#141414] rounded-xl p-4 flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-[#8E9299]" />
                <p className="text-[10px] font-mono text-[#8E9299] text-left">
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
            className="bg-[#151619] border border-[#141414] rounded-3xl p-6 md:p-8 shadow-2xl text-center w-full max-w-sm mx-auto"
          >
            <div className="mb-6 inline-block bg-white p-4 rounded-2xl border-4 border-[#F27D26]">
              <QRCodeSVG value={pairingUrl} size={180} />
            </div>
            
            <h3 className="text-xl font-mono uppercase tracking-tighter mb-4 text-[#F27D26]">SYNC_NODE_DATA</h3>
            <p className="text-[#8E9299] text-[10px] font-mono mb-6 uppercase text-center">
              SCAN THIS CODE WITH REMOTE PEER TO ESTABLISH AN E2EE KERNEL TUNNEL.
            </p>
            
            <div className="flex gap-2 mb-6">
              <div className="flex-grow bg-[#050505] border border-[#141414] rounded-xl px-4 py-3 text-xs font-mono text-[#8E9299] truncate flex items-center">
                {feedback || pairingUrl}
              </div>
              <button 
                onClick={copyUrl}
                className="p-3 bg-[#141414] text-[#E4E3E0] rounded-xl hover:bg-[#151619] border border-[#141414]"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>

            <button 
              onClick={() => onJoinChat(newRoomId)}
              className="w-full border border-[#F27D26] text-[#F27D26] font-mono py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[#F27D26] hover:text-[#050505] transition-all"
            >
              ACCESS BUFFER <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
