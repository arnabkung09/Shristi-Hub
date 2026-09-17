import { useCallback, useEffect, useState } from "react";
import type { HubChatMessage } from "../lib/types";
import { postHubChat, removeHubChat, subscribeHubChat, type HubRoom } from "../lib/firebase-client";

export function useHubChat(room: HubRoom | null, enabled: boolean) {
  const [messages, setMessages] = useState<HubChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    setMessages([]); setError(""); setLoading(enabled);
    if (!room || !enabled) return;
    return subscribeHubChat(room, (next) => { setMessages(next); setLoading(false); }, (failure) => {
      setMessages([]); setLoading(false);
      const code = "code" in failure ? String(failure.code) : "";
      setError(code.includes("permission-denied") ? "This hub could not be authorized. Ask an admin to check your membership and deploy the latest Firestore rules." : "The conversation could not connect. Check your connection and try again.");
    });
  }, [room, enabled, retryCount]);

  const send = useCallback(async (body: string, title = "", kind: "message" | "instruction" = "message") => {
    if (!room || !enabled) throw new Error("You do not have access to this hub.");
    return postHubChat(room, { body, title, kind });
  }, [room, enabled]);
  const remove = useCallback(async (id: string) => {
    if (!room || !enabled) throw new Error("You do not have access to this hub.");
    return removeHubChat(room, id);
  }, [room, enabled]);
  return { messages, loading, error, send, remove, retry: () => setRetryCount((value) => value + 1) };
}