import { getSettings } from "./settings.js";
import { fmt, UI } from "./ui-text.js";

/** Сколько сообщений «назад» берём вместе с текущим (итого до 10). */
export const OLDER_CONTEXT_EXTRA = 9;

/** Сколько сообщений «вперёд» берём после текущего (итого до 11). */
export const NEWER_CONTEXT_EXTRA = 10;

export const MESSAGE_CONTEXT = Object.freeze({
  OLDER: "older",
  NEWER: "newer",
});

export function normalizeMessageContext(value) {
  return value === MESSAGE_CONTEXT.NEWER
    ? MESSAGE_CONTEXT.NEWER
    : MESSAGE_CONTEXT.OLDER;
}

export function getCharacterMessageContext() {
  return normalizeMessageContext(getSettings().characterMessageContext);
}

export function getLocationMessageContext() {
  return normalizeMessageContext(getSettings().locationMessageContext);
}

export function getMessageContextTooltip(entityType) {
  const isCharacter = entityType === "characters";
  const direction = isCharacter
    ? getCharacterMessageContext()
    : getLocationMessageContext();
  const cardLabel = isCharacter
    ? UI.messageContext.characterCard
    : UI.messageContext.locationCard;

  return fmt.messageContextTooltip(
    direction === MESSAGE_CONTEXT.NEWER ? "newer" : "older",
    cardLabel,
  );
}

export function updateEntityButtonTooltips() {
  $(".story-manager-char-btn").attr("title", getMessageContextTooltip("characters"));
  $(".story-manager-loc-btn").attr("title", getMessageContextTooltip("locations"));
}
