import { useEffect } from "react";
import { createPortal } from "react-dom";
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
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (typeof document === "undefined") {
    return null;
  }

  const joinUrl = `${typeof window !== "undefined" ? window.location.origin : "https://novarquiz.com"}/join/${joinToken}`;

  return createPortal((
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
            className="relative flex max-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col items-center gap-6 overflow-y-auto rounded-[2rem] border border-white/10 bg-[#16324F] p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute right-5 top-5 rounded-full p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close invitation"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="space-y-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#92BFFF]">Invitation</p>
              <h2 className="text-3xl font-bold text-[#92BFFF]">Join the Quiz!</h2>
              <p className="text-sm text-white/60">Scan the QR code below to join instantly</p>
              {sessionName && (
                <p className="mx-auto max-w-sm text-sm font-medium text-white/75">{sessionName}</p>
              )}
            </div>

            <div className="rounded-[2rem] bg-white p-4 shadow-inner shadow-black/20 sm:p-6">
              {joinToken ? (
                <QRCode 
                  value={joinUrl}
                  size={300}
                  level="H" 
                  className="h-auto w-full max-w-[300px]"
                />
              ) : (
                <div className="h-[260px] w-[260px] animate-pulse rounded-lg bg-gray-200 sm:h-[300px] sm:w-[300px]" />
              )}
            </div>

            <div className="w-full space-y-4">
              <div className="bg-[#0D1B2A] rounded-2xl p-5 border border-white/5 text-center shadow-inner">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#92BFFF]/50 mb-1">Or visit</p>
                <p className="text-sm font-mono text-[#92BFFF] break-all font-bold">
                  {joinUrl}
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
  ), document.body);
}
