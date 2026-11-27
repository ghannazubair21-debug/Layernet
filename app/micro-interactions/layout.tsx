import { notFound } from "next/navigation";
import { DEV_LABS_ENABLED } from "@/lib/devLabs";

/** Development-only component lab: 404 in production builds (see lib/devLabs.ts). */
export default function MicroInteractionsLayout({ children }: { children: React.ReactNode }) {
  if (!DEV_LABS_ENABLED) notFound();
  return children;
}
