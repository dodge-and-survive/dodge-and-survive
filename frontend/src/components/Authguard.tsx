"use client";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useRouter, usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const PUBLIC_PATHS = ["/", "/register"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { address, status } = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const hasSettled = useRef(false);

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) return;

    // Mark as settled only after we see connected or disconnected
    if (status === "connecting" || status === "reconnecting") {
      hasSettled.current = false;
      return;
    }

    // First time we see a settled state
    if (!hasSettled.current) {
      hasSettled.current = true;
    }

    if (status === "disconnected") {
      router.push("/");
      return;
    }

    if (status === "connected" && address) {
      const checkRegistration = async () => {
        try {
          const res = await fetch(`${API_URL}/api/profile/${address}`);
          const data = await res.json();
          if (!data.user || !data.user.username) {
            router.push("/register");
          }
        } catch {
          router.push("/register");
        }
      };
      checkRegistration();
    }
  }, [status, address, pathname]);

  return <>{children}</>;
}