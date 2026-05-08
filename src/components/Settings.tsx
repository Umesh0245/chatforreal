import { useState } from 'react';
import { X, Shield, Moon, Sun, User, Trash2, Key, RotateCcw, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
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
  const [pinSaved, setPinSaved] = useState(false);

  const saveName = () => {
    localStorage.setItem('ghost_user_name', userName);
  };

  const handlePinChange = () => {
    if (newPin.length === 4) {
      localStorage.setItem('ghost_pin', newPin);
      setPinSaved(true);
      setTimeout(() => setPinSaved(false), 2000);
      setNewPin('');
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
    console.log('Kernel: Manually triggering outbox flush...');
    ghostPeer.init(); // Re-init to trigger connection checks
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

      <div className="flex-grow overflow-y-auto p-6 space-y-8 pb-32">
        {/* Profile Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-mono text-[var(--fg-muted)] uppercase tracking-[0.2em] px-1">Identity_Kernel</h3>
          <div className="p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-color)] space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-[var(--fg-muted)]">Local_Alias</label>
              <div className="flex gap-2">
                <div className="flex-grow relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)]" />
                  <input 
                    type="text" 
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    onBlur={saveName}
                    placeholder="Enter Alias..."
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl py-2 pl-10 pr-4 text-sm focus:border-[var(--accent)] outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interface Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-mono text-[var(--fg-muted)] uppercase tracking-[0.2em] px-1">Visual_Matrix</h3>
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => onThemeChange('dark')}
              className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${currentTheme === 'dark' ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]' : 'bg-[var(--bg-surface)] border-[var(--border-color)] opacity-60'}`}
            >
              <Moon className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Dark_Mode</span>
            </button>
            <button 
              onClick={() => onThemeChange('light')}
              className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${currentTheme === 'light' ? 'bg-[var(--accent)] border-transparent text-[#050505]' : 'bg-[var(--bg-surface)] border-[var(--border-color)] opacity-60'}`}
            >
              <Sun className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Light_Mode</span>
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
              <div className="flex gap-2">
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
                        window.location.reload();
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
                  placeholder="New 4-Digit PIN"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl py-2 px-4 text-center tracking-[1em] font-mono outline-none focus:border-[var(--accent)]"
                />
                <button 
                  onClick={handlePinChange}
                  disabled={newPin.length !== 4}
                  className="w-full py-2 bg-[var(--accent)] text-[#050505] rounded-xl font-bold text-[10px] uppercase tracking-widest disabled:opacity-30"
                >
                  {pinSaved ? 'KEY_UPDATED' : 'UPDATE_SECURITY_KEY'}
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
              className="w-full p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl flex items-center justify-between group hover:border-[var(--accent)]/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <RotateCcw className="w-4 h-4 text-[var(--accent)] group-hover:rotate-180 transition-transform duration-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest">Flush_Signal_Outbox</span>
              </div>
              <span className="text-[8px] opacity-40 uppercase">Manual_Resync</span>
            </button>
            <button 
              onClick={clearAllData}
              className="w-full p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex items-center justify-between group hover:bg-red-500/10 transition-all"
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

      <div className="absolute bottom-6 left-6 right-6 p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-color)] text-center">
        <p className="text-[8px] font-mono text-[var(--fg-muted)] tracking-[0.3em] uppercase">Ghost_Bridge_Kernel v4.2.0 // E2EE_ACTIVE</p>
      </div>
    </motion.div>
  );
}
