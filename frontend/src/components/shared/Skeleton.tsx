import styles from "./Skeleton.module.css";

type Variant = "line" | "heading" | "box" | "circle" | "button" | "row";

type SkeletonProps = {
  variant?: Variant;
  width?: number | string;
  height?: number | string;
  className?: string;
  count?: number; // for "line" only — how many lines to render
  style?: React.CSSProperties;
};

/**
 * Lightweight content-placeholder block. Renders a pulsing surface that
 * matches the rough shape of the content it's standing in for. Honours
 * `prefers-reduced-motion` (animation is disabled when the user has
 * requested reduced motion). No external dependencies, no JS timers —
 * pure CSS animation, GPU-friendly (transform + background-position).
 *
 * Usage:
 *   <Skeleton variant="heading" />
 *   <Skeleton variant="line" count={3} />
 *   <Skeleton variant="box" height="12rem" />
 */
export function Skeleton({ variant = "line", width, height, className, count = 1, style }: SkeletonProps) {
  if (variant === "row") {
    return (
      <div className={`${styles.row} ${className ?? ""}`} style={style}>
        <Skeleton variant="circle" width="2.4rem" height="2.4rem" />
        <div style={{ flex: 1 }}>
          <Skeleton variant="line" width="40%" />
          <Skeleton variant="line" width="70%" />
        </div>
      </div>
    );
  }

  if (variant === "line") {
    const styleForLines: React.CSSProperties = {};
    if (width !== undefined) styleForLines.width = typeof width === "number" ? `${width}px` : width;
    if (height !== undefined) styleForLines.height = typeof height === "number" ? `${height}px` : height;
    return (
      <>
        {Array.from({ length: Math.max(1, count) }).map((_, i) => (
          <span
            key={i}
            className={`${styles.skeleton} ${styles.line} ${className ?? ""}`}
            style={{ ...styleForLines, width: i === count - 1 ? "60%" : undefined }}
            aria-hidden="true"
          />
        ))}
      </>
    );
  }

  const computed: React.CSSProperties = { ...style };
  if (width !== undefined) computed.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) computed.height = typeof height === "number" ? `${height}px` : height;
  if (variant === "circle") computed.width = computed.width ?? "2.4rem";

  return <span aria-hidden="true" className={`${styles.skeleton} ${styles[variant]} ${className ?? ""}`} style={computed} />;
}
