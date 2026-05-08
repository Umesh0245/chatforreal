import { useState, useEffect } from 'react';
import { Activity, Shield, Share2, Plus, Search, Trash2, Ban, Cpu, Sun, Moon, Scan, Bell, BellOff, Settings as SettingsIcon } from 'lucide-react';
import { db, type Conversation } from '../lib/db';
import { cn, formatDate } from '../lib/utils';
import { motion } from 'motion/react';

interface ChatListProps {
  onSelectChat: (id: string) => void;
  activeChatId: string | null;
  currentPeerId: string | null;
  onOpenScanner: () => void;
  onOpenSettings: () => void;
}

export function ChatList({ onSelectChat, activeChatId, currentPeerId, onOpenScanner, onOpenSettings }: ChatListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifPermission, setNotifPermission] = useState(Notification.permission);

  const requestNotif = async () => {
    const res = await Notification.requestPermission();
    setNotifPermission(res);
  };

  useEffect(() => {
    const loadConversations = async () => {
      const all = await db.conversations.orderBy('updatedAt').reverse().toArray();
      setConversations(all);
    };

    loadConversations();
    const interval = setInterval(loadConversations, 2000); // Poll local DB
    return () => clearInterval(interval);
  }, []);

  const filtered = conversations.filter(c => 
    c.partnerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] text-[var(--fg-app)] overflow-hidden">
      <header 
        className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-app)]/80 backdrop-blur-xl sticky top-0 z-50 shrink-0"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-lg font-mono italic flex items-center gap-2 text-[var(--accent)] tracking-tighter shrink-0">
            <Cpu className="w-5 h-5" /> BRIDGE<span className="not-italic text-[var(--fg-app)] opacity-30">[KRNL]</span>
          </h1>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            <button 
              onClick={requestNotif}
              className={cn(
                "p-2 border border-[var(--border-color)] rounded-xl transition-all active:scale-95 shrink-0",
                notifPermission === 'granted' ? "text-[var(--accent)] border-[var(--accent)]/30" : "text-[var(--fg-muted)]"
              )}
              aria-label="Toggle notifications"
            >
              {notifPermission === 'granted' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
            <button 
              onClick={onOpenSettings}
              className="p-2 border border-[var(--border-color)] text-[var(--fg-app)] rounded-xl hover:bg-[var(--bg-input)] transition-all active:scale-95 shrink-0"
              aria-label="Toggle settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button 
              onClick={onOpenScanner}
              className="p-2 border border-[var(--border-color)] text-[var(--fg-app)] rounded-xl hover:bg-[var(--bg-input)] transition-all active:scale-95 shrink-0"
              aria-label="Scan QR code"
            >
              <Scan className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onSelectChat('new')}
              className="p-2 bg-[var(--accent)] text-[#050505] rounded-xl hover:bg-opacity-90 transition-all shadow-lg shadow-[var(--accent)]/20 active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)] group-focus-within:text-[var(--accent)]" />
          <input 
            type="text"
            placeholder="FILTER BUFFERS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--fg-app)] rounded-lg py-2 pl-10 pr-4 text-sm font-mono focus:outline-none focus:border-[var(--accent)] transition-all placeholder:opacity-30"
          />
        </div>
      </header>

      <div className="flex-grow overflow-y-auto px-2 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-[var(--fg-muted)]">
            <Activity className="w-8 h-8 mb-2" />
            <p className="text-xs font-mono uppercase">NO ACTIVE BUFFERS</p>
          </div>
        ) : (
          filtered.map((chat) => (
            <motion.button
              layout
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={cn(
                "w-full flex items-start gap-4 p-4 rounded-xl transition-all mb-1 text-left",
                activeChatId === chat.id ? "bg-[var(--bg-surface)] border-l-4 border-[var(--accent)]" : "hover:bg-[var(--bg-input)]"
              )}
            >
              <div className="w-12 h-12 rounded-lg bg-[var(--bg-input)] border border-[var(--accent)]/20 flex items-center justify-center shrink-0">
                <span className="text-[var(--accent)] font-mono text-lg">{chat.partnerName[0]}</span>
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium truncate text-[var(--fg-app)] uppercase tracking-wider text-xs">
                    BUFFER_{chat.partnerName}
                    {chat.isBlocked === 1 && <Ban className="inline w-3 h-3 ml-2 text-red-500" />}
                  </h3>
                  <span className="text-[10px] font-mono text-[var(--fg-muted)] shrink-0">
                    {formatDate(chat.updatedAt)}
                  </span>
                </div>
                <p className="text-xs text-[var(--fg-muted)] truncate font-mono uppercase">
                  {chat.lastMessage || 'BUFFER EMPTY'}
                </p>
              </div>
            </motion.button>
          ))
        )}
      </div>

      <footer 
        className="p-4 border-t border-[var(--border-color)] text-[10px] font-mono text-[var(--fg-muted)] flex justify-between uppercase shrink-0"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <span>BUFFER OK</span>
        <span className="text-green-500 underline decoration-green-500/30">ENCRYPTED</span>
      </footer>
    </div>
  );
}
