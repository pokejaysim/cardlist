/**
 * Landing page — Slab/Scanner edition (B v2 from the design handoff).
 *
 * Visual system: PSA-grade slabs, vintage price-tag stickers, scanner
 * sweep over a card, halftone + binder-grid backgrounds, monospace
 * inventory chips. Goal: feel like a premium card-shop tool, not a
 * generic AI SaaS.
 *
 * Hero loops a 4-stage animation (snap → scan → identify → list).
 *
 * All classes are scoped under `.slab-theme` (see styles/landing-slab.css)
 * so the rest of the app keeps its emerald shadcn theme.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "@/styles/landing-slab.css";

// ── Hooks: stage cycling, type-in, count-up ──────────────────

function useStage(stages = 4, msPer = 1800): number {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStage((s) => (s + 1) % stages), msPer);
    return () => clearInterval(t);
  }, [stages, msPer]);
  return stage;
}

function useTypeIn(text: string, active: boolean, speed = 28): string {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!active) {
      setOut("");
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, active, speed]);
  return out;
}

function useCount(target: number, active: boolean, durationMs = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) {
      setV(0);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);
  return Math.round(v);
}

// ── Slab + price-tag primitives ──────────────────────────────

function Slab({
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

function PriceTag({
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

function ChipMono({
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

// ── Hero animated card stage ─────────────────────────────────

function HeroCardStage({ stage }: { stage: number }) {
  // 0 photo, 1 scanning, 2 identified, 3 listing-ready
  const scanning = stage === 1;
  const identified = stage >= 2;
  const listing = stage >= 3;

  const titleTyped = useTypeIn("CHARIZARD", identified, 36);
  const setTyped = useTypeIn("Base Set · Holo · 4/102", identified, 22);
  const priceCount = useCount(84, listing, 700);

  return (
    <div className="hero-stage">
      {/* Card slab */}
      <div style={{ position: "relative" }}>
        <Slab
          label={identified ? "CHARIZARD · BASE" : "IDENTIFYING…"}
          grade={identified ? "NM" : "??"}
          cert={identified ? "#0042-1999-04" : "#PENDING"}
          foot={
            <>
              <span>{identified ? "HOLO RARE · ENGLISH" : "AWAITING SCAN"}</span>
              <span>{identified ? "POP 487" : "— — —"}</span>
            </>
          }
          style={{ width: 240 }}
        >
          <div style={{ position: "relative", padding: 4 }}>
            {/* Card art viewport */}
            <div
              style={{
                aspectRatio: "5/7",
                border: "1.5px solid var(--ink)",
                borderRadius: 4,
                background: identified
                  ? "linear-gradient(135deg, #ff7a3d 0%, #f5a623 50%, #ffd54a 100%)"
                  : "var(--paper-2)",
                position: "relative",
                overflow: "hidden",
                transition: "background 0.6s",
              }}
            >
              {!identified && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div className="hand" style={{ fontSize: 32, opacity: 0.3 }}>
                    📷
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: 1.5,
                      color: "var(--ink-soft)",
                    }}
                  >
                    PHOTO
                  </div>
                </div>
              )}
              {identified && (
                <>
                  <div
                    style={{
                      position: "absolute",
                      inset: "20% 15% 30% 15%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 60,
                    }}
                  >
                    🔥
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: "rgba(0,0,0,0.6)",
                    }}
                  >
                    120 HP
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      bottom: 8,
                      left: 8,
                      right: 8,
                      fontFamily: "var(--font-mono)",
                      fontSize: 7,
                      color: "rgba(0,0,0,0.5)",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>4/102</span>
                    <span>★ HOLO</span>
                  </div>
                </>
              )}

              {scanning && (
                <div className="scan-overlay" key={`scan-${String(stage)}`}>
                  <div className="scan-corner tl" />
                  <div className="scan-corner tr" />
                  <div className="scan-corner bl" />
                  <div className="scan-corner br" />
                  <div className="scan-line" />
                </div>
              )}
            </div>

            {/* Identify caption inside slab */}
            <div style={{ marginTop: 8, minHeight: 32 }}>
              {identified ? (
                <>
                  <div
                    className="hand"
                    style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}
                  >
                    {titleTyped}
                    <span
                      style={{
                        opacity: titleTyped.length < 9 ? 1 : 0,
                        color: "var(--accent)",
                      }}
                    >
                      |
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: 0.5,
                      color: "var(--ink-soft)",
                      marginTop: 3,
                      textTransform: "uppercase",
                    }}
                  >
                    {setTyped}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: "var(--ink-soft)",
                  }}
                >
                  {scanning ? "◉ SCANNING ARTWORK…" : "◯ AWAITING INPUT"}
                </div>
              )}
            </div>
          </div>
        </Slab>

        {/* Price tag flies in */}
        <div
          style={{
            position: "absolute",
            top: -14,
            right: -36,
            transform: listing ? "rotate(8deg) scale(1)" : "rotate(40deg) scale(0)",
            opacity: listing ? 1 : 0,
            transition: "all 0.5s cubic-bezier(.5,1.6,.5,1)",
          }}
        >
          <PriceTag amount={`$${String(priceCount)}`} meta="NM · CAD" />
        </div>

        {/* Verified stamp */}
        <div
          style={{
            position: "absolute",
            bottom: -8,
            left: -22,
            opacity: identified ? 0.9 : 0,
            transition: "opacity 0.4s",
            transitionDelay: "0.3s",
          }}
        >
          <span className="stamp">
            VERIFIED
            <br />
            SNAPCARD
          </span>
        </div>
      </div>

      {/* eBay listing card slides in */}
      <div
        style={{
          width: 250,
          transform: listing ? "translateX(0)" : "translateX(-40px)",
          opacity: listing ? 1 : 0,
          transition: "all 0.55s cubic-bezier(.4,1.4,.4,1)",
          transitionDelay: listing ? "0.15s" : "0s",
          position: "relative",
        }}
      >
        <Slab
          yellow
          label="LISTING DRAFT"
          grade="eBay"
          cert="ready · 0 errors"
          foot={
            <>
              <span>SHIPPING · CALCULATED</span>
              <span>RETURNS · 30D</span>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                aspectRatio: "5/4",
                background:
                  "linear-gradient(135deg, #ff7a3d 0%, #f5a623 50%, #ffd54a 100%)",
                border: "1.5px solid var(--ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
              }}
            >
              🔥
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 0.5,
                lineHeight: 1.4,
                fontWeight: 600,
              }}
            >
              CHARIZARD HOLO BASE SET
              <br />
              4/102 · NEAR MINT · 1999 PSA
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                borderTop: "1.5px dashed var(--ink)",
                paddingTop: 8,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: 1,
                    color: "var(--ink-soft)",
                  }}
                >
                  BUY IT NOW
                </div>
                <div
                  className="hand"
                  style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}
                >
                  ${priceCount}.00
                </div>
              </div>
              <span className="chip-mono solid">+ FREE SHIP</span>
            </div>
            <div
              style={{
                padding: "8px 12px",
                background: "var(--ink)",
                color: "var(--accent)",
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              ▸ PUBLISH TO eBAY
            </div>
          </div>
        </Slab>

        <div
          style={{
            position: "absolute",
            top: "-22px",
            left: "50%",
            fontFamily: "var(--font-marker)",
            fontSize: 11,
            color: "var(--annotation)",
            opacity: listing ? 1 : 0,
            transition: "opacity 0.4s",
            transitionDelay: "0.5s",
            transform: "rotate(-3deg)",
          }}
        >
          ← live in 30 sec
        </div>
      </div>
    </div>
  );
}

// ── Stage dots (4-step progress under the hero) ──────────────

function StageDots({ stage }: { stage: number }) {
  const labels = ["SNAP", "SCAN", "IDENTIFY", "LIST"];
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 32,
        flexWrap: "wrap",
      }}
    >
      {labels.map((l, i) => (
        <div key={l} style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "2px solid var(--ink)",
                background: stage >= i ? "var(--accent)" : "var(--paper)",
                transition: "background 0.3s",
                boxShadow:
                  stage === i ? "0 0 0 4px rgba(234,179,8,0.25)" : "none",
              }}
            />
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 1.5,
                fontWeight: stage >= i ? 700 : 400,
                color: stage >= i ? "var(--ink)" : "var(--ink-soft)",
              }}
            >
              {String(i + 1).padStart(2, "0")} · {l}
            </div>
          </div>
          {i < labels.length - 1 && (
            <div
              style={{
                width: 64,
                height: 2,
                background: stage > i ? "var(--ink)" : "var(--line-faint)",
                margin: "0 8px 18px",
                transition: "background 0.3s",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Auction-floor marquee ────────────────────────────────────

function MarqueeStrip() {
  const items = [
    "CHARIZARD HOLO · $84 SOLD",
    "PIKACHU ILLUSTRATOR · BID",
    "BLASTOISE 1ST ED · $340",
    "MEWTWO GX · $28",
    "EEVEE PROMO · $12",
    "SNORLAX EX · $46",
    "★ TRADING FLOOR LIVE",
    "GYARADOS HOLO · $67",
    "MACHAMP 1ST ED · $95",
  ];
  // Duplicate so the loop is seamless
  const all = [...items, ...items];
  return (
    <div className="marquee">
      <div className="marquee-track">
        {all.map((it, i) => (
          <span key={`${it}-${String(i)}`}>
            <span className="dot">●</span> {it}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Small helpers used in width adjustment ───────────────────

/** Shrink the hero card stage on narrow viewports so it doesn't overflow. */
function useResponsiveScale(targetWidth: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      setScale(Math.min(1, w / targetWidth));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [targetWidth]);

  return { ref, scale };
}

// ── The page ─────────────────────────────────────────────────

export default function Landing() {
  const stage = useStage(4, 1800);
  // The hero stage is ~580px wide at native size. Scale it down on narrow
  // screens so it never overflows on mobile.
  const { ref: stageRef, scale: stageScale } = useResponsiveScale(580);

  return (
    <div className="slab-theme">
      {/* ── Nav ── */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 24px",
          borderBottom: "1.5px solid var(--ink)",
          background: "var(--paper)",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: "var(--accent)",
              border: "2px solid var(--ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: 18,
              color: "var(--ink)",
            }}
          >
            S
          </div>
          <div
            className="hand"
            style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}
          >
            SnapCard
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 24,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            flexWrap: "wrap",
          }}
          className="landing-nav-links"
        >
          <span>How it works</span>
          <span>Pricing</span>
          <span>For volume</span>
          <span>Sold archive</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            to="/login"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 1,
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            SIGN IN
          </Link>
          <Link to="/register" className="btn primary sm">
            START FREE →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        style={{ position: "relative", borderBottom: "2px solid var(--ink)" }}
      >
        <div
          className="card-grid-bg"
          style={{ position: "absolute", inset: 0, opacity: 0.4 }}
        />
        <div
          className="halftone-soft"
          style={{ position: "absolute", inset: 0, opacity: 0.5 }}
        />

        <div
          style={{
            position: "relative",
            padding: "48px 24px 40px",
            maxWidth: 1280,
            margin: "0 auto",
          }}
        >
          {/* Headline + sidecar slab */}
          <div className="hero-headline-row">
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 14,
                  flexWrap: "wrap",
                }}
              >
                <ChipMono solid>● LIVE DEMO</ChipMono>
                <ChipMono>NO SIGNUP REQUIRED</ChipMono>
              </div>
              <div
                className="hand hero-headline"
                style={{
                  fontWeight: 700,
                  lineHeight: 0.95,
                  letterSpacing: "-0.02em",
                }}
              >
                Snap a card.
                <br />
                List it on eBay.
                <br />
                <span className="underline-doodle">In 30 seconds.</span>
              </div>
              <div
                style={{
                  marginTop: 16,
                  fontFamily: "var(--font-marker)",
                  fontSize: 15,
                  color: "var(--ink-soft)",
                  maxWidth: 460,
                }}
              >
                Built for serious collectors and resellers. Identifies your
                card, prices it from real sold comps, drafts the listing,
                publishes to eBay. The boring part? Done.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  marginTop: 24,
                  flexWrap: "wrap",
                }}
              >
                <Link to="/register" className="btn primary lg">
                  ▸ SCAN YOUR FIRST CARD — FREE
                </Link>
                <span className="ticket">↗ WATCH 60-SEC DEMO</span>
              </div>
            </div>

            <div style={{ position: "relative", paddingTop: 12 }}>
              <Slab
                label="EST. SAVINGS"
                grade="∞"
                cert="vs manual"
                style={{ width: 200 }}
              >
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <div
                    className="hand"
                    style={{
                      fontSize: 48,
                      fontWeight: 700,
                      lineHeight: 1,
                      color: "var(--accent-2)",
                    }}
                  >
                    14<span style={{ fontSize: 22 }}>min</span>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: 1.5,
                      marginTop: 4,
                    }}
                  >
                    SAVED PER CARD
                  </div>
                </div>
                <div
                  style={{
                    borderTop: "1.5px dashed var(--ink)",
                    paddingTop: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: 0.5,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>MANUAL</span>
                    <span>~15 MIN</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--accent-2)",
                      fontWeight: 700,
                    }}
                  >
                    <span>SNAPCARD</span>
                    <span>0:30</span>
                  </div>
                </div>
              </Slab>
            </div>
          </div>

          {/* Animated stage */}
          <div
            style={{
              border: "2.5px solid var(--ink)",
              background: "var(--paper)",
              padding: "40px 16px 32px",
              position: "relative",
              boxShadow: "6px 6px 0 var(--ink)",
              marginTop: 32,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -1,
                left: 14,
                padding: "4px 10px",
                background: "var(--ink)",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              SNAPCARD · LIVE
            </div>
            <div
              style={{
                position: "absolute",
                top: -1,
                right: 14,
                padding: "4px 10px",
                background: "var(--accent)",
                color: "var(--ink)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 1.5,
                fontWeight: 700,
                border: "2px solid var(--ink)",
                borderTop: "none",
              }}
            >
              CYCLE {String(stage + 1).padStart(2, "0")}/04
            </div>

            {/* Scaled wrapper so the wide hero stage fits on phones */}
            <div ref={stageRef} style={{ width: "100%" }}>
              <div
                style={{
                  width: 580,
                  transform: `scale(${String(stageScale)})`,
                  transformOrigin: "top center",
                  margin: "0 auto",
                  height: 580 * stageScale * 0.72,
                }}
              >
                <HeroCardStage stage={stage} />
              </div>
            </div>
            <StageDots stage={stage} />
          </div>
        </div>
      </section>

      {/* ── Marquee ── */}
      <MarqueeStrip />

      {/* ── Capabilities ── */}
      <section style={{ padding: "56px 24px", position: "relative" }}>
        <div
          className="halftone-soft"
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.4,
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 28,
              borderBottom: "2px solid var(--ink)",
              paddingBottom: 12,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: 2,
                  color: "var(--ink-soft)",
                }}
              >
                SECTION 02 · CAPABILITIES
              </div>
              <div
                className="hand"
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  lineHeight: 1,
                  marginTop: 6,
                }}
              >
                The whole listing pipeline.{" "}
                <span style={{ color: "var(--accent-2)" }}>Graded.</span>
              </div>
            </div>
            <ChipMono solid>04 MODULES</ChipMono>
          </div>

          <div className="capabilities-grid">
            {[
              {
                grade: "A+",
                label: "IDENTIFY",
                cert: "#01",
                title: "Photo → SKU",
                desc: "97% match accuracy across 35,000 Pokémon SKUs. Set, number, language, edition, holo pattern.",
                meta: "TCG · YGO · MTG",
              },
              {
                grade: "A",
                label: "PRICE",
                cert: "#02",
                title: "Real sold comps",
                desc: "Pulls last 90 days of eBay sold listings filtered by your exact condition. Median, range, momentum.",
                meta: "eBay · TCGPlayer · 130P",
              },
              {
                grade: "A",
                label: "DRAFT",
                cert: "#03",
                title: "Listing copy",
                desc: "Title, description, item specifics, shipping, returns. All eBay-ready, no errors, no warnings.",
                meta: "OPTIMIZED · 80 CHAR",
              },
              {
                grade: "A+",
                label: "PUBLISH",
                cert: "#04",
                title: "One-click live",
                desc: "Connect your eBay account once. SnapCard publishes drafts in batches. Inventory syncs back automatically.",
                meta: "eBAY API · OAUTH",
              },
            ].map((f, i) => (
              <Slab
                key={f.label}
                grade={f.grade}
                label={f.label}
                cert={f.cert}
                foot={
                  <>
                    <span>{f.meta}</span>
                    <span>{i + 1}/4</span>
                  </>
                }
              >
                <div
                  className="hand"
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1.05,
                    marginBottom: 10,
                  }}
                >
                  {f.title}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-marker)",
                    fontSize: 13,
                    color: "var(--ink-soft)",
                    lineHeight: 1.5,
                  }}
                >
                  {f.desc}
                </div>
              </Slab>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sold archive ── */}
      <section
        style={{
          background: "var(--paper-2)",
          borderTop: "2px solid var(--ink)",
          borderBottom: "2px solid var(--ink)",
          padding: "40px 24px",
          position: "relative",
        }}
      >
        <div
          className="halftone"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 80,
            height: 80,
            opacity: 0.15,
          }}
        />
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 24,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div className="hand" style={{ fontSize: 32, fontWeight: 700 }}>
              From the sold archive
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: "var(--ink-soft)",
                  marginLeft: 12,
                  fontWeight: 400,
                }}
              >
                · LAST 7 DAYS
              </span>
            </div>
            <span className="ticket">VIEW ALL 12,847 ↗</span>
          </div>

          <div className="sold-grid">
            {[
              { name: "Charizard Holo", set: "Base · 4/102", price: "$84", when: "2H AGO" },
              { name: "Pikachu VMAX", set: "Vivid Voltage", price: "$42", when: "5H AGO" },
              { name: "Mewtwo ex", set: "Paldea Evolved", price: "$28", when: "YESTERDAY" },
              { name: "Blastoise", set: "Base · 2/102", price: "$67", when: "2D AGO" },
              { name: "Snorlax GX", set: "Lost Thunder", price: "$38", when: "3D AGO" },
            ].map((c) => (
              <div key={c.name} style={{ position: "relative" }}>
                <div
                  className="holo"
                  style={{
                    aspectRatio: "5/7",
                    border: "1.5px solid var(--ink)",
                    position: "relative",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: 1,
                      background: "var(--paper)",
                      padding: "2px 5px",
                      border: "1px solid var(--ink)",
                    }}
                  >
                    {c.when}
                  </div>
                </div>
                <div
                  className="hand"
                  style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: 0.5,
                    color: "var(--ink-soft)",
                    marginTop: 2,
                  }}
                >
                  {c.set}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginTop: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: 1,
                    }}
                  >
                    SOLD
                  </span>
                  <span
                    className="hand"
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: "var(--accent-2)",
                    }}
                  >
                    {c.price}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={{ padding: "56px 24px", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 2,
              color: "var(--ink-soft)",
            }}
          >
            SECTION 03 · PRICING
          </div>
          <div
            className="hand"
            style={{
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 6,
            }}
          >
            Pick your <span className="underline-doodle">grade.</span>
          </div>
        </div>

        <div
          className="pricing-grid"
          style={{ maxWidth: 980, margin: "0 auto" }}
        >
          {[
            {
              grade: "F",
              label: "FREE",
              cert: "5/MO",
              price: "$0",
              priceNote: "forever",
              features: [
                "5 listings/mo",
                "Basic identification",
                "Manual price review",
                "Drafts only",
              ],
              cta: "Start free",
              primary: false,
              highlight: false,
            },
            {
              grade: "A",
              label: "PRO",
              cert: "POPULAR",
              price: "$19",
              priceNote: "/month CAD",
              features: [
                "250 listings/mo",
                "97% AI identification",
                "Auto pricing + comps",
                "eBay publish 1-click",
                "Sold archive access",
              ],
              cta: "Start 14-day trial",
              primary: true,
              highlight: true,
            },
            {
              grade: "A+",
              label: "VOLUME",
              cert: "TEAMS",
              price: "$49",
              priceNote: "/month CAD",
              features: [
                "Unlimited listings",
                "Batch upload (100+)",
                "API access",
                "Priority queue",
                "White-glove import",
                "Multi-account",
              ],
              cta: "Talk to us",
              primary: false,
              highlight: false,
            },
          ].map((t) => (
            <div key={t.label} style={{ position: "relative" }}>
              {t.highlight && (
                <div
                  style={{
                    position: "absolute",
                    top: -16,
                    left: "50%",
                    transform: "translateX(-50%) rotate(-3deg)",
                    zIndex: 2,
                  }}
                >
                  <PriceTag amount="MOST" meta="PICKED BY 73%" />
                </div>
              )}
              <Slab
                yellow={t.highlight}
                grade={t.grade}
                label={t.label}
                cert={t.cert}
                foot={
                  <>
                    <span>BILLED MONTHLY</span>
                    <span>CANCEL ANYTIME</span>
                  </>
                }
              >
                <div
                  style={{
                    textAlign: "center",
                    marginTop: t.highlight ? 12 : 0,
                    marginBottom: 16,
                  }}
                >
                  <div
                    className="hand"
                    style={{
                      fontSize: 56,
                      fontWeight: 700,
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {t.price}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: 1,
                      color: "var(--ink-soft)",
                      marginTop: 2,
                    }}
                  >
                    {t.priceNote}
                  </div>
                </div>
                <div
                  style={{
                    borderTop: "1.5px dashed var(--ink)",
                    paddingTop: 12,
                    marginBottom: 16,
                  }}
                >
                  {t.features.map((f) => (
                    <div
                      key={f}
                      style={{
                        fontFamily: "var(--font-marker)",
                        fontSize: 13,
                        marginBottom: 6,
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <span style={{ color: "var(--accent-2)", fontWeight: 700 }}>
                        ✓
                      </span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                <Link
                  to="/register"
                  className={`btn ${t.primary ? "primary" : ""}`}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {t.cta}
                </Link>
              </Slab>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        style={{
          background: "var(--ink)",
          color: "var(--paper)",
          padding: "64px 24px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          className="halftone"
          style={{ position: "absolute", inset: 0, opacity: 0.08 }}
        />
        <div style={{ position: "relative" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 2,
              color: "var(--accent)",
              marginBottom: 12,
            }}
          >
            ★ JOIN 1,200+ SELLERS
          </div>
          <div
            className="hand final-cta-headline"
            style={{
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              marginBottom: 16,
            }}
          >
            Stop scrolling.{" "}
            <span style={{ color: "var(--accent)" }}>Start listing.</span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-marker)",
              fontSize: 16,
              color: "rgba(254,253,246,0.7)",
              marginBottom: 28,
            }}
          >
            Free to try. No credit card. First 5 cards on the house.
          </div>
          <div
            style={{
              display: "inline-flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link to="/register" className="btn primary lg">
              ▸ SCAN YOUR FIRST CARD
            </Link>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: 1.5,
                color: "var(--accent)",
              }}
            >
              OR · BOOK A 15-MIN DEMO
            </span>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          padding: "20px 24px",
          background: "var(--paper)",
          borderTop: "1.5px solid var(--ink)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: 1,
          color: "var(--ink-soft)",
          textAlign: "center",
          textTransform: "uppercase",
        }}
      >
        Built for Pokémon card sellers · snapcard.ca · v0.1
      </footer>

      {/* ── Page-local responsive helpers ── */}
      <style>{`
        .slab-theme .hero-stage {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: 28px;
        }
        .slab-theme .hero-headline-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 32px;
          align-items: flex-start;
          margin-bottom: 32px;
        }
        .slab-theme .hero-headline { font-size: 64px; }
        .slab-theme .final-cta-headline { font-size: 56px; }
        .slab-theme .capabilities-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
        }
        .slab-theme .sold-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 14px;
        }
        .slab-theme .pricing-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        @media (max-width: 900px) {
          .slab-theme .hero-headline-row {
            grid-template-columns: 1fr;
          }
          .slab-theme .hero-headline { font-size: 44px; }
          .slab-theme .final-cta-headline { font-size: 40px; }
          .slab-theme .capabilities-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .slab-theme .sold-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .slab-theme .pricing-grid {
            grid-template-columns: 1fr;
            max-width: 480px;
            margin: 0 auto;
          }
          .slab-theme .landing-nav-links {
            display: none;
          }
        }
        @media (max-width: 560px) {
          .slab-theme .hero-headline { font-size: 36px; }
          .slab-theme .sold-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .slab-theme .hero-stage {
            flex-direction: column;
            align-items: center;
            gap: 40px;
          }
        }
      `}</style>
    </div>
  );
}
