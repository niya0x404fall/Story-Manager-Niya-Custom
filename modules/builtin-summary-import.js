import { getContext } from "../../../../extensions.js";

/**
 * Текст из встроенного расширения Summarize (memory).
 * Сначала поле в UI, затем последний extra.memory в чате.
 */
export function getBuiltinSummarizeText() {
  const fromUi = String($("#memory_contents").val() || "").trim();
  if (fromUi) {
    return fromUi;
  }

  const chat = getContext()?.chat;
  if (!Array.isArray(chat) || !chat.length) {
    return "";
  }

  const reversed = chat.slice().reverse();
  reversed.shift();

  for (const mes of reversed) {
    const memory = mes?.extra?.memory;
    if (typeof memory === "string" && memory.trim()) {
      return memory.trim();
    }
  }

  return "";
}

export function hasBuiltinSummarizeText() {
  return Boolean(getBuiltinSummarizeText());
}
