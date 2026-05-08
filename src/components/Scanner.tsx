import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Cpu, Camera, RefreshCw, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function Scanner({ onScan, onClose }: ScannerProps) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const qrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerId = "reader-container";

  useEffect(() => {
    let isMounted = true;
    
    const initializeScanner = async () => {
      // Add a small delay to ensure the container is stable and in DOM
      await new Promise(r => setTimeout(r, 800));
      if (!isMounted) return;

      try {
        const qrCode = new Html5Qrcode(readerId);
        qrCodeRef.current = qrCode;

        setCameraPermission(true);

        const config = {
          fps: 20,
          qrbox: { width: 280, height: 280 },
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          aspectRatio: 1.0
        };

        // Strict priority 1: Environment (Back) camera
        try {
          await qrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              onScan(decodedText);
              stopScanner();
            },
            () => {} 
          );
        } catch (e) {
          console.warn("Back camera failed, searching for any camera...", e);
          
          const devices = await Html5Qrcode.getCameras();
          if (!devices || devices.length === 0) {
            throw new Error("Optical sensor not detected.");
          }

          // Try the last device (often the primary back camera on many mobiles)
          const lastCamera = devices[devices.length - 1];
          await qrCode.start(
            lastCamera.id,
            config,
            (decodedText) => {
              onScan(decodedText);
              stopScanner();
            },
            () => {}
          );
        }
        
        setIsInitializing(false);
      } catch (err: any) {
        console.error("Scanner initialization failed", err);
        setError(err.message || "Failed to access optical sensor.");
        setIsInitializing(false);
        setCameraPermission(false);
      }
    };

    initializeScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [onScan]);

  const stopScanner = async () => {
    if (qrCodeRef.current && qrCodeRef.current.isScanning) {
      try {
        await qrCodeRef.current.stop();
        qrCodeRef.current.clear();
      } catch (err) {
        console.error("Failed to stop scanner", err);
      }
    }
  };

  const handleSwitchCamera = async () => {
    if (!qrCodeRef.current) return;
    
    setIsInitializing(true);
    try {
      const isCurrentlyScanning = qrCodeRef.current.isScanning;
      if (isCurrentlyScanning) {
        await qrCodeRef.current.stop();
      }
      
      // Toggle facing mode: if we don't know, we'll try to get cameras and pick next
      const devices = await Html5Qrcode.getCameras();
      // Simple toggle logic or cycle through devices
      const currentCameraId = (qrCodeRef.current as any)._currentCameraId;
      const currentIndex = devices.findIndex(d => d.id === currentCameraId);
      const nextIndex = (currentIndex + 1) % devices.length;
      
      await qrCodeRef.current.start(
        devices[nextIndex].id,
        {
          fps: 15,
          qrbox: { width: 260, height: 260 }
        },
        (decodedText) => {
          onScan(decodedText);
          stopScanner();
        },
        () => {}
      );
      setIsInitializing(false);
    } catch (err) {
      console.error("Camera switch failed", err);
      setIsInitializing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-[#050505] flex flex-col items-center justify-center font-mono"
    >
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(242,125,38,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(242,125,38,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_90%)] pointer-events-none" />

      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-[210]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--accent)]/10 rounded-xl border border-[var(--accent)]/20 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-[var(--accent)] animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--accent)] tracking-[0.2em] uppercase">Channel_Init</h2>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-white/40 uppercase tracking-widest">Optical_Feed_Active</span>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white transition-all active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scanner Viewport */}
      <div className="relative z-[205] w-[85vw] max-w-sm aspect-square">
        {/* Corner Brackets */}
        <div className="absolute -top-2 -left-2 w-8 h-8 border-t-2 border-l-2 border-[var(--accent)] rounded-tl-lg" />
        <div className="absolute -top-2 -right-2 w-8 h-8 border-t-2 border-r-2 border-[var(--accent)] rounded-tr-lg" />
        <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-2 border-l-2 border-[var(--accent)] rounded-bl-lg" />
        <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-2 border-r-2 border-[var(--accent)] rounded-br-lg" />

        <div 
          id={readerId} 
          className="w-full h-full rounded-2xl overflow-hidden bg-white/5 border border-white/10 relative"
        >
          {isInitializing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#050505]">
              <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
              <p className="text-[10px] text-[var(--accent)] uppercase tracking-[0.3em]">Calibrating_Sensors...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#050505] z-20">
              <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-red-500 font-bold mb-2 uppercase text-xs tracking-widest">Hardware_Fault</h3>
              <p className="text-[10px] text-white/40 leading-relaxed uppercase">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-6 px-6 py-2 bg-white/5 border border-white/10 text-white text-[10px] rounded-lg uppercase tracking-[0.2em] hover:bg-white/10"
              >
                Reboot_Module
              </button>
            </div>
          )}
        </div>

        {/* Scanning Line Animation */}
        {!isInitializing && !error && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--accent)] shadow-[0_0_15px_var(--accent)] opacity-50 z-10 animate-[scan_2s_ease-in-out_infinite]" />
        )}

        {/* Info Badge */}
        <div className="absolute -bottom-16 left-0 right-0 flex justify-center">
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-full px-6 py-2 flex items-center gap-3">
            <Camera className="w-3 h-3 text-[var(--accent)]" />
            <span className="text-[9px] text-white/60 uppercase tracking-[0.2em]">Align Remote QR Within Matrix</span>
          </div>
        </div>
      </div>

      {/* Control Buttons Area */}
      <div className="absolute bottom-12 left-0 right-0 px-8 flex justify-center gap-4 z-[210]">
        <button 
          onClick={handleSwitchCamera}
          className="flex items-center gap-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white px-6 py-3 rounded-2xl transition-all active:scale-95"
        >
          <RefreshCw className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-[10px] uppercase tracking-widest">Switch_Input</span>
        </button>
      </div>

      {/* Footer Metadata */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none opacity-20">
        <p className="text-[8px] tracking-[0.5em] text-white text-center">
          TUNNEL_PROTOCOL_SECURED_VIA_E2EE // NODE_ACCESS_READ_ONLY
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan {
          0%, 100% { top: 5%; }
          50% { top: 95%; }
        }
        #reader-container video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
        }
      `}} />
    </motion.div>
  );
}
