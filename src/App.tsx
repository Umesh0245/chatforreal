import { useEffect, useState, useCallback } from 'react';
import { ChatList } from './components/ChatList';
import { ChatWindow } from './components/ChatWindow';
import { Welcome } from './components/Welcome';
import { LockScreen } from './components/LockScreen';
import { Scanner } from './components/Scanner';
import { Settings } from './components/Settings';
import { cleanupOldMessages, db } from './lib/db';
import { cn } from './lib/utils';
import { ghostPeer } from './lib/peer';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, Terminal, Activity } from 'lucide-react';

export default function App() {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewportHeight, setViewportHeight] = useState('100dvh');
  const [viewportTop, setViewportTop] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('ghost_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
    localStorage.setItem('ghost_theme', theme);
  }, [theme]);

  useEffect(() => {
    const updateViewport = () => {
      if (window.visualViewport) {
        setViewportHeight(`${window.visualViewport.height}px`);
        setViewportTop(window.visualViewport.offsetTop);
      } else {
        setViewportHeight('100dvh');
        setViewportTop(0);
      }
      // Ensure no browser shift context
      window.scrollTo(0, 0);
    };

    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    updateViewport();

    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
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

  const handleScan = useCallback(async (data: string) => {
    try {
      const url = new URL(data);
      const rid = url.searchParams.get('rid');
      const key = url.searchParams.get('key');
      const name = url.searchParams.get('name');
      const pid = url.searchParams.get('pid');

      if (rid && key && name && pid) {
        // Find if conversation exists
        let conversation = await db.conversations.get(rid);
        
        if (!conversation) {
          conversation = {
            id: rid,
            partnerUid: pid,
            partnerName: name,
            encryptionKey: key,
            updatedAt: Date.now(),
            isBlocked: 0
          };
          await db.conversations.add(conversation);
        }

        setActiveChatId(rid);
        setShowScanner(false);
      }
    } catch (e) {
      console.error("Invalid QR data", e);
    }
  }, []);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [outboxCount, setOutboxCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkOutbox = async () => {
      const count = await db.outbox.count();
      setOutboxCount(count);
    };
    const interval = setInterval(checkOutbox, 2000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[var(--bg-app)] text-[var(--accent)]">
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
    <>
      {/* Signal Status Bar */}
      <AnimatePresence>
        {(outboxCount > 0 || !isOnline) && (
          <motion.div 
            initial={{ y: -40 }}
            animate={{ y: 0 }}
            exit={{ y: -40 }}
            className={cn(
              "fixed top-0 left-0 right-0 z-[600] py-1 px-4 flex items-center justify-center gap-6 border-b shadow-lg transition-colors duration-500",
              isOnline ? "bg-green-500 border-green-600 text-black" : "bg-red-500 border-red-600 text-black"
            )}
            style={{ 
              paddingTop: 'max(4px, env(safe-area-inset-top))',
              height: '32px'
            }}
          >
            <div className="flex items-center gap-2">
              <Activity className={cn("w-3 h-3", !isOnline && "animate-pulse")} />
              <span className="text-[8px] font-mono font-bold uppercase tracking-widest whitespace-nowrap">
                SIGNAL::{isOnline ? 'STABLE' : 'LOST'}
              </span>
            </div>
            {outboxCount > 0 && (
              <div className="flex items-center gap-2 border-l border-black/20 pl-4">
                <Terminal className="w-3 h-3 animate-pulse" />
                <span className="text-[8px] font-mono font-bold uppercase tracking-widest whitespace-nowrap">
                  PENDING_BUFFERS::{outboxCount}
                </span>
                <button 
                  onClick={() => ghostPeer.init()}
                  className="ml-2 bg-black/10 hover:bg-black/20 px-2 py-0.5 rounded text-[7px] border border-black/10 transition-all active:scale-95 pointer-events-auto"
                >
                  RETRY_SYNC
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        className="bg-[var(--bg-app)] text-[var(--fg-app)] font-sans selection:bg-[var(--accent)] selection:text-[#050505] overflow-hidden w-full fixed inset-0 flex flex-col"
        style={{ 
          height: viewportHeight,
          transform: `translateY(${viewportTop}px)`,
          paddingTop: (outboxCount > 0 || !isOnline) ? '32px' : '0px'
        }}
      >
        <div className="flex flex-grow w-full relative h-full flex-row overflow-hidden">
          {/* Sidebar */}
          <div className={cn(
            "flex-col border-r border-[var(--border-color)] transition-all duration-300 h-full",
            activeChatId ? "hidden md:flex w-full md:w-80" : "flex w-full md:w-80"
          )}>
            <ChatList 
              onSelectChat={setActiveChatId} 
              activeChatId={activeChatId} 
              currentPeerId={peerId} 
              onOpenScanner={() => setShowScanner(true)}
              onOpenSettings={() => setShowSettings(true)}
            />
          </div>

          {/* Main Chat Area */}
          <div className={cn(
            "flex-grow bg-[var(--bg-app)] transition-all duration-300 relative h-full",
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
                  <Welcome currentPeerId={peerId} onJoinChat={setActiveChatId} onOpenScanner={() => setShowScanner(true)} />
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Components Overlay */}
        <AnimatePresence>
          {showSettings && (
            <Settings 
              onClose={() => setShowSettings(false)} 
              onThemeChange={setTheme}
              currentTheme={theme}
            />
          )}
          {showScanner && (
            <Scanner 
              onScan={handleScan} 
              onClose={() => setShowScanner(false)} 
            />
          )}
          {isLocked && (
            <motion.div
              key="lock-screen"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-[var(--bg-app)]"
            >
              <LockScreen onUnlock={() => setIsLocked(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
