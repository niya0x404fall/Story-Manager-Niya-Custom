import { getContext } from "../../../../extensions.js";

/** Можно ли писать текущий чат / metadata на диск (открыт чат персонажа). */
export function canPersistChatState() {
  const context = getContext();
  if (!context?.chatMetadata) {
    return false;
  }

  const chid = context.characterId;
  if (chid === undefined || chid === null) {
    return false;
  }

  return Boolean(context.characters?.[chid]?.chat);
}

/** Сохранить chatMetadata после правок в context.chatMetadata. */
export function saveChatMetadata() {
  const context = getContext();
  if (!context?.chatMetadata) {
    return;
  }

  if (typeof window.saveMetadataDebounced === "function") {
    window.saveMetadataDebounced();
  } else if (typeof window.saveMetadata === "function") {
    window.saveMetadata();
  } else if (context.saveChat) {
    context.saveChat();
  }
}

/** Сохранить тело чата (сообщения, extra) после правок в context.chat. */
export function saveChat() {
  if (!canPersistChatState()) {
    return;
  }

  const context = getContext();

  if (typeof window.saveChatDebounced === "function") {
    window.saveChatDebounced();
    return;
  }

  if (context?.saveChat) {
    context.saveChat();
  }
}
