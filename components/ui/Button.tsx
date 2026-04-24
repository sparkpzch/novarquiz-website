'use client';

import { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  style,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'text-white shadow-md active:opacity-90 focus:ring-blue-400',
    secondary: 'bg-white text-[#192246] border border-[#0460A9]/14 hover:bg-[#F3F8FF] hover:border-[#70A2F9]/40 focus:ring-[#92BFFF] shadow-sm',
    danger: 'bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-700 hover:to-rose-700 focus:ring-red-500 shadow-lg shadow-red-500/25',
    ghost: 'text-[#5D7EA1] hover:text-[#192246] hover:bg-white/70 focus:ring-[#92BFFF]',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-3 text-sm',
    lg: 'px-6 py-3.5 text-base',
  };

  // Primary gets blue gradient via inline style so it works reliably on mobile too
  const primaryStyle: CSSProperties = variant === 'primary'
    ? { background: 'linear-gradient(135deg, #4f82e8 0%, #3b5fd4 100%)', ...style }
    : (style ?? {});

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      style={primaryStyle}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        icon
      ) : null}
      {children}
    </button>
  );
}
