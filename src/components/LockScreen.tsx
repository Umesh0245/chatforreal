import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Cpu, Lock } from 'lucide-react';

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleInput = (val: string) => {
    if (pin.length < 4) {
      const newPin = pin + val;
      setPin(newPin);
      if (newPin.length === 4) {
        if (newPin === '4444') {
          onUnlock();
        } else {
          setError(true);
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 500);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--bg-app)] flex flex-col items-center justify-center p-8 select-none overflow-hidden">
      <div className="absolute inset-0 overflow-hidden opacity-5 pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent animate-scan" />
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="w-20 h-20 bg-[var(--accent)]/5 rounded-sm flex items-center justify-center mx-auto mb-6 border border-[var(--accent)]/10 transform rotate-45">
          <div className="transform -rotate-45">
            <Cpu className="w-10 h-10 text-[var(--accent)] animate-pulse" />
          </div>
        </div>
        <h2 className="text-xs font-mono uppercase tracking-[0.6em] text-[var(--accent)] opacity-40 mb-1">Bridge_Kernel_v4</h2>
        <h1 className="text-xl font-mono uppercase tracking-widest text-[var(--fg-app)]">Auth_Required</h1>
      </motion.div>

      <div className="flex gap-4 mb-12">
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            animate={error ? { x: [0, -10, 10, -10, 0] } : {}}
            className={`w-4 h-4 rounded-full border ${pin.length > i ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-color)]'} transition-all`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 max-w-[280px] w-full">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'clear'].map((val, i) => (
          <button
            key={i}
            disabled={!val}
            onClick={() => val === 'clear' ? setPin('') : handleInput(val)}
            className={`h-16 flex items-center justify-center rounded-xl font-mono text-xl ${!val ? 'opacity-0' : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-input)] active:bg-[var(--accent)] active:text-[#050505] transition-all border border-[var(--border-color)] text-[var(--fg-app)]'}`}
          >
            {val === 'clear' ? <Lock className="w-5 h-5 text-[var(--fg-muted)]" /> : val}
          </button>
        ))}
      </div>

      <div className="mt-12 flex items-center gap-2 opacity-20">
        <Cpu className="w-4 h-4" />
        <span className="text-[10px] font-mono tracking-widest uppercase">System_Locked_P2P_Active</span>
      </div>
    </div>
  );
}
