"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./useAuth";
import { authApi, type Theme } from "@/lib/auth-api";
import { translate, type Locale, type TranslationKey } from "@/lib/i18n";

const THEME_KEY = "vortec-theme";
const LOCALE_KEY = "vortec-locale";

function applyThemeToDom(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

type PreferencesContextValue = {
  theme: Theme;
  locale: Locale;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [theme, setThemeState] = useState<Theme>("system");
  const [locale, setLocaleState] = useState<Locale>("id");
  const appliedForUser = useRef<string | null>(null);

  // Instant local restore (avoids flash before login state resolves).
  useEffect(() => {
    try {
      const savedTheme = (localStorage.getItem(THEME_KEY) as Theme) || "system";
      const savedLocale = (localStorage.getItem(LOCALE_KEY) as Locale) || "id";
      setThemeState(savedTheme);
      setLocaleState(savedLocale);
      applyThemeToDom(savedTheme);
    } catch {
      // localStorage unavailable — keep defaults.
    }
  }, []);

  // Account preferences win once known, so the next login (even on another
  // browser) returns to the same theme/language instead of resetting.
  useEffect(() => {
    if (!user || appliedForUser.current === user.id) return;
    appliedForUser.current = user.id;
    setThemeState(user.theme);
    setLocaleState(user.locale);
    applyThemeToDom(user.theme);
    try {
      localStorage.setItem(THEME_KEY, user.theme);
      localStorage.setItem(LOCALE_KEY, user.locale);
    } catch {
      // ignore persistence failure
    }
  }, [user]);

  const persist = useCallback(
    (next: Partial<{ theme: Theme; locale: Locale }>) => {
      if (!token) return;
      authApi.updateMe(token, next).catch(() => {
        // best-effort — local state already applied
      });
    },
    [token]
  );

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      applyThemeToDom(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // ignore
      }
      persist({ theme: next });
    },
    [persist]
  );

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      try {
        localStorage.setItem(LOCALE_KEY, next);
      } catch {
        // ignore
      }
      persist({ locale: next });
    },
    [persist]
  );

  const t = useCallback((key: TranslationKey) => translate(locale, key), [locale]);

  return (
    <PreferencesContext.Provider value={{ theme, locale, setTheme, setLocale, t }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}
