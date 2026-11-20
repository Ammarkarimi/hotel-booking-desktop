// The building blocks of every screen.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 border-brand-700 shadow-sm",
  secondary: "bg-white text-slate-800 hover:bg-slate-50 border-slate-300 shadow-sm",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-200/70 border-transparent",
  danger: "bg-white text-red-700 hover:bg-red-50 border-red-300",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700 shadow-sm",
  warning: "bg-amber-500 text-white hover:bg-amber-600 border-amber-600 shadow-sm",
};
const SIZES = { sm: "h-7 px-2.5 text-[12.5px] gap-1.5", md: "h-9 px-3.5 text-[13.5px] gap-2", lg: "h-11 px-5 text-[15px] gap-2" };

export function Button({ variant = "secondary", size = "md", icon, loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES; icon?: ReactNode; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx("inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border font-medium whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50", VARIANTS[variant], SIZES[size], className)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** Inputs fill their space unless the caller gives a width. */
function widthCls(className?: string) {
  return className && /(^|\s)(w-|max-w-|flex-1)/.test(className) ? "" : "w-full";
}

const inputCls = "h-9 rounded-md border border-slate-300 bg-white px-2.5 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(inputCls, widthCls(className), className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(inputCls, widthCls(className), "h-auto min-h-[70px] py-2", className)} />;
}

export function Select({ className, options, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }> | string[] }) {
  return (
    <select {...rest} className={cx(inputCls, widthCls(className), "pr-7", className)}>
      {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Field({ label, hint, children, className, required }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[12.5px] font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3 py-1", disabled && "opacity-50")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-slate-300")}
      >
        <span className={cx("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
      </button>
      <span>
        <span className="block text-[13.5px] font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-[12px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Panel({ title, actions, children, className, padded = true, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,29,44,0.04)]", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[14px] font-semibold text-slate-800">{title}</h2>}
            {subtitle && <p className="truncate text-[12px] text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

type Tone = "slate" | "blue" | "green" | "amber" | "red" | "violet" | "teal";
const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
};

export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone], className)}>{children}</span>;
}

const STATUS: Record<string, [Tone, string]> = {
  reserved: ["blue", "Booked"],
  checked_in: ["green", "Staying"],
  checked_out: ["slate", "Checked out"],
  cancelled: ["red", "Cancelled"],
  no_show: ["amber", "No-show"],
};
export function StatusBadge({ status }: { status: string }) {
  const [tone, text] = STATUS[status] ?? ["slate", status];
  return <Badge tone={tone}>{text}</Badge>;
}

const HK: Record<string, [Tone, string]> = { clean: ["green", "Clean"], dirty: ["red", "Needs cleaning"], cleaning: ["amber", "Being cleaned"], inspect: ["violet", "Ready to check"] };
export function HkBadge({ status }: { status: string }) {
  const [tone, text] = HK[status] ?? ["slate", status];
  return <Badge tone={tone}>{text}</Badge>;
}

export function PayBadge({ total, paid }: { total: number; paid: number }) {
  if (total <= 0) return null;
  if (paid >= total - 0.5) return <Badge tone="green">Paid</Badge>;
  if (paid > 0) return <Badge tone="amber">Part paid</Badge>;
  return <Badge tone="red">Not paid</Badge>;
}

export function Modal({ open, title, onClose, children, footer, width = 560, subtitle }: { open: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 pt-[6vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-pop w-full rounded-lg bg-white shadow-2xl" style={{ maxWidth: width }}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-[12.5px] text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="-mr-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, message, confirmText = "Yes", danger, onConfirm, onClose, loading, children }: { open: boolean; title: string; message?: ReactNode; confirmText?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; loading?: boolean; children?: ReactNode }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      {message && <div className="text-[13.5px] text-slate-700">{message}</div>}
      {children}
    </Modal>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-300 [&>svg]:size-10">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 max-w-md text-[13px] text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
      <Loader2 className="size-5 animate-spin" /> {text}
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone = "slate", onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Tone; onClick?: () => void }) {
  const iconTone: Record<Tone, string> = { slate: "bg-slate-100 text-slate-600", blue: "bg-brand-50 text-brand-600", green: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-600", violet: "bg-violet-50 text-violet-600", teal: "bg-teal-50 text-teal-600" };
  return (
    <div onClick={onClick} className={cx("flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,29,44,0.04)]", onClick && "cursor-pointer hover:border-brand-300")}>
      {icon && <div className={cx("rounded-md p-2 [&>svg]:size-5", iconTone[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-slate-500">{label}</p>
        <p className="tabular text-[20px] leading-tight font-semibold text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ value: T; label: ReactNode; count?: number }>; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("flex gap-1 border-b border-slate-200", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap", value === t.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}
        >
          {t.label}
          {t.count !== undefined && <span className={cx("rounded-full px-1.5 text-[11px]", value === t.value ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[20px] font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto max-w-[1500px] p-5", className)}>{children}</div>;
}

export function Row({ label, children, strong, className }: { label: ReactNode; children: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1 text-[13px]", strong && "font-semibold text-slate-900", className)}>
      <span className={strong ? "" : "text-slate-600"}>{label}</span>
      <span className="tabular text-right">{children}</span>
    </div>
  );
}

/** Loads data from the main process and reloads it on demand. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = () => {
    const n = ++seq.current;
    setLoading(true);
    fn()
      .then((d) => {
        if (n === seq.current) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => n === seq.current && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => n === seq.current && setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, deps);
  return { data, setData, error, loading, reload: load };
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{children}</div>;
}

export function Note({ tone = "blue", children, icon, className }: { tone?: "blue" | "amber" | "green" | "red" | "slate"; children: ReactNode; icon?: ReactNode; className?: string }) {
  const t = { blue: "border-brand-200 bg-brand-50 text-brand-800", amber: "border-amber-200 bg-amber-50 text-amber-900", green: "border-emerald-200 bg-emerald-50 text-emerald-800", red: "border-red-200 bg-red-50 text-red-800", slate: "border-slate-200 bg-slate-50 text-slate-700" }[tone];
  return (
    <div className={cx("flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]", t, className)}>
      {icon && <span className="mt-0.5 shrink-0 [&>svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
