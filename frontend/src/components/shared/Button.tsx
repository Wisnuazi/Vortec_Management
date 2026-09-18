"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./Button.module.css";

/**
 * DEC-069: shared Button — one set of variants + sizes used across the
 * whole app instead of every page.module.css re-deriving its own button.
 *
 * Visual variants:
 *   - primary   : accent fill (submit, save, create)
 *   - secondary : surface + border (cancel, secondary actions)
 *   - ghost     : transparent + hover bg (toolbar actions, dropdowns)
 *   - danger    : danger color (delete, close BOM)
 *
 * Sizes:
 *   - sm  : 32px tall — compact toolbars
 *   - md  : 44px tall — default, touch-target compliant
 *   - lg  : 52px tall — hero CTAs
 *
 * Always inherits the :focus-visible ring + disabled polish from
 * globals.css.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    iconLeft,
    iconRight,
    fullWidth,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const classes = [
    styles.btn,
    styles[`v_${variant}`],
    styles[`s_${size}`],
    fullWidth ? styles.fullWidth : "",
    loading ? styles.loading : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : iconLeft ? <span className={styles.icon}>{iconLeft}</span> : null}
      <span className={styles.label}>{children}</span>
      {!loading && iconRight ? <span className={styles.icon}>{iconRight}</span> : null}
    </button>
  );
});
