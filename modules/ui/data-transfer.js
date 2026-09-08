import {
  createCurrentChatBackup,
  importIntoCurrentChat,
  readBackupFileText,
} from "../data-transfer.js";
import { createFromTemplate } from "../templates.js";
import { UI, fmt } from "../ui-text.js";
import { applyDataImportPopupText } from "./apply-ui-text.js";
import { mountStoryManagerModal } from "./modal-root.js";
import { closeStoryManagerPopup, openStoryManagerPopup } from "./popup-state.js";
import { toastError, toastSuccess, toastWarning } from "./toasts.js";

let $popup = null;
let pendingBackup = null;
let pendingFileName = "";

function safeFilePart(value) {
  return String(value || "chat")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "chat";
}

function getExportFileName() {
  const context = SillyTavern.getContext();
  const chatName = context?.characters?.[context.characterId]?.name || "chat";
  const date = new Date().toISOString().slice(0, 10);
  return `story-manager-${safeFilePart(chatName)}-${date}.json`;
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function closePopup() {
  if ($popup?.length) {
    closeStoryManagerPopup($popup);
  }
}

function ensurePopup() {
  if ($popup?.length) {
    return $popup;
  }

  $popup = createFromTemplate("story-manager-data-import-popup-template");
  applyDataImportPopupText($popup);
  mountStoryManagerModal($popup);

  $popup
    .find(".story-manager-data-import-close, .story-manager-data-import-backdrop")
    .on("click.storyManagerDataTransfer", closePopup);

  $popup
    .find("#story-manager-data-import-confirm-btn")
    .on("click.storyManagerDataTransfer", async function () {
      if (!pendingBackup) {
        return;
      }

      const $button = $(this);
      $button.prop("disabled", true);
      try {
        const mode = $popup.find('input[name="story_manager_import_mode"]:checked').val();
        const restoreSettings = $popup.find("#story_manager_import_settings").prop("checked");
        const stats = importIntoCurrentChat(pendingBackup, { mode, restoreSettings });
        closePopup();

        const { refreshFromChatState } = await import("../../app/chat-refresh.js");
        await refreshFromChatState();
        toastSuccess(fmt.dataImportSuccess(stats), { dedupe: false });
        if (restoreSettings) {
          toastWarning(UI.dataTransfer.reloadSettingsHint, { dedupe: false });
        }
      } catch (err) {
        console.error("Story Manager: data import failed", err);
        toastError(UI.dataTransfer.importFailed, err, { dedupe: false });
      } finally {
        $button.prop("disabled", false);
      }
    });

  return $popup;
}

function showImportPopup(fileName, parsed) {
  pendingBackup = parsed.backup;
  pendingFileName = fileName;
  const popup = ensurePopup();
  popup.find("#story-manager-data-import-file-name").text(pendingFileName);
  popup.find("#story-manager-data-import-stats").text(fmt.dataImportStats(parsed.stats));
  popup.find('input[name="story_manager_import_mode"][value="merge"]').prop("checked", true);
  popup.find("#story_manager_import_settings").prop("checked", false);
  popup
    .find(".story-manager-data-import-settings-row")
    .toggleClass("story-manager-hidden", !parsed.stats.hasSettings);
  openStoryManagerPopup(popup);
}

async function handleImportFile(file) {
  if (!file) {
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error(UI.dataTransfer.fileTooLarge);
  }
  const text = await file.text();
  showImportPopup(file.name, readBackupFileText(text));
}

export function initDataTransferUI($settingsPanel) {
  const $fileInput = $settingsPanel.find("#story_manager_data_import_file");

  $settingsPanel
    .find("#story_manager_data_export_btn")
    .on("click.storyManagerDataTransfer", () => {
      try {
        const backup = createCurrentChatBackup();
        downloadJson(backup, getExportFileName());
        toastSuccess(UI.dataTransfer.exportSuccess, { dedupe: false });
      } catch (err) {
        toastError(UI.dataTransfer.exportFailed, err, { dedupe: false });
      }
    });

  $settingsPanel
    .find("#story_manager_data_import_btn")
    .on("click.storyManagerDataTransfer", () => $fileInput.trigger("click"));

  $fileInput.on("change.storyManagerDataTransfer", async function () {
    const file = this.files?.[0];
    this.value = "";
    try {
      await handleImportFile(file);
    } catch (err) {
      console.error("Story Manager: invalid backup", err);
      toastError(UI.dataTransfer.invalidFile, err, { dedupe: false });
    }
  });
}
