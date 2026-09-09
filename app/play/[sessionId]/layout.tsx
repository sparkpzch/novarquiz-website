"use client";

import { use, useEffect } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { maintainSessionPresence } from "@/lib/firebase/rtdb";

export default function PlaySessionLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    return maintainSessionPresence(user.uid, sessionId);
  }, [user, sessionId]);
  return children;
}
