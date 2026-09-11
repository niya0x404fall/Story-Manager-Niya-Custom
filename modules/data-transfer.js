import { getContext } from "../../../../extensions.js";
import { getSettings, saveSettings } from "./settings.js";
import { saveChatMetadata } from "./storage.js";
import {
  applyImportedChatData,
  buildStoryManagerBackup,
  getBackupStats,
  parseStoryManagerBackup,
} from "./data-transfer-format.js";

export const STORY_MANAGER_EXTENSION_VERSION = "0.4.8";

export function createCurrentChatBackup() {
  const context = getContext();
  if (!context?.chatMetadata) {
    throw new Error("Сначала откройте чат.");
  }

  return buildStoryManagerBackup({
    chatMetadata: context.chatMetadata,
    settings: getSettings(),
    extensionVersion: STORY_MANAGER_EXTENSION_VERSION,
  });
}

export function readBackupFileText(text) {
  const backup = parseStoryManagerBackup(text);
  return { backup, stats: getBackupStats(backup) };
}

export function importIntoCurrentChat(backup, { mode = "merge", restoreSettings = false } = {}) {
  const context = getContext();
  if (!context?.chatMetadata) {
    throw new Error("Сначала откройте чат для импорта.");
  }

  applyImportedChatData(context.chatMetadata, backup.chatData, mode);
  saveChatMetadata();

  if (restoreSettings && backup.settings && Object.keys(backup.settings).length) {
    const settings = getSettings();
    const connectionProfileId = settings.connectionProfileId;
    Object.assign(settings, backup.settings);
    if (
      !Object.prototype.hasOwnProperty.call(backup.settings, "summaryEnabled") &&
      Object.prototype.hasOwnProperty.call(backup.settings, "summaryAutoEnabled")
    ) {
      settings.summaryEnabled = Boolean(backup.settings.summaryAutoEnabled);
    }
    settings.connectionProfileId = connectionProfileId;
    saveSettings();
  }

  return getBackupStats(backup);
}
