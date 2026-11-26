/**
 * The AI-LifeHub mark.
 *
 * A monogram, not a decoration: the "L" of Life is drawn as the baseline and
 * the stem, the "H" of Hub stands on it, and the ascending stroke of the H rises
 * past the cap height as an arrow — life going up. One geometry, one weight, no
 * sparkle, no gradient rainbow. It reads at 16px and at 200px.
 *
 * The mark is drawn on a 32-unit grid with a 1.6 stroke, so every use is the
 * same drawing at a different size. Colour comes from `currentColor` (or the
 * gradient in the app icon), never from the caller.
 */

import { useId } from 'react';

type MarkProps = {
  /** Pixel size of the square the mark is drawn in. */
  size?: number;
  className?: string;
  /** Unique id for the gradient, when the mark is filled with one. */
  /** Draw the mark in its gradient rather than currentColor. */
  gradient?: boolean;
  title?: string;
};

/**
 * The path geometry shared by the React mark and the icons.
 *
 * An "A" monogram with an orbital swoosh crossing it and a four-point star at
 * the apex — the AI-LifeHub identity: a letterform that is also a launch, the
 * orbit for the "Life" that circles it, and the star for the intelligence.
 * Everything is on the same 32-unit grid and the same 1.8 stroke weight, so it
 * scales from a 16px favicon to a 200px tile without redrawing anything.
 */
export const MARK_PATHS = {
  /** The A: two rising strokes meeting at the apex, with its crossbar. */
  a: 'M9.6 24.4 L16 7.6 L22.4 24.4 M12.2 19.2 H19.8',
  /** The orbit: an ellipse tilted across the letter, drawn behind and in front. */
  orbit:
    'M4.6 21.2 C2.2 16.4 11.6 9.4 20.2 7.6 C25.6 6.4 29.2 8.8 28.2 12.2 C27.2 15.8 20.4 18.4 13.6 19.6',
  /** The near half of the orbit: drawn over the letter. */
  orbitFront:
    'M13.6 19.6 C18.4 18.8 24.2 16.6 27.2 14.4 C28.6 13.4 28.6 11.6 28.2 12.2 C27.2 15.8 20.4 18.4 13.6 19.6 Z',
  /** The four-point star at the apex. */
  star: 'M25.6 2.6 L26.6 6.2 L30.2 7.2 L26.6 8.2 L25.6 11.8 L24.6 8.2 L21 7.2 L24.6 6.2 Z',
} as const;

export function LogoMark({
  size = 32,
  className,
  gradient = false,
  title,
}: MarkProps) {
  // Every instance gets its own id: two marks on one page sharing an id is the
  // classic SVG trap where the second one silently paints nothing.
  const uid = useId().replace(/[:]/g, '');
  const id = `lh-mark-${uid}`;
  const stroke = gradient ? `url(#${id})` : 'currentColor';
  // A 1.6 stroke on a 32-unit grid works out to 0.05 × size device pixels, which
  // drops below one pixel under ~24px and reads as grey mush. Thicken the drawing
  // only at those sizes; the geometry is unchanged, so it stays the same mark.
  const strokeWidth = size < 24 ? 2.1 : size < 40 ? 1.8 : 1.6;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {gradient && (
        <defs>
          <linearGradient id={id} x1="6" y1="26" x2="27" y2="6" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A855F7" />
            <stop offset="0.5" stopColor="#6366F1" />
            <stop offset="1" stopColor="#38BDF8" />
          </linearGradient>
        </defs>
      )}
      {/* Behind pass: the far side of the orbit, dimmed by the letter above it. */}
      <path d={MARK_PATHS.orbit} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" opacity={0.45} />
      <g stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={MARK_PATHS.a} />
      </g>
      {/* Front pass: the near side crosses over the letter, which is what makes
          the orbit read as an orbit and not a decorative swoosh. */}
      <path d={MARK_PATHS.orbitFront} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
      <path d={MARK_PATHS.star} fill={stroke} stroke="none" />
    </svg>
  );
}

/**
 * The full lockup: the mark in a rounded tile, then the wordmark with its second
 * half in the brand gradient. The tile carries the identity's glow, and is the
 * one place in the chrome allowed a coloured shadow.
 */
export function Logo({
  size = 36,
  showWordmark = true,
  subtitle = 'Organize · Focus · Achieve',
  className,
  wordmarkClassName,
  tone = 'auto',
}: {
  size?: number;
  showWordmark?: boolean;
  subtitle?: string | null;
  className?: string;
  wordmarkClassName?: string;
  /** `light` for dark surfaces, `dark` for light ones, `auto` to follow the theme. */
  tone?: 'auto' | 'light' | 'dark';
}) {
  const textTone =
    tone === 'light' ? 'text-white' : tone === 'dark' ? 'text-ink-900' : 'text-ink-900 dark:text-white';
  const subTone =
    tone === 'light'
      ? 'text-white/55'
      : tone === 'dark'
        ? 'text-ink-400'
        : 'text-ink-400 dark:text-white/55';

  return (
    <div className={['flex items-center gap-2.5', className].filter(Boolean).join(' ')}>
      <span
        className="relative inline-flex shrink-0 items-center justify-center rounded-[10px] bg-[#0B1020] ring-1 ring-inset ring-blue-400/40 shadow-[0_0_18px_-4px_rgba(124,58,237,0.65)]"
        style={{ width: size, height: size }}
      >
        <LogoMark size={Math.round(size * 0.84)} gradient />
      </span>
      {showWordmark && (
        <span className="leading-tight">
          <span
            className={['block font-display text-[15px] font-extrabold tracking-[-0.02em]', textTone, wordmarkClassName]
              .filter(Boolean)
              .join(' ')}
          >
            AI-Life
            <span className="bg-gradient-to-r from-brand-400 to-sky-400 bg-clip-text text-brand-300 [background-clip:text]">Hub</span>
          </span>
          {subtitle && (
            <span className={['block text-[10px] font-medium uppercase tracking-[0.12em]', subTone].join(' ')}>
              {subtitle}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
