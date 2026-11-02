import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Button ─────────────────────────────────────────────────── */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:scale-[0.985] focus-visible:ring-brand-500/60',
  secondary:
    'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-ink-700 hover:bg-ink-50 dark:text-ink-100 dark:hover:bg-ink-800 focus-visible:ring-brand-500/40',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500/50',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-11 px-5 text-sm rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--bg))] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ── Inputs ─────────────────────────────────────────────────── */
export function Input({ className, invalid, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn('input', invalid && 'border-rose-400 focus:border-rose-400 focus:ring-rose-500/10', className)} {...props} />;
}

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('input resize-y leading-relaxed', className)} {...props} />;
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input cursor-pointer', className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('label', className)} {...props}>
      {children}
    </label>
  );
}

export function Field({ label, error, hint, children, className }: { label?: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      {children}
      {error ? <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p> : hint ? <p className="mt-1.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────── */
type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
};

export function Badge({ children, className, tone = 'neutral' }: { children: ReactNode; className?: string; tone?: Tone }) {
  return <span className={cn('badge', TONES[tone], className)}>{children}</span>;
}

/* ── Card ───────────────────────────────────────────────────── */
export function Card({ children, className, ...props }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card animate-slide-up', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">{icon}</div>}
        <div>
          <h3 className="font-display text-[15px] font-bold tracking-tight text-ink-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ── Modal ──────────────────────────────────────────────────── */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="presentation">
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl animate-scale-in sm:rounded-2xl', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[rgb(var(--border))] px-5 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-[rgb(var(--border))] px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onClose]);
}

/* ── States ─────────────────────────────────────────────────── */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-brand-600', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-300">{icon}</div>
      <h4 className="font-display text-sm font-bold text-ink-900 dark:text-white">{title}</h4>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-500 dark:text-ink-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-8 text-center dark:border-rose-500/20 dark:bg-rose-500/5">
      <AlertCircle className="mb-2 h-6 w-6 text-rose-500" />
      <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'success' | 'warning' | 'danger' }) {
  const tones = { brand: 'bg-brand-500', success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-rose-500' };
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800', className)}>
      <div className={cn('h-full rounded-full transition-all duration-500', tones[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/* ── Toasts ─────────────────────────────────────────────────── */
type ToastItem = { id: number; message: string; tone: 'info' | 'success' | 'error' };
let pushToast: ((message: string, tone?: ToastItem['tone']) => void) | null = null;
export function toast(message: string, tone: ToastItem['tone'] = 'info') {
  pushToast?.(message, tone);
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useMemo(() => {
    pushToast = (message, tone = 'info') => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4200);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  const icons = { info: Info, success: CheckCircle2, error: AlertCircle };
  return createPortal(
    <div className="fixed bottom-5 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {items.map((i) => {
        const Icon = icons[i.tone];
        return (
          <div
            key={i.id}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-lift animate-slide-up backdrop-blur',
              i.tone === 'error'
                ? 'border-rose-200 bg-rose-50/95 text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/90 dark:text-rose-100'
                : i.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/90 dark:text-emerald-100'
                  : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 text-ink-800 dark:text-ink-100',
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1 leading-snug">{i.message}</span>
            <button onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))} className="rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function useToast() {
  return useCallback((message: string, tone: ToastItem['tone'] = 'info') => toast(message, tone), []);
}
