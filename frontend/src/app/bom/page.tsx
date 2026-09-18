// DEC-062: the top-level /bom page is gone — the BOM is now a 5th
// view inside each project page. Anyone who has a stale /bom URL
// (e.g. a bookmark) lands on the projects list.
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BomRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/projects");
  }, [router]);
  return null;
}
