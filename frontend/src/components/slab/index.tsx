/**
 * Slab/Scanner design primitives — the visual system from Landing B v2,
 * extracted so in-app screens can reuse them.
 *
 * Anything that uses these MUST sit inside a `.slab-theme` container
 * (which provides the CSS variables — see styles/landing-slab.css).
 */
import type { CSSProperties, ReactNode } from "react";
import "@/styles/landing-slab.css";

// ── Slab (PSA-style panel) ──────────────────────────────────

export function Slab({
  label,
  grade,
  cert,
  children,
  foot,
  yellow = false,
  style,
  className = "",
}: {
  label: string;
  grade?: string;
  cert?: string;
  children: ReactNode;
  foot?: ReactNode;
  yellow?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`slab ${yellow ? "yellow" : ""} ${className}`} style={style}>
      <div className="slab-label">
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {grade && <span className="grade">{grade}</span>}
          <span>{label}</span>
        </span>
        {cert && <span className="cert">{cert}</span>}
      </div>
      <div className="slab-body">{children}</div>
      {foot && <div className="slab-foot">{foot}</div>}
    </div>
  );
}

// ── Vintage paper price tag ─────────────────────────────────

export function PriceTag({
  amount,
  meta,
  style,
}: {
  amount: string;
  meta?: string;
  style?: CSSProperties;
}) {
  return (
    <div className="price-tag" style={style}>
      <div className="pt-amt">{amount}</div>
      {meta && <div className="pt-meta">{meta}</div>}
    </div>
  );
}

// ── Monospace metadata chip ─────────────────────────────────

export function ChipMono({
  children,
  solid = false,
  accent = false,
  style,
}: {
  children: ReactNode;
  solid?: boolean;
  accent?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`chip-mono ${solid ? "solid" : ""} ${accent ? "accent" : ""}`}
      style={style}
    >
      {children}
    </span>
  );
}

// ── Status chip with personality ────────────────────────────

export type ListingStatus =
  | "live"
  | "sold"
  | "draft"
  | "scheduled"
  | "publishing"
  | "error"
  | "review";

interface StatusChipConfig {
  bg: string;
  fg: string;
  label: string;
  border?: boolean;
}

const STATUS_CONFIG: Record<ListingStatus, StatusChipConfig> = {
  live:       { bg: "var(--accent)",  fg: "var(--ink)",    label: "● LIVE" },
  sold:       { bg: "var(--ink)",     fg: "var(--accent)", label: "★ SOLD" },
  draft:      { bg: "var(--paper)",   fg: "var(--ink)",    label: "○ DRAFT", border: true },
  scheduled:  { bg: "var(--paper-2)", fg: "var(--ink)",    label: "◐ QUEUED", border: true },
  publishing: { bg: "var(--paper-2)", fg: "var(--ink)",    label: "◐ PUBLISHING", border: true },
  error:      { bg: "#c44536",        fg: "var(--paper)",  label: "! ERROR" },
  review:     { bg: "#f5a623",        fg: "var(--ink)",    label: "? REVIEW" },
};

export function StatusChip({ status }: { status: string }) {
  const cfg: StatusChipConfig =
    STATUS_CONFIG[status as ListingStatus] ?? {
      bg: "var(--paper)",
      fg: "var(--ink)",
      label: status.toUpperCase(),
      border: true,
    };

  return (
    <span
      style={{
        display: "inline-block",
        background: cfg.bg,
        color: cfg.fg,
        padding: "3px 8px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: 1.5,
        fontWeight: 700,
        border: cfg.border ? "1.5px solid var(--ink)" : "1.5px solid transparent",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Stat slab (mini panel for dashboard stats) ──────────────

export function StatSlab({
  grade,
  label,
  value,
  sub,
  foot,
  accent = false,
}: {
  grade: string;
  label: string;
  value: string | number;
  sub?: string;
  foot?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--paper)",
        border: "2px solid var(--ink)",
        boxShadow: "3px 3px 0 var(--ink)",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          background: accent ? "var(--accent)" : "var(--ink)",
          color: accent ? "var(--ink)" : "var(--paper)",
          padding: "5px 10px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            background: accent ? "var(--ink)" : "var(--accent)",
            color: accent ? "var(--accent)" : "var(--ink)",
            padding: "1px 6px",
            fontWeight: 700,
          }}
        >
          {grade}
        </span>
        <span>{label}</span>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div
          className="hand"
          style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: "var(--ink)" }}
        >
          {value}
        </div>
        {sub && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: 1,
              color: "var(--ink-soft)",
              marginTop: 4,
            }}
          >
            {sub}
          </div>
        )}
      </div>
      {foot && (
        <div
          style={{
            borderTop: "1.5px solid var(--ink)",
            padding: "4px 10px",
            background: "var(--paper-2)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: 1,
            color: "var(--ink-soft)",
          }}
        >
          {foot}
        </div>
      )}
    </div>
  );
}

// ── Mini card thumb ─────────────────────────────────────────

export function MiniCard({
  width = 36,
  src,
  fallbackGlyph = "★",
  gradient = "linear-gradient(135deg, #ff7a3d, #ffd54a)",
  alt = "",
}: {
  width?: number;
  src?: string | null;
  fallbackGlyph?: string;
  gradient?: string;
  alt?: string;
}) {
  return (
    <div
      style={{
        width,
        aspectRatio: "5/7",
        border: "1.5px solid var(--ink)",
        background: src ? "var(--paper-2)" : gradient,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: width * 0.4,
        flexShrink: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <span>{fallbackGlyph}</span>
      )}
    </div>
  );
}

// ── Form-field primitives ───────────────────────────────────

/**
 * Single labeled text input. Field label sits above the input in
 * uppercase monospace; input has a sharp ink border, focus pops a
 * yellow drop-shadow.
 */
export function SlabField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  inputMode,
  style,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel" | "url" | "search" | "none";
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: 1.5,
          color: "var(--ink-soft)",
          marginBottom: 4,
          fontWeight: 700,
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        style={{
          display: "block",
          width: "100%",
          padding: "8px 12px",
          background: "var(--paper)",
          border: "1.5px solid var(--ink)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--ink)",
          outline: "none",
          borderRadius: 0,
          boxSizing: "border-box",
        }}
        onFocus={(e) => {
          e.target.style.boxShadow = "3px 3px 0 var(--accent)";
        }}
        onBlur={(e) => {
          e.target.style.boxShadow = "none";
        }}
      />
    </div>
  );
}

/** Wrapper around a non-input field — gives it the same monospace label as SlabField. */
export function SlabFieldGroup({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: 1.5,
          color: "var(--ink-soft)",
          marginBottom: 4,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/** Slab-styled native <select> for dropdowns. */
export function SlabSelect({
  id,
  value,
  onChange,
  options,
  style,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  style?: CSSProperties;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        display: "block",
        width: "100%",
        padding: "8px 12px",
        background: "var(--paper)",
        border: "1.5px solid var(--ink)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--ink)",
        outline: "none",
        borderRadius: 0,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Toggle button — yellow when active, paper when not. Used for Card Type, Condition, etc. */
export function ToggleButton({
  active,
  onClick,
  children,
  size = "md",
  flex = true,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: "sm" | "md";
  /** Stretch to fill the row (default true). Set false for chip-style toggles. */
  flex?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: flex ? 1 : "none",
        padding: size === "sm" ? "6px 8px" : "8px 12px",
        background: active ? "var(--accent)" : "var(--paper)",
        color: "var(--ink)",
        border: "1.5px solid var(--ink)",
        fontFamily: "var(--font-mono)",
        fontSize: size === "sm" ? 10 : 11,
        letterSpacing: 1,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
        boxShadow: active ? "2px 2px 0 var(--ink)" : "none",
        transition: "box-shadow 0.1s",
      }}
    >
      {children}
    </button>
  );
}

// ── Slab button ─────────────────────────────────────────────

export function SlabButton({
  primary = false,
  size = "md",
  children,
  onClick,
  type = "button",
  disabled = false,
  style,
  className = "",
}: {
  primary?: boolean;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const sizeClass = size === "sm" ? "sm" : size === "lg" ? "lg" : "";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn ${primary ? "primary" : ""} ${sizeClass} ${className}`}
      style={{
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
