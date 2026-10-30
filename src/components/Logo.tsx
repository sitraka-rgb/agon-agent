import { classNames } from '../lib/utils';

export function SalonLogo({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <div
      className={classNames('relative rounded-full sheen overflow-hidden', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <defs>
          <linearGradient id="lg-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f0d78c" />
            <stop offset="0.45" stopColor="#d9b45b" />
            <stop offset="1" stopColor="#8f6f2c" />
          </linearGradient>
          <radialGradient id="lg-bg" cx="0.38" cy="0.34" r="0.9">
            <stop offset="0" stopColor="#14291e" />
            <stop offset="1" stopColor="#060f0a" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="31" fill="url(#lg-bg)" stroke="url(#lg-gold)" strokeWidth="2.4" />
        <circle cx="32" cy="24.5" r="9.2" fill="none" stroke="url(#lg-gold)" strokeWidth="4.2" />
        <path d="M26.8 30.8 L22.4 47.5 a2.3 2.3 0 0 0 2.2 2.8 h14.8 a2.3 2.3 0 0 0 2.2-2.8 L37.2 30.8 Z" fill="url(#lg-gold)" />
      </svg>
    </div>
  );
}
