import { motion, AnimatePresence } from "motion/react";
import QRCode from "react-qr-code";
import Button from "./ui/Button";

interface InvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionName: string;
  joinToken: string | null;
}

export default function InvitationModal({ isOpen, onClose, sessionName, joinToken }: InvitationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-[#16324F] border border-white/10 rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl flex flex-col items-center gap-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#92BFFF]">Invitation</p>
              <h2 className="text-3xl font-bold text-[#92BFFF]">Join the Quiz!</h2>
              <p className="text-white/60 text-sm">Scan the QR code below to join instantly</p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-inner shadow-black/20">
              {joinToken ? (
                <QRCode 
                  value={`${typeof window !== 'undefined' ? window.location.origin : 'https://novarquiz.com'}/join/${joinToken}`} 
                  size={300} 
                  level="H" 
                />
              ) : (
                <div className="w-[300px] h-[300px] bg-gray-200 animate-pulse rounded-lg" />
              )}
            </div>

            <div className="w-full space-y-4">
              <div className="bg-[#0D1B2A] rounded-2xl p-5 border border-white/5 text-center shadow-inner">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#92BFFF]/50 mb-1">Or visit</p>
                <p className="text-sm font-mono text-[#92BFFF] break-all font-bold">
                  {`${typeof window !== 'undefined' ? window.location.origin : 'https://novarquiz.com'}/join/${joinToken}`}
                </p>
              </div>

              <div className="bg-[#0D1B2A] rounded-2xl p-5 border border-white/5 text-center shadow-inner">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#92BFFF]/50 mb-1">Enter PIN</p>
                <p className="text-4xl font-mono font-bold text-[#92BFFF] tracking-widest uppercase drop-shadow-sm">{joinToken}</p>
              </div>
            </div>

            <div className="flex w-full gap-3">
              <Button
                variant="primary"
                className="flex-1 justify-center py-4 rounded-2xl bg-linear-to-r from-[#055A9E] to-[#0460A9] shadow-lg shadow-[#0460A9]/30"
                onClick={onClose}
              >
                Done
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
