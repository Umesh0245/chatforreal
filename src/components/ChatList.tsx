import { useState, useEffect } from 'react';
import { Activity, Shield, Share2, Plus, Search, Trash2, Ban, Cpu } from 'lucide-react';
import { db, type Conversation } from '../lib/db';
import { cn, formatDate } from '../lib/utils';
import { motion } from 'motion/react';

interface ChatListProps {
  onSelectChat: (id: string) => void;
  activeChatId: string | null;
  currentPeerId: string | null;
}

export function ChatList({ onSelectChat, activeChatId, currentPeerId }: ChatListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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
    <div className="flex flex-col h-full bg-[#050505]">
      <header className="p-6 border-b border-[#141414]">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-mono italic flex items-center gap-2 text-[#F27D26]">
            <Cpu className="w-5 h-5" /> BRIDGE[INIT]
          </h1>
          <button 
            onClick={() => onSelectChat('new')}
            className="p-2 bg-[#F27D26] text-[#050505] rounded-lg hover:bg-opacity-80 transition-all shadow-lg"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9299] group-focus-within:text-[#F27D26]" />
          <input 
            type="text"
            placeholder="FILTER BUFFERS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#151619] border border-[#141414] rounded-lg py-2 pl-10 pr-4 text-sm font-mono focus:outline-none focus:border-[#F27D26] transition-all"
          />
        </div>
      </header>

      <div className="flex-grow overflow-y-auto px-2 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-[#8E9299] opacity-50">
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
                activeChatId === chat.id ? "bg-[#141414] border-l-4 border-[#F27D26]" : "hover:bg-[#151619]"
              )}
            >
              <div className="w-12 h-12 rounded-lg bg-[#141414] border border-[#F27D26]/20 flex items-center justify-center shrink-0">
                <span className="text-[#F27D26] font-mono text-lg">{chat.partnerName[0]}</span>
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium truncate text-[#E4E3E0] uppercase tracking-wider text-xs">
                    BUFFER_{chat.partnerName}
                    {chat.isBlocked === 1 && <Ban className="inline w-3 h-3 ml-2 text-red-500" />}
                  </h3>
                  <span className="text-[10px] font-mono text-[#8E9299] shrink-0">
                    {formatDate(chat.updatedAt)}
                  </span>
                </div>
                <p className="text-xs text-[#8E9299] truncate font-mono uppercase opacity-60">
                  {chat.lastMessage || 'BUFFER EMPTY'}
                </p>
              </div>
            </motion.button>
          ))
        )}
      </div>

      <footer className="p-4 border-t border-[#141414] text-[10px] font-mono text-[#8E9299] flex justify-between uppercase">
        <span>BUFFER OK</span>
        <span className="text-green-500 underline">ENCRYPTED</span>
      </footer>
    </div>
  );
}
