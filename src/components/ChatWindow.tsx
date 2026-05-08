import { useState, useEffect, useRef } from 'react';
import { Terminal, ArrowLeft, MoreVertical, ShieldAlert, Trash2, Ban, Search, ShieldCheck, Cpu, PhoneOff, Activity } from 'lucide-react';
import { db, type Message, type Conversation } from '../lib/db';
import { encryptMessage } from '../lib/crypto';
import { ghostPeer } from '../lib/peer';
import { cn, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { MediaConnection } from 'peerjs';

interface ChatWindowProps {
  chatId: string;
  onBack: () => void;
  currentPeerId: string | null;
}

export function ChatWindow({ chatId, onBack, currentPeerId }: ChatWindowProps) {
  const [chat, setChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Call State
  const [isCalling, setIsCalling] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [activeCall, setActiveCall] = useState<MediaConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!chatId) return;

    const loadData = async () => {
      const c = await db.conversations.get(chatId);
      if (c) setChat(c);
      
      const msgs = await db.messages.where('conversationId').equals(chatId).sortBy('timestamp');
      setMessages(msgs);
    };

    loadData();
    // Use a listener instead of tight polling if possible, but keep for fallback
    const interval = setInterval(loadData, 1000);

    // Ensure peer is connected if we have a partner ID
    const ensureConnection = async () => {
      const c = await db.conversations.get(chatId);
      if (c && c.partnerUid && c.partnerUid !== 'waiting' && !ghostPeer.connections.has(c.partnerUid)) {
        ghostPeer.connectToPeer(c.partnerUid, chatId);
      }
    };
    ensureConnection();

    // Incoming Call Listener
    ghostPeer.onCallIncoming = (call) => {
      if (confirm(`INCOMING SECURE CALL FROM ${chat?.partnerName || 'PEER'}. ACCEPT?`)) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          call.answer(stream);
          call.on('stream', (rStream) => {
            setRemoteStream(rStream);
            setIsCalling(true);
            if (remoteAudioRef.current) remoteAudioRef.current.srcObject = rStream;
          });
          setActiveCall(call);
        });
      }
    };

    return () => clearInterval(interval);
  }, [chatId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !chat || chat.isBlocked) return;

    const text = inputText;
    setInputText('');

    try {
      const encrypted = await encryptMessage(text, chat.encryptionKey);
      const timestamp = Date.now();

      await db.messages.add({
        conversationId: chatId,
        senderUid: currentPeerId || 'anon',
        encryptedText: text,
        timestamp,
        isRead: 1
      });

      await db.conversations.update(chatId, {
        lastMessage: text,
        updatedAt: timestamp
      });

      // Send via PeerJS
      if (chat.partnerUid && chat.partnerUid !== 'waiting') {
        await ghostPeer.sendMessage(chat.partnerUid, chatId, encrypted);
      }
    } catch (e) {
      console.error("Send error", e);
    }
  };

  const startVoiceCall = async () => {
    if (!chat || chat.partnerUid === 'waiting') return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const call = await ghostPeer.peer?.call(chat.partnerUid, stream);
      
      if (call) {
        setIsCalling(true);
        setActiveCall(call);
        call.on('stream', (rStream) => {
          setRemoteStream(rStream);
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = rStream;
        });
      }
    } catch (err) {
      console.error("Call failed", err);
    }
  };

  const endCall = () => {
    activeCall?.close();
    setRemoteStream(null);
    setIsCalling(false);
    setActiveCall(null);
  };

  const toggleBlock = async () => {
    if (!chat) return;
    const newStatus = chat.isBlocked === 1 ? 0 : 1;
    await db.conversations.update(chatId, { isBlocked: newStatus });
    setChat({ ...chat, isBlocked: newStatus });
    setShowMenu(false);
  };

  const deleteConversation = async () => {
    if (!chat) return;
    await db.messages.where('conversationId').equals(chatId).delete();
    await db.conversations.delete(chatId);
    onBack();
  };

  const filteredMessages = messages.filter(m => 
    m.encryptedText.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!chat) return null;

  return (
    <div className="flex flex-col h-full bg-[#050505]">
      <header className="p-4 border-b border-[#141414] flex items-center gap-4 bg-[#050505]/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 hover:bg-[#141414] rounded-full text-[#8E9299]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-grow">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-[#F27D26]">
            DATA_STREAM::{chat.partnerName}
          </h2>
          <div className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-[#F27D26]/50 animate-pulse" />
            <span className="text-[9px] font-mono text-[#8E9299]/50 tracking-widest">BRIDGE_ACTIVE_P2P</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!isCalling ? (
            <button 
              onClick={startVoiceCall}
              className="p-2 hover:bg-[#141414] rounded-full text-green-500/50"
            >
              <Cpu className="w-5 h-5" />
            </button>
          ) : (
            <button 
              onClick={endCall}
              className="p-2 bg-red-500 text-white rounded-full animate-pulse"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          )}

          <button onClick={() => setIsSearching(!isSearching)} className="p-2 hover:bg-[#141414] rounded-full text-[#8E9299]">
            <Search className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-[#141414] rounded-full text-[#8E9299]">
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-[#151619] border border-[#141414] rounded-lg shadow-xl z-20 py-1 overflow-hidden">
                <button onClick={toggleBlock} className="w-full px-4 py-2 text-left text-xs font-mono hover:bg-[#141414] text-red-500 flex items-center gap-2">
                  <Ban className="w-4 h-4" /> {chat.isBlocked ? 'DROP BLOCK' : 'REJECT BUFFER'}
                </button>
                <button onClick={deleteConversation} className="w-full px-4 py-2 text-left text-xs font-mono hover:bg-[#141414] text-[#8E9299] flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> WIPE BUFFER_LOG
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hidden Audio Element for Voice Calls */}
      <audio ref={remoteAudioRef} autoPlay />

      {isCalling && (
        <div className="bg-[#F27D26] text-[#050505] p-2 text-center text-[10px] font-mono uppercase font-bold tracking-widest animate-pulse">
          VOICE_STREAM_ACTIVE
        </div>
      )}

      <AnimatePresence>
        {isSearching && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 border-b border-[#141414]"
          >
            <input 
              autoFocus
              type="text"
              placeholder="FILTER_DATA_FRAMES..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#151619] border border-[#141414] rounded-md py-1 px-3 text-[10px] font-mono focus:outline-none focus:border-[#F27D26]"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-grow overflow-y-auto px-4 py-6 space-y-4 custom-scrollbar">
        {filteredMessages.map((msg, idx) => {
          const isMe = msg.senderUid === currentPeerId;
          const showTime = idx === 0 || msg.timestamp - messages[idx-1].timestamp > 15 * 60 * 1000;
          
          return (
            <div key={idx} className="space-y-1">
              {showTime && (
                <div className="flex justify-center my-4">
                  <span className="text-[10px] font-mono text-[#8E9299] bg-[#141414] px-2 py-0.5 rounded uppercase tracking-tighter">
                    FRAME_TS: {formatDate(msg.timestamp)}
                  </span>
                </div>
              )}
              <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[95%] px-3 py-1.5 font-mono text-[11px] leading-relaxed break-words border-l-2",
                  isMe ? "bg-[#141414] text-[#F27D26] border-[#F27D26]/40" : "bg-[#0A0A0A] text-[#8E9299] border-[#8E9299]/20"
                )}>
                  <div className="flex items-center gap-2 mb-1.5 opacity-30 text-[9px] uppercase tracking-widest border-b border-white/5 pb-1">
                    <span>{isMe ? 'Local_Host' : 'Remote_Node'}</span>
                    <span className="ml-auto">{new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  {msg.encryptedText}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      <footer className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[#141414] bg-[#050505] safe-area-bottom">
        {chat.isBlocked ? (
          <div className="bg-red-900/20 border border-red-900/50 rounded-xl p-3 flex items-center justify-center gap-2 text-red-500 text-[10px] font-mono uppercase tracking-widest">
            <ShieldAlert className="w-4 h-4" /> BUFFER_REJECTED
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input 
              type="text"
              inputMode="text"
              placeholder="APPEND DATA TO STREAM..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              onFocus={() => {
                setTimeout(() => {
                  scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 300);
              }}
              className="flex-grow bg-[#151619] border border-[#141414] rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-[#F27D26] focus:ring-1 focus:ring-[#F27D26]/20 transition-all font-mono"
            />
            <button 
              onClick={handleSend}
              className="p-3 bg-[#F27D26] text-[#050505] rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#F27D26]/10"
            >
              <Terminal className="w-5 h-5" />
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
