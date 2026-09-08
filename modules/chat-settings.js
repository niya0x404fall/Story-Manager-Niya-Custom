import { getContext } from "../../../../extensions.js";
import { getSettings, saveSettings } from "./settings.js";
import { saveChatMetadata } from "./storage.js";

const CHAT_SETTINGS_KEY = "story-manager-chat-settings";

function readRawChatSettings() {
  const context = getContext();
  if (!context?.chatMetadata) {
    return null;
  }

  return context.chatMetadata[CHAT_SETTINGS_KEY] || null;
}

function writeChatSettings(settings) {
  const context = getContext();
  if (!context?.chatMetadata) {
    return;
  }

  context.chatMetadata[CHAT_SETTINGS_KEY] = settings;
  saveChatMetadata();
}

/**
 * Настройки, привязанные к текущей ролевой (chatMetadata).
 */
export function getChatSettings() {
  const raw = readRawChatSettings();
  if (raw) {
    return {
      targetLorebook: raw.targetLorebook || "",
    };
  }

  return { targetLorebook: "" };
}

export function getTargetLorebook() {
  const settings = getChatSettings();
  if (settings.targetLorebook) {
    return settings.targetLorebook;
  }

  const legacy = getSettings().targetLorebook || "";
  if (!legacy || readRawChatSettings() !== null) {
    return "";
  }

  writeChatSettings({ targetLorebook: legacy });

  const globalSettings = getSettings();
  globalSettings.targetLorebook = "";
  saveSettings();

  return legacy;
}

export function setTargetLorebook(lorebookName) {
  const settings = getChatSettings();
  settings.targetLorebook = lorebookName || "";
  writeChatSettings(settings);
}
