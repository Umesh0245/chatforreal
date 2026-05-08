import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function Scanner({ onScan, onClose }: ScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Initialize scanner
    const scanner = new Html5QrcodeScanner(
      "reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
      },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        onScan(decodedText);
        scanner.clear();
      },
      (error) => {
        // Handle code scan error, usually safe to ignore
      }
    );

    scannerRef.current = scanner;

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error("Scanner cleanup error", err));
      }
    };
  }, [onScan]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-[var(--bg-app)] flex flex-col"
    >
      <header className="p-6 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-app)]/80 backdrop-blur-xl">
        <h2 className="text-xl font-mono italic flex items-center gap-2 text-[var(--accent)] uppercase tracking-tighter">
          <Cpu className="w-5 h-5" /> SYNC_SCANNER<span className="not-italic text-[var(--fg-app)] opacity-30">[KRNL]</span>
        </h2>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-[var(--bg-input)] rounded-full text-[var(--fg-muted)]"
        >
          <X className="w-6 h-6" />
        </button>
      </header>

      <div className="flex-grow flex flex-col items-center justify-center p-6 bg-black/40">
        <div id="reader" className="w-full max-w-sm rounded-[2rem] overflow-hidden border-2 border-[var(--accent)]/30 bg-[var(--bg-surface)] shadow-[0_0_50px_rgba(242,125,38,0.1)]"></div>
        <div className="mt-8 text-center max-w-xs">
          <p className="text-[10px] font-mono text-[var(--fg-muted)] uppercase tracking-[0.2em] leading-relaxed">
            ALIGN REMOTE PEER QR CODE WITHIN FRAME TO ESTABLISH E2EE TUNNEL DATA STREAM
          </p>
        </div>
      </div>
      
      {/* Decorative scan line */}
      <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--accent)]/20 animate-scan pointer-events-none" />
    </motion.div>
  );
}
