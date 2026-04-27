import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Use "soft" for a lighter variant (nq-card-soft) */
  variant?: "default" | "soft";
  /** onClick makes the card a clickable button */
  onClick?: () => void;
}

interface CardHeaderProps {
  icon?: ReactNode;
  title: string;
  className?: string;
}

interface CardTileProps {
  label: string;
  value: ReactNode;
  className?: string;
  /** Render as a clickable button tile */
  onClick?: () => void;
}

interface CardRowProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  className?: string;
  onClick?: () => void;
}

// ─── Card (container) ─────────────────────────────────────────────────────────

/**
 * Base card container. Matches the `nq-card` / `nq-card-soft` glass styling.
 * Accepts an `onClick` to become a button.
 */
export function Card({ children, className, variant = "default", onClick }: CardProps) {
  const base = cn(
    variant === "soft" ? "nq-card-soft" : "nq-card",
    "rounded-[32px] p-5 md:p-6",
    onClick && "cursor-pointer transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_64px_rgba(17,87,145,0.2)] active:scale-[0.985]",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, "text-left w-full")}>
        {children}
      </button>
    );
  }

  return <div className={base}>{children}</div>;
}

// ─── Card.Header ──────────────────────────────────────────────────────────────

/**
 * A compact header row — small icon + title — that sits at the top of a card.
 * Uses `nq-topic` typography with font-display.
 */
Card.Header = function CardHeader({ icon, title, className }: CardHeaderProps) {
  return (
    <div className={cn("mb-4 flex items-center gap-2.5", className)}>
      {icon && <span className="text-xl leading-none drop-shadow-sm">{icon}</span>}
      <h2 className="nq-topic font-display font-bold tracking-tight">{title}</h2>
    </div>
  );
};

// ─── Card.Tile ────────────────────────────────────────────────────────────────

/**
 * A small stat tile used inside a card grid.
 * label  → `nq-details` (eyebrow label)
 * value  → `nq-topic`   (numeric / primary value)
 */
Card.Tile = function CardTile({ label, value, className, onClick }: CardTileProps) {
  const base = cn(
    "rounded-[22px] bg-white/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition duration-200",
    onClick
      ? "border border-[#0460A9]/18 cursor-pointer hover:bg-white hover:border-[#0460A9]/35 hover:shadow-md active:scale-[0.96]"
      : "border-none",
    className,
  );

  const content = (
    <>
      <p className="nq-details font-bold text-[#5D7EA1] tracking-[0.12em]">{label}</p>
      <p className="mt-2 text-xl font-bold nq-text-accent font-display">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, "text-left flex flex-col")}>
        {content}
      </button>
    );
  }

  return <div className={base}>{content}</div>;
};

// ─── Card.Row ─────────────────────────────────────────────────────────────────

/**
 * A horizontal content row — icon + title/subtitle + optional trailing element.
 * Used for list-style entries within a card (e.g. session entries).
 * title    → `nq-subject`
 * subtitle → `nq-content`
 */
Card.Row = function CardRow({ icon, title, subtitle, trailing, className, onClick }: CardRowProps) {
  const base = cn(
    "w-full flex items-center gap-4 rounded-[22px] bg-white/72 p-4",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] text-left transition duration-200",
    onClick
      ? "border border-[#0460A9]/18 cursor-pointer hover:bg-white hover:border-[#0460A9]/35 hover:shadow-md active:scale-[0.98]"
      : "border-none",
    className,
  );

  const content = (
    <>
      {icon && (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#0460A9] to-[#70A2F9] text-xl text-white shadow-lg shadow-[#0460A9]/20">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="nq-subject truncate font-bold text-[#16324F]">{title}</p>
        {subtitle && <p className="nq-content mt-0.5 text-[#5D7EA1] font-medium">{subtitle}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {content}
      </button>
    );
  }

  return <div className={base}>{content}</div>;
};
