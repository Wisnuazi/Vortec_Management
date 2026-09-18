"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import logoMark from "../../../public/brand/vortec-logo-mark.png";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import styles from "./page.module.css";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = usePreferences();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotHint, setShowForgotHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={onSubmit}>
        <div className={styles.brand}>
          <Image src={logoMark} alt="Vortec" width={40} height={40} priority className={styles.logo} />
          <span className={styles.brandText}>Vortec Management</span>
        </div>
        <h1 className={styles.title}>{t("login.title")}</h1>

        <label className={styles.field}>
          <span>{t("login.identifier")}</span>
          <input
            type="text"
            required
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
        </label>

        <label className={styles.field}>
          <span>{t("login.password")}</span>
          <div className={styles.passwordWrap}>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={styles.passwordInput}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
              aria-pressed={showPassword}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </label>

        <div className={styles.forgotRow}>
          <button
            type="button"
            className={styles.forgotBtn}
            onClick={() => setShowForgotHint((v) => !v)}
            aria-expanded={showForgotHint}
          >
            {t("login.forgotPassword")}
          </button>
        </div>
        {showForgotHint && <p className={styles.forgotHint}>{t("login.forgotPasswordHint")}</p>}

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button type="submit" disabled={submitting} className={styles.submitBtn}>
          {submitting ? t("login.submitting") : t("login.submit")}
        </button>
      </form>
    </div>
  );
}
