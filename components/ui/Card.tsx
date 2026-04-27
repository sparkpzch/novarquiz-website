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
    "rounded-[30px] p-3.5 md:p-4",
    onClick && "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(17,87,145,0.18)]",
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
 * Uses `nq-topic` typography.
 */
Card.Header = function CardHeader({ icon, title, className }: CardHeaderProps) {
  return (
    <div className={cn("mb-2.5 flex items-center gap-2", className)}>
      {icon && <span className="text-base leading-none">{icon}</span>}
      <h2 className="nq-topic">{title}</h2>
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
    "rounded-[18px] bg-white/72 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
    onClick && "cursor-pointer transition hover:bg-white/90",
    className,
  );

  const content = (
    <>
      <p className="nq-details">{label}</p>
      <p className="mt-1 text-base font-bold nq-text-accent">{value}</p>
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
    "w-full flex items-center gap-3 rounded-[18px] bg-white/72 p-3",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] text-left",
    onClick && "cursor-pointer transition hover:bg-white/90",
    className,
  );

  const content = (
    <>
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#92BFFF] to-[#70A2F9] text-lg text-white shadow shadow-[#0460A9]/16">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="nq-subject truncate">{title}</p>
        {subtitle && <p className="nq-content">{subtitle}</p>}
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
