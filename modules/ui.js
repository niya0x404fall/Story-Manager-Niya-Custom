import { world_names } from "../../../../world-info.js";

import { getSettings, initSettings, saveSettings } from "./settings.js";
import { getTargetLorebook, setTargetLorebook } from "./chat-settings.js";
import { loadTemplates, createFromTemplate } from "./templates.js";
import { getAllProfiles, getProfileId, setProfileId } from "./profiles.js";
import { initPromptsManager } from "./ui/prompts.js";
import {
  MESSAGE_CONTEXT,
  updateEntityButtonTooltips,
} from "./message-context.js";

import { renderNotes, initNotesUI } from "./ui/notes.js";
import { renderCharacters } from "./ui/characters.js";
import { renderLocations } from "./ui/locations.js";
import {
  renderSummary,
  initSummaryUI,
  refreshSummarySettingsUI,
} from "./ui/summary.js";
import { initDataTransferUI } from "./ui/data-transfer.js";
import { applySettingsPanelText } from "./ui/apply-ui-text.js";
import { UI } from "./ui-text.js";

export { renderNotes, renderCharacters, renderLocations, renderSummary };

let uiInitialized = false;
let $settingsPanelRef = null;
let duplicateInstallObserver = null;

function refreshDuplicateInstallWarning() {
  const duplicateCount = document.querySelectorAll("#story_manager_settings").length;
  $(".story-manager-duplicate-install-warning").toggleClass(
    "story-manager-hidden",
    duplicateCount < 2,
  );
}

function watchForDuplicateInstallations() {
  refreshDuplicateInstallWarning();
  if (duplicateInstallObserver) {
    return;
  }

  const settingsRoot = document.getElementById("extensions_settings2");
  if (!settingsRoot) {
    return;
  }

  duplicateInstallObserver = new MutationObserver(() => {
    refreshDuplicateInstallWarning();
  });
  duplicateInstallObserver.observe(settingsRoot, { childList: true, subtree: true });
}

export async function initUI() {
  if (uiInitialized) return;
  const templatesLoaded = await loadTemplates();
  if (!templatesLoaded) {
    throw new Error("Failed to load Story Manager templates");
  }

  const $settingsPanel = createFromTemplate("story-manager-settings-template");
  applySettingsPanelText($settingsPanel);
  $settingsPanelRef = $settingsPanel;
  const settings = getSettings();

  updateProfilesList($settingsPanel);
  $settingsPanel.find("#story_manager_profile").on("change", function () {
    setProfileId($(this).val());
    saveSettings();
  });

  updateLorebooksList($settingsPanel);
  $settingsPanel.find("#story_manager_character_lorebook").on("change", function () {
    setTargetLorebook($(this).val());
  });

  initPromptsManager($settingsPanel);
  initDataTransferUI($settingsPanel);
  initNotesUI($settingsPanel);
  initMessageContextSelectors($settingsPanel);

  await renderSummary();
  initSummaryUI($settingsPanel);

  $("#extensions_settings2").append($settingsPanel);
  watchForDuplicateInstallations();

  const { eventSource, event_types } = await import("../../../../../script.js");
  eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, () => {
    initSettings();
    refreshSummarySettingsUI($settingsPanel);
  });

  uiInitialized = true;
}

/** Обновить UI, зависящий от текущей ролевой (лорбук и списки сущностей). */
export function refreshChatBoundUI() {
  if ($settingsPanelRef) {
    updateLorebooksList($settingsPanelRef);
    refreshSummarySettingsUI($settingsPanelRef);
  }
}

function updateProfilesList($panel) {
  const $select = $panel.find("#story_manager_profile");
  const profiles = getAllProfiles();
  $select
    .empty()
    .append(`<option value="">${UI.settings.profileDefaultOption}</option>`);
  profiles.forEach((p) =>
    $select.append($("<option></option>").val(p.id).text(p.name)),
  );
  $select.val(getProfileId());
}

function updateLorebooksList($panel) {
  const $select = $panel.find("#story_manager_character_lorebook");
  const saved = getTargetLorebook();
  const names = world_names ? [...world_names] : [];
  $select.empty().append(`<option value="">${UI.settings.lorebookNotSelected}</option>`);
  names
    .sort()
    .forEach((n) => $select.append($("<option></option>").val(n).text(n)));
  $select.val(saved);
}

function initMessageContextSelectors($panel) {
  const settings = getSettings();

  const selectors = [
    {
      id: "#story_manager_character_context",
      key: "characterMessageContext",
    },
    {
      id: "#story_manager_location_context",
      key: "locationMessageContext",
    },
  ];

  selectors.forEach(({ id, key }) => {
    $panel
      .find(id)
      .val(settings[key] || MESSAGE_CONTEXT.OLDER)
      .on("change", function () {
        settings[key] = $(this).val();
        saveSettings();
        updateEntityButtonTooltips();
      });
  });

  updateEntityButtonTooltips();
}
