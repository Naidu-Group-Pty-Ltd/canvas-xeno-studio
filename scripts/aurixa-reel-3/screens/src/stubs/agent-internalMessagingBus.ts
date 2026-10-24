/**
 * The harness's stand-in for the product's src/lib/internalMessagingBus.ts: the same exports, without the Supabase
 * Realtime channel.
 *
 * The product's bus joins one broadcast channel (`internal-messaging-bus`) on the Supabase host as soon as anything
 * listens (AgentChatWidget does, on mount), so every Command Centre tab hears the others' "a message was posted" and
 * "typing" hints. Its channel is `broadcast: { self: false }`: a tab never hears itself. The demo is one tab, so here
 * nothing is ever heard and a hint goes nowhere, which is what the product's channel delivers with nobody else on it,
 * and nothing reaches a Supabase host. The window events below are the product's, unchanged (lines 112-167).
 */

export interface MessageSignal {
  thread_id: string;
  sender_id?: string | null;
  sender_name?: string | null;
  at: string;
}

export interface TypingSignal {
  thread_id: string;
  user_id: string;
  user_name: string;
  at: string;
}

type MessageHandler = (signal: MessageSignal) => void;
type TypingHandler = (signal: TypingSignal) => void;

const messageHandlers = new Set<MessageHandler>();
const typingHandlers = new Set<TypingHandler>();

/** Subscribe to "new message posted" hints. Returns an unsubscribe fn. */
export function onInternalMessage(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  return () => {
    messageHandlers.delete(handler);
  };
}

/** Subscribe to typing hints. Returns an unsubscribe fn. */
export function onInternalTyping(handler: TypingHandler): () => void {
  typingHandlers.add(handler);
  return () => {
    typingHandlers.delete(handler);
  };
}

/** A hint for the other tabs; there are none. */
export function publishInternalMessage(_signal: Omit<MessageSignal, "at">) {
  /* best-effort, and nobody else is listening */
}

export function publishInternalTyping(_signal: Omit<TypingSignal, "at">) {
  /* best-effort, and nobody else is listening */
}

/**
 * Tracks whether the Aurixa widget is currently showing the internal messages
 * panel. Pop-up alerts are suppressed while the user is already reading there.
 */
let messagesPanelOpen = false;

export function setInternalMessagesPanelOpen(open: boolean) {
  messagesPanelOpen = open;
}

export function isInternalMessagesPanelOpen() {
  return messagesPanelOpen;
}

/** Window event used to pop the Aurixa widget open on the messages panel. */
export const OPEN_INTERNAL_MESSAGES_EVENT = 'aurixa:open-internal-messages';

export function requestOpenInternalMessages(threadId?: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_INTERNAL_MESSAGES_EVENT, { detail: { threadId } }),
  );
}

/**
 * Window event used to detach a conversation from the Aurixa widget into a
 * free-floating, draggable, resizable pop-out chat window.
 */
export const POP_OUT_INTERNAL_THREAD_EVENT = 'aurixa:pop-out-internal-thread';

export interface PopOutThreadHint {
  thread_id: string;
  kind?: 'direct' | 'group' | 'broadcast';
  /** Best-known display title so the pop-out renders instantly. */
  title?: string | null;
}

/** Ask the floating pop-out layer to open (and expand) this conversation. */
export function requestPopOutInternalThread(hint: PopOutThreadHint) {
  window.dispatchEvent(
    new CustomEvent(POP_OUT_INTERNAL_THREAD_EVENT, { detail: hint }),
  );
}

/** Subscribe to pop-out requests. Returns an unsubscribe fn. */
export function onInternalThreadPopOut(
  handler: (hint: PopOutThreadHint) => void,
): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail as PopOutThreadHint | undefined;
    if (detail?.thread_id) handler(detail);
  };
  window.addEventListener(POP_OUT_INTERNAL_THREAD_EVENT, listener);
  return () => window.removeEventListener(POP_OUT_INTERNAL_THREAD_EVENT, listener);
}
