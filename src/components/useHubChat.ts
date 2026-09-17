import { useCallback, useEffect, useState } from "react";
import type { HubChatMessage, HubRoom, Student } from "../lib/types";
import { postHubChat, removeHubChat, subscribeHubChat } from "../lib/firebase-client";

/**
 * Live Firestore transport for a membership-gated hub room. Messages are stored in
 * `hubChat/{room}/messages`, where the security rules check the writer's roster id
 * against the room's explicit member list before any read or write is allowed.
 */
export function useHubChat(room: HubRoom | null, author: Student | null, enabled: boolean) {
  const [messages, setMessages] = useState<HubChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setMessages([]);
    setError("");
    setLoading(Boolean(room && enabled));
    if (!room || !enabled) return;
    return subscribeHubChat(
      room,
      (next) => { setMessages(next); setLoading(false); },
      (failure) => {
        setMessages([]);
        setLoading(false);
        const code = "code" in failure ? String(failure.code) : "";
        setError(code.includes("permission-denied")
          ? "This hub could not be authorized. Only accounts explicitly added to it can read or post — ask an administrator to check the member list and deploy the latest Firestore rules."
          : "The conversation could not connect. Check your connection and try again.");
      },
    );
  }, [room, enabled, retryCount]);

  const send = useCallback(async (body: string) => {
    if (!room || !enabled || !author) throw new Error("You do not have access to this hub.");
    return postHubChat(room, { body, author });
  }, [room, enabled, author]);

  const remove = useCallback(async (id: string) => {
    if (!room || !enabled) throw new Error("You do not have access to this hub.");
    return removeHubChat(room, id);
  }, [room, enabled]);

  return { messages, loading, error, send, remove, retry: () => setRetryCount((value) => value + 1) };
}
