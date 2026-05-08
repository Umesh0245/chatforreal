import { useEffect, useState } from 'react';
import { ChatList } from './components/ChatList';
import { ChatWindow } from './components/ChatWindow';
import { Welcome } from './components/Welcome';
import { LockScreen } from './components/LockScreen';
import { cleanupOldMessages, db } from './lib/db';
import { cn } from './lib/utils';
import { ghostPeer } from './lib/peer';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu } from 'lucide-react';

export default function App() {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(true);
  const [viewportHeight, setViewportHeight] = useState('100vh');

  useEffect(() => {
    const updateHeight = () => {
      // Use dvh as primary if supported, fallback to vh or visualViewport
      const vh = window.innerHeight;
      setViewportHeight(`${vh}px`);
    };

    window.addEventListener('resize', updateHeight);
    window.visualViewport?.addEventListener('resize', updateHeight);
    updateHeight();

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.visualViewport?.removeEventListener('resize', updateHeight);
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      let savedId = localStorage.getItem('ghost_peer_id') || undefined;
      
      // Safety timeout: don't let the loading screen hang forever
      const safetyTimer = setTimeout(() => {
        setLoading(false);
      }, 4000);

      try {
        const id = await ghostPeer.init(savedId);
        localStorage.setItem('ghost_peer_id', id);
        setPeerId(id);
      } catch (err) {
        console.error("Peer init failed", err);
      } finally {
        clearTimeout(safetyTimer);
        setLoading(false);
      }
    };

    init();

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    cleanupOldMessages();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#050505] text-[#F27D26]">
        <motion.div 
          animate={{ opacity: [1, 0.5, 1], scale: [1, 1.05, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="flex flex-col items-center gap-4"
        >
          <Cpu className="w-12 h-12 animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.3em]">CONNECTING_KERNEL...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-[#050505] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-[#050505] overflow-hidden"
      style={{ height: viewportHeight }}
    >
      <div className="flex h-full w-full relative">
        {/* Sidebar for Desktop / Full screen on Mobile if no chat selected */}
        <div className={cn(
          "flex-col border-r border-[#141414] transition-all duration-300",
          activeChatId ? "hidden md:flex w-full md:w-80" : "flex w-full md:w-80"
        )}>
          <ChatList onSelectChat={setActiveChatId} activeChatId={activeChatId} currentPeerId={peerId} />
        </div>

        {/* Main Chat Area */}
        <div className={cn(
          "flex-grow bg-[#050505] transition-all duration-300 relative",
          !activeChatId ? "hidden md:flex" : "flex"
        )}>
          <AnimatePresence mode="wait">
            {activeChatId && activeChatId !== 'new' ? (
              <motion.div 
                key={activeChatId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full"
              >
                <ChatWindow chatId={activeChatId} onBack={() => setActiveChatId(null)} currentPeerId={peerId} />
              </motion.div>
            ) : (
              <div className="flex items-center justify-center w-full h-full p-8 text-center">
                <Welcome currentPeerId={peerId} onJoinChat={setActiveChatId} />
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Lock Screen Overlay */}
      <AnimatePresence>
        {isLocked && (
          <motion.div
            key="lock-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#050505]"
          >
            <LockScreen onUnlock={() => setIsLocked(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
