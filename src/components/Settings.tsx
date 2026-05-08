import { useState, useEffect } from 'react';
import { X, Shield, Moon, Sun, User, Trash2, Key, RotateCcw, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/db';
import { ghostPeer } from '../lib/peer';

interface SettingsProps {
  onClose: () => void;
  onThemeChange: (theme: 'dark' | 'light') => void;
  currentTheme: 'dark' | 'light';
}

export function Settings({ onClose, onThemeChange, currentTheme }: SettingsProps) {
  const [userName, setUserName] = useState(localStorage.getItem('ghost_user_name') || '');
  const [showPinChange, setShowPinChange] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
  };

  const saveName = () => {
    localStorage.setItem('ghost_user_name', userName);
    showToast('Identity Alias Synchronized');
  };

  const handlePinChange = () => {
    if (newPin.length === 4) {
      localStorage.setItem('ghost_pin', newPin);
      showToast('Master Access PIN Updated');
      setNewPin('');
      setShowPinChange(false);
    }
  };

  const clearAllData = async () => {
    if (confirm('CRITICAL: This will destroy all local message buffers and identity keys. This action is irreversible. Proceed?')) {
      await db.delete();
      localStorage.clear();
      window.location.reload();
    }
  };

  const flushOutbox = async () => {
    showToast('Signal Outbox Flushed', 'info');
    ghostPeer.init(); 
  };

  return (
    <motion.div 
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      className="fixed inset-0 z-[1000] bg-[var(--bg-app)] flex flex-col items-stretch h-full w-full"
    >
      <header className="p-6 pt-12 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-app)]/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-3 bg-[var(--bg-input)] rounded-2xl hover:bg-[var(--border-color)] transition-all active:scale-90">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h2 className="text-xl font-mono uppercase tracking-tighter flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--accent)]" /> SYSTEM_CONFIG
            </h2>
            <span className="text-[8px] font-mono opacity-40 uppercase tracking-[0.2em]">Bridge_Kernel_V4.2.0</span>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-[var(--fg-muted)] hover:text-[var(--fg-app)] hidden md:block">
          <X className="w-6 h-6" />
        </button>
      </header>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[1100] bg-black text-white px-6 py-3 rounded-2xl flex items-center gap-3 shadow-2xl border border-white/10"
          >
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-grow overflow-y-auto p-6 space-y-8 pb-32">
        {/* Profile Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-mono text-[var(--fg-muted)] uppercase tracking-[0.2em] px-1">Identity_Kernel</h3>
          <div className="p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-color)] space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase text-[var(--fg-muted)]">Local_Alias</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)]" />
                  <input 
                    type="text" 
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Enter Alias..."
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl py-3 pl-10 pr-4 text-sm focus:border-[var(--accent)] outline-none transition-all"
                  />
                </div>
              </div>
              <button 
                onClick={saveName}
                className="w-full py-3 bg-[var(--accent)] text-[#050505] rounded-xl font-bold text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-[var(--accent)]/10"
              >
                SYNC_IDENTITY_PROFILE
              </button>
            </div>
          </div>
        </section>

        {/* Interface Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-mono text-[var(--fg-muted)] uppercase tracking-[0.2em] px-1">Visual_Matrix</h3>
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => onThemeChange('dark')}
              className={`p-6 rounded-2xl border flex flex-col items-center gap-3 transition-all ${currentTheme === 'dark' ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]' : 'bg-[var(--bg-surface)] border-[var(--border-color)] opacity-60'}`}
            >
              <Moon className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Dark_Core</span>
            </button>
            <button 
              onClick={() => onThemeChange('light')}
              className={`p-6 rounded-2xl border flex flex-col items-center gap-3 transition-all ${currentTheme === 'light' ? 'bg-[var(--accent)] border-transparent text-[#050505] shadow-lg shadow-[var(--accent)]/20' : 'bg-[var(--bg-surface)] border-[var(--border-color)] opacity-60'}`}
            >
              <Sun className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Light_Core</span>
            </button>
          </div>
        </section>

        {/* Security Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-mono text-[var(--fg-muted)] uppercase tracking-[0.2em] px-1">Encryption_Parameters</h3>
          <div className="p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-color)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Key className="w-4 h-4 text-[var(--fg-muted)]" />
                <span className="text-xs uppercase font-mono">Access_PIN</span>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowPinChange(!showPinChange)}
                  className="text-[10px] text-[var(--accent)] uppercase font-bold hover:underline"
                >
                  {showPinChange ? 'Cancel' : 'Configure'}
                </button>
                {localStorage.getItem('ghost_pin') && !showPinChange && (
                  <button 
                    onClick={() => {
                      if(confirm('Disable PIN lock?')) {
                        localStorage.removeItem('ghost_pin');
                        showToast('PIN Lock Disabled', 'info');
                        setTimeout(() => window.location.reload(), 1000);
                      }
                    }}
                    className="text-[10px] text-red-500 uppercase font-bold hover:underline"
                  >
                    Disable
                  </button>
                )}
              </div>
            </div>
            {showPinChange && (
              <div className="space-y-3 pt-2">
                <input 
                  type="password" 
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="NEW 4-DIGIT KEY"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl py-4 px-4 text-center tracking-[1em] font-mono text-lg outline-none focus:border-[var(--accent)]"
                />
                <button 
                  onClick={handlePinChange}
                  disabled={newPin.length !== 4}
                  className="w-full py-4 bg-[var(--accent)] text-[#050505] rounded-xl font-bold text-[10px] uppercase tracking-widest disabled:opacity-30 active:scale-95 transition-all"
                >
                  UPDATE_SECURITY_KEY
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Maintenance Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-mono text-[var(--fg-muted)] uppercase tracking-[0.2em] px-1">Kernel_Maintenance</h3>
          <div className="flex flex-col gap-3">
            <button 
              onClick={flushOutbox}
              className="w-full p-5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl flex items-center justify-between group hover:border-[var(--accent)]/30 transition-all active:scale-95"
            >
              <div className="flex items-center gap-3">
                <RotateCcw className="w-4 h-4 text-[var(--accent)] group-hover:rotate-180 transition-transform duration-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest">Flush_Signal_Outbox</span>
              </div>
              <span className="text-[8px] opacity-40 uppercase">Manual_Resync</span>
            </button>
            <button 
              onClick={clearAllData}
              className="w-full p-5 bg-red-500/5 border border-red-500/20 rounded-xl flex items-center justify-between group hover:bg-red-500/10 transition-all active:scale-95"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-4 h-4 text-red-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-red-500">Purge_System_Data</span>
              </div>
              <span className="text-[8px] text-red-500/50 uppercase">Safe_Delete</span>
            </button>
          </div>
        </section>
      </div>

      <div className="shrink-0 p-8 border-t border-[var(--border-color)] bg-[var(--bg-app)]">
        <p className="text-[8px] font-mono text-[var(--fg-muted)] tracking-[0.4em] text-center uppercase opacity-50">Ghost_Bridge_Kernel v4.2.0 // E2EE_ACTIVE_STREAMS</p>
      </div>
    </motion.div>
  );
}
