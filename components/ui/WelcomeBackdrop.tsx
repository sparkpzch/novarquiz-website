/** Shared decorative background for the Home welcome card and Profile. */
export default function WelcomeBackdrop() {
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <div className="absolute -right-12 -top-16 h-60 w-60 rounded-[42%] bg-[#ce6cff]/55 blur-2xl" />
    <div className="absolute bottom-[-90px] left-[20%] h-56 w-72 rotate-[-18deg] rounded-[48%] bg-[#159cff]/55 blur-2xl" />
    <div className="absolute right-[12%] top-[40%] h-24 w-52 rotate-[-28deg] rounded-[80%_20%] bg-white/40 blur-xl" />
    <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_25%,rgba(255,255,255,.12)_55%,transparent_70%)]" />
  </div>;
}
