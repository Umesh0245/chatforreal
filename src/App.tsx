import { useEffect, useState } from 'react';
import { ChatList } from './components/ChatList';
import { ChatWindow } from './components/ChatWindow';
import { Welcome } from './components/Welcome';
import { LockScreen } from './components/LockScreen';
import { cleanupOldMessages, db } from './lib/db';
import { cn } from './lib/utils';
import { ghostPeer } from './lib/peer';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(true);
  const [viewportHeight, setViewportHeight] = useState('100dvh');

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(`${window.visualViewport.height}px`);
        // Smoothly scroll to bottom if keyboard up
        if (window.visualViewport.height < window.innerHeight) {
          document.body.scrollTop = 0;
        }
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);
    
    // Prevent scrolling on body to fix keyboard bounce issues
    document.body.style.overscrollBehavior = 'none';
    document.body.style.overflow = 'hidden';

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      let savedId = localStorage.getItem('ghost_peer_id') || undefined;
      const id = await ghostPeer.init(savedId) as string;
      localStorage.setItem('ghost_peer_id', id);
      setPeerId(id);
      setLoading(false);
    };

    init();

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    cleanupOldMessages();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-[#050505] text-[#F27D26]">
        <motion.div 
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="text-xs font-mono uppercase tracking-[0.3em]"
        >
          CONNECTING TO KERNEL_PROXY...
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {isLocked && <LockScreen onUnlock={() => setIsLocked(false)} />}
      </AnimatePresence>

      <div 
        style={{ height: viewportHeight, touchAction: 'none' }}
        className="flex bg-[#050505] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-[#050505] overflow-hidden fixed inset-0"
      >
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
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
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
    </>
  );
}
