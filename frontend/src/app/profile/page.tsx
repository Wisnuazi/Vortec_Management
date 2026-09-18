"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { LanguageToggle } from "@/components/shell/LanguageToggle";
import { resizeImageToDataUrl } from "@/lib/image";
import styles from "./page.module.css";

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const { t } = usePreferences();
  const [name, setName] = useState(user?.name ?? "");
  const [nameSaved, setNameSaved] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const onPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("profile.fileMustBeImage"));
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await updateProfile({ avatarUrl: dataUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const roleTitle = user.roleTitles.length > 0 ? user.roleTitles.join(", ") : null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await updateProfile({ name });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.saveFailed"));
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await updateProfile({ password });
      setPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.saveFailed"));
    }
  };

  return (
    <div className={styles.wrap}>
      <h1>{t("profile.title")}</h1>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.card}>
        <span className={styles.label}>{t("profile.photo")}</span>
        <div className={styles.photoRow}>
          <span className={styles.photoPreview}>
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className={styles.photoImg} />
            ) : (
              initials(user.name)
            )}
          </span>
          <div className={styles.photoActions}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onPhotoSelected}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "…" : t("profile.uploadPhoto")}
            </button>
            {user.avatarUrl && (
              <button type="button" onClick={() => updateProfile({ avatarUrl: null })}>
                {t("profile.removePhoto")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.readOnlyRow}>
          <span className={styles.label}>{t("profile.email")}</span>
          <span>{user.email}</span>
        </div>
        {user.username && (
          <div className={styles.readOnlyRow}>
            <span className={styles.label}>{t("profile.username")}</span>
            <span>@{user.username}</span>
          </div>
        )}
        <div className={styles.readOnlyRow}>
          <span className={styles.label}>{t("profile.role")}</span>
          <span>{roleTitle ?? t("profile.noRole")}</span>
        </div>

        <form className={styles.inlineForm} onSubmit={saveName}>
          <label>
            <span className={styles.label}>{t("profile.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button type="submit">{nameSaved ? t("profile.saved") : t("profile.save")}</button>
        </form>
      </div>

      <div className={styles.card}>
        <span className={styles.label}>{t("profile.changePassword")}</span>
        <form className={styles.inlineForm} onSubmit={savePassword}>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder={t("profile.newPassword")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">{passwordSaved ? t("profile.saved") : t("profile.save")}</button>
        </form>
      </div>

      <div className={styles.card}>
        <span className={styles.label}>{t("profile.theme")}</span>
        <div className={styles.toggleHost}>
          <ThemeToggle />
        </div>
      </div>

      <div className={styles.card}>
        <span className={styles.label}>{t("profile.language")}</span>
        <div className={styles.toggleHost}>
          <LanguageToggle />
        </div>
      </div>
    </div>
  );
}
