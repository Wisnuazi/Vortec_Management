"use client";

import { useEffect, useState, type ReactNode } from "react";
import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";
import styles from "./AppShell.module.css";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MenuIcon } from "@/components/icons";
import logoDark from "../../../public/brand/vortec-logo-full-dark.png";

const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var choice = localStorage.getItem("vortec-theme");
    if (choice === "light" || choice === "dark") {
      document.documentElement.setAttribute("data-theme", choice);
    }
  } catch (e) {}
})();
`;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const isLoginPage = pathname === "/login";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user && !isLoginPage) router.replace("/login");
    if (user && isLoginPage) router.replace("/");
  }, [loading, user, isLoginPage, router]);

  // Auto-close the mobile drawer when the route changes — otherwise the
  // user is stuck looking at a black-scrimmed sidebar after tapping a link.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open, so a background
  // scroll doesn't escape the modal context.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  const themeScript = (
    <Script id="vortec-theme-init" strategy="beforeInteractive">
      {NO_FLASH_THEME_SCRIPT}
    </Script>
  );

  if (isLoginPage) {
    return (
      <>
        {themeScript}
        {children}
      </>
    );
  }

  if (loading || !user) {
    return (
      <>
        {themeScript}
        <div className={styles.loadingScreen} />
      </>
    );
  }

  return (
    <>
      {themeScript}
      <Link href="#main-content" className={styles.skipLink}>
        Skip to main content
      </Link>
      <div className={styles.mobileHeader}>
        <div className={styles.mobileBrand}>
          <Image src={logoDark} alt="Vortec" height={20} priority />
        </div>
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileNavOpen}
        >
          <MenuIcon />
        </button>
      </div>
      <div className={styles.shell}>
        <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <div className={styles.mainCol}>
          <Topbar />
          <main id="main-content" className={styles.main} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      {mobileNavOpen ? (
        <div
          className={styles.scrim}
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
