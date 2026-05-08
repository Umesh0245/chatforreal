import { useState, useEffect, useRef } from 'react';
import { Terminal, ArrowLeft, MoreVertical, ShieldAlert, Trash2, Ban, Search, ShieldCheck, Cpu, PhoneOff, Activity, Phone, Mic, MicOff } from 'lucide-react';
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
  const [isSearching, setIsSearching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  
  // Call State
  const [isCalling, setIsCalling] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [activeCall, setActiveCall] = useState<MediaConnection | null>(null);
  const [incomingCall, setIncomingCall] = useState<MediaConnection | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [peerStatus, setPeerStatus] = useState<'stable' | 'lost'>('stable');

  useEffect(() => {
    if (!chatId) return;

    const checkPeer = () => {
      const isLost = !ghostPeer.peer || ghostPeer.peer.disconnected || ghostPeer.peer.destroyed;
      setPeerStatus(isLost ? 'lost' : 'stable');
    };

    const loadData = async () => {
      checkPeer();
      const c = await db.conversations.get(chatId);
      if (c) setChat(c);
      
      const msgs = await db.messages.where('conversationId').equals(chatId).sortBy('timestamp');
      setMessages(msgs);
    };

    loadData();
    const interval = setInterval(loadData, 1000);

    const ensureConnection = async () => {
      // Request notification permission if not yet asked
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      
      checkPeer();
      const c = await db.conversations.get(chatId);
      if (c && c.partnerUid && c.partnerUid !== 'waiting') {
        // Force a reconnect if the bridge is silent
        if (!ghostPeer.connections.has(c.partnerUid)) {
          ghostPeer.connectToPeer(c.partnerUid, chatId);
        } else {
          // If already connected, send a ping to re-stabilize the other end
          ghostPeer.connections.get(c.partnerUid)?.send({ type: 'handshake', rid: chatId, senderId: currentPeerId });
        }
      }
    };
    ensureConnection();

    // Responsive keyboard scroll handler
    const onViewportChange = () => {
      if (window.visualViewport) {
        const isKeyboardUp = window.visualViewport.height < window.innerHeight;
        if (isKeyboardUp) {
          // Scroll immediately and with a slight delay to account for layout shifts
          scrollRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
          setTimeout(() => {
            scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }, 300);
        }
      }
    };
    window.visualViewport?.addEventListener('resize', onViewportChange);

    // Incoming Call Listener
    ghostPeer.onCallIncoming = (call) => {
      setIncomingCall(call);
      
      if (Notification.permission === 'granted') {
        const notification = new Notification(`INCOMING_CALL: ${chat?.partnerName || 'PEER'}`, {
          body: "SECURE_VOICE_SIGNAL_INCOMING",
          icon: 'https://img.icons8.com/fluency/512/link.png',
          tag: 'incoming-call',
          requireInteraction: true
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    };

    return () => {
      clearInterval(interval);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
    };
  }, [chatId, currentPeerId]);

  useEffect(() => {
    // Smoother scroll transition
    const timer = setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !chat || chat.isBlocked) return;

    const text = inputText;
    setInputText('');

    try {
      const encrypted = await encryptMessage(text, chat.encryptionKey);
      const timestamp = Date.now();

      const messageId = await db.messages.add({
        conversationId: chatId,
        senderUid: currentPeerId || 'anon',
        encryptedText: text,
        timestamp,
        isRead: 1,
        isSynced: 0
      });

      await db.conversations.update(chatId, {
        lastMessage: text,
        updatedAt: timestamp
      });

      // Send via PeerJS
      if (chat.partnerUid && chat.partnerUid !== 'waiting') {
        await ghostPeer.sendMessage(chat.partnerUid, chatId, encrypted, messageId as number);
      }
    } catch (e) {
      console.error("Send error", e);
    }
  };

  const startVoiceCall = async () => {
    if (!chat || chat.partnerUid === 'waiting') return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const call = await ghostPeer.callPeer(chat.partnerUid, chatId, stream);
      
      if (call) {
        setIsCalling(true);
        setActiveCall(call);
        call.on('stream', (rStream) => {
          setRemoteStream(rStream);
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = rStream;
        });
        call.on('close', endCall);
      }
    } catch (err) {
      console.error("Call failed", err);
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      incomingCall.answer(stream);
      incomingCall.on('stream', (rStream) => {
        setRemoteStream(rStream);
        setIsCalling(true);
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = rStream;
      });
      incomingCall.on('close', endCall);
      setActiveCall(incomingCall);
      setIncomingCall(null);
    } catch (err) {
      console.error("Accept failed", err);
      setIncomingCall(null);
    }
  };

  const rejectCall = () => {
    incomingCall?.close();
    setIncomingCall(null);
  };

  const endCall = () => {
    activeCall?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setRemoteStream(null);
    setIsCalling(false);
    setActiveCall(null);
    setIsMuted(false);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
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

  const handleRename = async () => {
    if (!renameText.trim() || !chat) {
      setIsRenaming(false);
      return;
    }
    await db.conversations.update(chatId, { partnerName: renameText.trim() });
    setChat({ ...chat, partnerName: renameText.trim() });
    setIsRenaming(false);
  };

  const filteredMessages = messages.filter(m => 
    m.encryptedText.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!chat) return (
    <div className="flex-grow bg-[var(--bg-app)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Cpu className="w-8 h-8 text-[var(--accent)] animate-spin opacity-20" />
        <span className="text-[10px] font-mono text-[var(--accent)]/20 tracking-[0.5em]">BUFFER_LOADING...</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
      <header 
        className="px-4 pb-3 border-b border-[var(--border-color)] flex items-center gap-3 bg-[var(--bg-app)]/95 backdrop-blur-sm sticky top-0 z-30 shadow-sm shrink-0"
        style={{ 
          paddingTop: 'max(3.5rem, env(safe-area-inset-top))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))'
        }}
      >
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-[var(--bg-surface)] rounded-full text-[var(--fg-muted)] shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-grow min-w-0">
          {isRenaming ? (
            <input 
              autoFocus
              type="text"
              value={renameText}
              onChange={(e) => setRenameText(e.target.value.toUpperCase())}
              onBlur={handleRename}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              className="bg-[var(--bg-input)] border-b border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] focus:outline-none w-full"
            />
          ) : (
            <h2 
              onClick={() => {
                setRenameText(chat.partnerName);
                setIsRenaming(true);
              }}
              className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--accent)] truncate cursor-pointer hover:opacity-80"
            >
              {chat.partnerName}
            </h2>
          )}
          <div className="flex items-center gap-1.5 overflow-hidden">
            <Cpu className={cn("w-2.5 h-2.5 text-[var(--accent)]/50 animate-pulse shrink-0", peerStatus === 'lost' && "text-red-500 animate-none")} />
            <span className={cn("text-[8px] font-mono text-[var(--fg-muted)] tracking-widest truncate", peerStatus === 'lost' && "text-red-500")}>
              {peerStatus === 'stable' ? 'SIGNAL:STABLE' : 'SIGNAL:LOST'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          {!isCalling ? (
            <button 
              onClick={startVoiceCall}
              disabled={chat.partnerUid === 'waiting' || peerStatus === 'lost'}
              className="p-2 hover:bg-[var(--bg-surface)] rounded-full text-green-500/50 disabled:opacity-20"
            >
              <Phone className="w-5 h-5" />
            </button>
          ) : (
            <button 
              onClick={endCall}
              className="p-2 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500/20"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          )}

          <button onClick={() => setSearchQuery(searchQuery ? '' : ' ')} className="p-2 hover:bg-[var(--bg-surface)] rounded-full text-[var(--fg-muted)]">
            <Search className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              className={cn("p-2 hover:bg-[var(--bg-surface)] rounded-full text-[var(--fg-muted)]", showMenu && "text-[var(--accent)] bg-[var(--bg-surface)]")}
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="absolute right-0 mt-2 w-48 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <button onClick={toggleBlock} className="w-full px-4 py-3 text-left text-xs font-mono hover:bg-[var(--bg-surface)] text-red-500 flex items-center gap-2 border-b border-[var(--border-color)]">
                    <Ban className="w-4 h-4" /> {chat.isBlocked ? 'DROP BLOCK' : 'REJECT BUFFER'}
                  </button>
                  <button onClick={deleteConversation} className="w-full px-4 py-3 text-left text-xs font-mono hover:bg-red-500/10 text-red-500 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> WIPE BUFFER_LOG
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Hidden Audio Element for Voice Calls */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Active Call UI Overlay */}
      <AnimatePresence>
        {isCalling && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[var(--accent)] text-[#050505] p-4 flex flex-col gap-3 z-40 shadow-[0_10px_40px_rgba(242,125,38,0.3)] shrink-0"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-2.5 h-2.5 bg-[#050505] rounded-full animate-ping" />
                  <div className="absolute inset-0 w-2.5 h-2.5 bg-[#050505] rounded-full" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[12px] font-mono font-black tracking-[0.2em] uppercase">Audio_Stream_Active</span>
                  <span className="text-[8px] font-mono opacity-60 uppercase">Peer_Identity_Verified // E2EE_TUNNEL</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={toggleMute}
                  className={cn(
                    "p-3 rounded-2xl transition-all font-mono text-[10px] font-bold flex items-center gap-2 border border-black/10",
                    isMuted ? "bg-red-500 text-white" : "bg-[#050505]/10 hover:bg-[#050505]/20"
                  )}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isMuted ? "UNMUTE" : "MUTE"}</span>
                </button>
                <button 
                  onClick={endCall}
                  className="p-3 bg-[#050505] text-[var(--accent)] rounded-2xl hover:bg-black transition-all font-mono text-[10px] font-bold flex items-center gap-2"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span className="hidden sm:inline">TERMINATE_LINK</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incoming Call Overlay */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[var(--bg-app)]/95 backdrop-blur-xl"
          >
            <div className="bg-[var(--bg-surface)] border-2 border-[var(--accent)] rounded-[2rem] p-8 max-w-sm w-full text-center shadow-[0_0_50px_rgba(242,125,38,0.2)]">
              <div className="w-20 h-20 bg-[var(--accent)]/10 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                <div className="absolute inset-0 bg-[var(--accent)] rounded-full animate-ping opacity-20" />
                <Phone className="w-8 h-8 text-[var(--accent)]" />
              </div>
              <h2 className="text-[var(--fg-app)] font-mono text-xl mb-2 tracking-widest">{chat.partnerName}</h2>
              <p className="text-[var(--fg-muted)] font-mono text-[10px] mb-10 opacity-50">INCOMING_SECURE_SIGNAL...</p>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={rejectCall}
                  className="bg-[var(--bg-surface)] text-red-500 border border-red-500/20 py-4 rounded-2xl font-mono text-xs hover:bg-red-500/10 active:scale-95 transition-all"
                >
                  REJECT
                </button>
                <button 
                  onClick={acceptCall}
                  className="bg-[var(--accent)] text-[#050505] py-4 rounded-2xl font-mono text-xs font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[var(--accent)]/20"
                >
                  ACCEPT
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSearching && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 border-b border-[var(--border-color)]"
          >
            <input 
              autoFocus
              type="text"
              placeholder="FILTER_DATA_FRAMES..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--fg-app)] rounded-md py-1 px-3 text-[10px] font-mono focus:outline-none focus:border-[var(--accent)]"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-grow overflow-y-auto px-4 py-6 space-y-4 custom-scrollbar overscroll-contain">
        {filteredMessages.map((msg, idx) => {
          const isMe = msg.senderUid === currentPeerId;
          const showTime = idx === 0 || msg.timestamp - messages[idx-1].timestamp > 15 * 60 * 1000;
          
          return (
            <div key={idx} className="space-y-1">
              {showTime && (
                <div className="flex justify-center my-4">
                  <span className="text-[10px] font-mono text-[var(--fg-muted)] bg-[var(--bg-surface)] px-2 py-1 rounded-sm uppercase tracking-[0.2em]">
                    FRAME_TS::{formatDate(msg.timestamp)}
                  </span>
                </div>
              )}
              <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[95%] px-3 py-2 font-mono text-[11px] leading-relaxed break-words border-l-2",
                  isMe ? "bg-[var(--bg-surface)] text-[var(--accent)] border-[var(--accent)]/40" : "bg-[var(--bg-input)] text-[var(--fg-muted)] border-[var(--fg-muted)]/20"
                )}>
                  <div className="flex items-center gap-2 mb-2 opacity-30 text-[8px] uppercase tracking-widest border-b border-white/5 pb-1">
                    <span>{isMe ? 'Local_Node' : 'Remote_Peer'}</span>
                    <span className="ml-auto opacity-50">{new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    {isMe && (
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        msg.isSynced ? "bg-[var(--accent)]" : "bg-red-500 animate-pulse appearance-none"
                      )} title={msg.isSynced ? "SYNCED" : "SIGNAL_PENDING"} />
                    )}
                  </div>
                  {msg.encryptedText}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} className="h-4" />
      </div>

      <footer className="p-3 border-t border-[var(--border-color)] bg-[var(--bg-app)] shrink-0 z-10">
        <div className="max-w-4xl mx-auto pb-[env(safe-area-inset-bottom)]">
          {chat.isBlocked ? (
            <div className="bg-red-900/10 border border-red-900/30 rounded-lg p-3 flex items-center justify-center gap-2 text-red-500/70 text-[10px] font-mono uppercase tracking-[0.3em]">
              <ShieldAlert className="w-4 h-4 opacity-50" /> KERNEL_REJECTED
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-[var(--bg-input)] rounded-2xl border border-[var(--border-color)] p-1.5 focus-within:border-[var(--accent)]/50 transition-all shadow-lg shadow-black/50">
              <input 
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                inputMode="text"
                enterKeyHint="send"
                placeholder="APPEND_DATA..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                onFocus={() => {
                  setTimeout(() => {
                    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                  }, 300);
                }}
                className="flex-grow bg-transparent border-none py-3 px-3 text-[15px] md:text-sm text-[var(--fg-app)] focus:outline-none transition-all font-mono placeholder:opacity-20 min-h-[48px]"
              />
              <button 
                onClick={handleSend}
                disabled={!inputText.trim()}
                className={cn(
                  "p-3 rounded-xl transition-all shadow-lg active:scale-90",
                  inputText.trim() 
                    ? "bg-[var(--accent)] text-[#050505] shadow-[var(--accent)]/10" 
                    : "bg-[var(--bg-surface)] text-[var(--fg-muted)]/20"
                )}
              >
                <Terminal className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
