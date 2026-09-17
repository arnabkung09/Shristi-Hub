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
 *   written to the membership-gated Firestore room `hubChat/council/messages`.
 * - `device` — the offline/demo path, where the thread lives in the locally persisted
 *   `councilMessages` slice and syncs between tabs of the same browser.
 *
 * Either way the same rule applies: only accounts explicitly added to the hub can read
 * or post. Administrators manage the membership list but are not members automatically.
 */
export function useCouncilChat() {
  const { state, user, dispatch, firebaseStatus } = useHub();
  const member = canReadCouncilHub(state, user);
  const cloud = member && firebaseStatus === "connected";
  const cloudChat = useHubChat(COUNCIL_HUB_ROOM, user, cloud);

  const deviceMessages = useMemo(() => sortCouncilMessages(state.councilMessages), [state.councilMessages]);

  const send = useCallback(async (body: string) => {
    if (!user || !canPostToCouncilHub(state, user)) {
      throw new Error("Only accounts added to the Council Hub can post here.");
    }
    if (cloud) return cloudChat.send(body);
    const message: CouncilChatMessage = {
      id: uid(),
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      authorTitle: user.councilTitle,
      body,
      timestamp: Date.now(),
    };
    return dispatch({ type: "POST_COUNCIL_MESSAGE", message });
  }, [state, user, cloud, cloudChat, dispatch]);

  const remove = useCallback(async (messageId: string) => {
    if (cloud) return cloudChat.remove(messageId);
    return dispatch({ type: "DELETE_COUNCIL_MESSAGE", messageId });
  }, [cloud, cloudChat, dispatch]);

  return {
    member,
    transport: (cloud ? "cloud" : "device") as CouncilChatTransport,
    messages: cloud ? cloudChat.messages : deviceMessages,
    loading: cloud ? cloudChat.loading : false,
    error: cloud ? cloudChat.error : "",
    retry: cloudChat.retry,
    send,
    remove,
  };
}
