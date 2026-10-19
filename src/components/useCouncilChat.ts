import { useCallback, useMemo } from "react";
import { uid, useHub } from "../store/hub";
import {
  COUNCIL_HUB_ROOM,
  canPostToCouncilHub,
  canReadCouncilHub,
  sortCouncilMessages,
} from "../lib/council";
import type { CouncilChatMessage } from "../lib/types";
import { useHubChat } from "./useHubChat";

export type CouncilChatTransport = "cloud" | "device";

/**
 * Council Hub chat with two transports:
 *
 * - `cloud` — a Google-signed-in member is connected, so messages are read from and
 *   written to the membership-gated Firestore room `hubChat/council/messages` alongside
 *   the MongoDB-backed `councilMessages` slice.
 * - `device` — the MongoDB/local path, where the thread lives in the persisted
 *   `councilMessages` slice and syncs across devices via `/api/state` and between tabs.
 *
 * Either way the same rule applies: only accounts explicitly added to the hub can read
 * or post. Administrators manage the membership list but are not members automatically.
 */
export function useCouncilChat() {
  const { state, user, dispatch, firebaseStatus } = useHub();
  const member = canReadCouncilHub(state, user);
  const cloud = member && firebaseStatus === "connected";
  const cloudChat = useHubChat(COUNCIL_HUB_ROOM, user, cloud);

  const mergedMessages = useMemo(() => {
    const map = new Map<string, CouncilChatMessage>();
    for (const m of state.councilMessages || []) {
      if (m && m.id) map.set(m.id, m);
    }
    if (cloud && Array.isArray(cloudChat.messages)) {
      for (const cm of cloudChat.messages) {
        if (cm && cm.id && !map.has(cm.id)) {
          const isDuplicate = Array.from(map.values()).some(
            (existing) =>
              existing.authorId === cm.authorId &&
              existing.body === cm.body &&
              Math.abs(existing.timestamp - cm.timestamp) < 5000
          );
          if (!isDuplicate) {
            map.set(cm.id, cm);
          }
        }
      }
    }
    return sortCouncilMessages(Array.from(map.values()));
  }, [state.councilMessages, cloud, cloudChat.messages]);

  const send = useCallback(async (body: string) => {
    if (!user || !canPostToCouncilHub(state, user)) {
      throw new Error("Only accounts added to the Council Hub can post here.");
    }
    const message: CouncilChatMessage = {
      id: uid(),
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      authorTitle: user.councilTitle,
      body,
      timestamp: Date.now(),
    };
    dispatch({ type: "POST_COUNCIL_MESSAGE", message });
    if (cloud && !cloudChat.error) {
      await cloudChat.send(body).catch(() => {});
    }
  }, [state, user, cloud, cloudChat, dispatch]);

  const remove = useCallback(async (messageId: string) => {
    const inLocal = state.councilMessages.some((m) => m.id === messageId);
    if (inLocal) {
      dispatch({ type: "DELETE_COUNCIL_MESSAGE", messageId });
    }
    if (cloud && !cloudChat.error) {
      await cloudChat.remove(messageId).catch(() => {});
    }
  }, [state.councilMessages, cloud, cloudChat, dispatch]);

  const useCloudActive = cloud && !cloudChat.error;

  return {
    member,
    transport: (useCloudActive ? "cloud" : "device") as CouncilChatTransport,
    messages: mergedMessages,
    loading: useCloudActive && mergedMessages.length === 0 ? cloudChat.loading : false,
    error: "",
    retry: cloudChat.retry,
    send,
    remove,
  };
}
