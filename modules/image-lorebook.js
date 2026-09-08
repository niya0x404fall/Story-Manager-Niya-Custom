import { getContext } from "../../../../extensions.js";
import { loadWorldInfo } from "../../../../world-info.js";
import { getTargetLorebook } from "./chat-settings.js";
import { getImageGlobals } from "./image-presets.js";

function getLorebookEntries(lorebookData) {
  if (!lorebookData?.entries) {
    return [];
  }

  return Array.isArray(lorebookData.entries)
    ? lorebookData.entries
    : Object.values(lorebookData.entries);
}

function getEntryKeys(entry) {
  const primary = Array.isArray(entry.key)
    ? entry.key
    : String(entry.key || "")
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);
  const secondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : [];

  return [...primary, ...secondary]
    .map((key) => String(key).trim())
    .filter(Boolean);
}

function entryMatchesText(entry, text) {
  if (entry.constant) {
    return true;
  }

  const keys = getEntryKeys(entry);
  if (!keys.length) {
    return false;
  }

  const haystack = text.toLowerCase();
  return keys.some((key) => haystack.includes(key.toLowerCase()));
}

function resolveLorebookName() {
  const fromChat = getTargetLorebook();
  if (fromChat) {
    return fromChat;
  }

  const context = getContext();
  return context.characters?.[context.characterId]?.data?.extensions?.world || "";
}

/**
 * Отдельные system-сообщения по каждой сработавшей записи лорбука.
 * @param {string} sceneText
 * @returns {Promise<string[]>}
 */
export async function collectLorebookSystemMessages(sceneText) {
  const globals = getImageGlobals();
  if (!globals.sendLorebook) {
    return [];
  }

  const lorebookName = resolveLorebookName();
  if (!lorebookName) {
    return [];
  }

  const lorebookData = await loadWorldInfo(lorebookName);
  const entries = getLorebookEntries(lorebookData);
  if (!entries.length) {
    return [];
  }

  const matched = entries
    .filter((entry) => entry && !entry.disable && entry.content?.trim())
    .filter((entry) => entryMatchesText(entry, sceneText));

  if (!matched.length) {
    return [];
  }

  return matched.map(
    (entry) =>
      `### Lorebook — ${entry.comment || entry.uid || "Lore"} (${lorebookName})\n${entry.content.trim()}`,
  );
}
