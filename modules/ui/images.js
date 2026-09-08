import { saveSettings } from "../settings.js";
import {
  createFromTemplate,
  isImagePresetPopupTemplateCurrent,
  reloadPopupsTemplates,
} from "../templates.js";
import { fmt, UI } from "../ui-text.js";
import {
  applyEntityCardTemplateText,
  applyImagePresetPopupText,
} from "./apply-ui-text.js";
import { mountStoryManagerModal } from "./modal-root.js";
import {
  closeStoryManagerPopup,
  openStoryManagerPopup,
} from "./popup-state.js";
import { importExtBlocksPresetJson } from "../image-import.js";
import {
  createBlankImagePreset,
  DEFAULT_IMAGE_INSTRUCTION,
} from "../image-defaults.js";
import {
  getPresetInstruction,
  normalizeImagePresetForStorage,
} from "../image-preset.js";
import {
  deleteImagePreset,
  getActiveImagePresetId,
  getImageGlobals,
  getImagePresets,
  isImagesEnabled,
  setActiveImagePresetId,
  setImagePresetEnabled,
  upsertImagePreset,
} from "../image-presets.js";
import {
  toastImageError,
  toastImageSuccess,
} from "./toasts.js";

let $popupRoot = null;
let editingPresetId = null;
let presetPopupHandlersTarget = null;

function isPresetPopupDomCurrent($popup) {
  return Boolean($popup?.length && $popup.find("#story_image_preset_instruction").length);
}

function destroyPresetPopup() {
  if ($popupRoot?.length) {
    $popupRoot.off(".storyManagerImagePreset");
    $popupRoot.remove();
  }
  $popupRoot = null;
  presetPopupHandlersTarget = null;
}

function createPresetPopup() {
  destroyPresetPopup();

  if (!isImagePresetPopupTemplateCurrent()) {
    console.warn(
      "Story Manager: шаблон пресета картинок устарел. Обновите страницу (Ctrl+F5) или дождитесь перезагрузки шаблонов.",
    );
  }

  $popupRoot = createFromTemplate("story-manager-image-preset-popup-template");
  applyImagePresetPopupText($popupRoot);
  mountStoryManagerModal($popupRoot);
  bindPresetPopupHandlers($popupRoot);
  return $popupRoot;
}

function getPopupRoot() {
  if (!isPresetPopupDomCurrent($popupRoot)) {
    createPresetPopup();
    return $popupRoot;
  }

  if (!$popupRoot.find("#story_image_preset_imagen_hint").text().trim()) {
    applyImagePresetPopupText($popupRoot);
  }

  return $popupRoot;
}

function readPresetFromPopup($popup) {
  return {
    id: $popup.find("#story_image_preset_id").val() || `preset-${Date.now()}`,
    name: $popup.find("#story_image_preset_name").val().trim() || "Preset",
    enabled: true,
    instruction: ($popup.find("#story_image_preset_instruction").val() ?? "").trim(),
    contextPairCount: Math.max(
      1,
      parseInt($popup.find("#story_image_preset_context_pairs").val(), 10) || 4,
    ),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function fillPresetPopup($popup, preset) {
  $popup.find("#story_image_preset_id").val(preset.id);
  $popup.find("#story_image_preset_name").val(preset.name);
  $popup.find("#story_image_preset_instruction").val(getPresetInstruction(preset));
  $popup.find("#story_image_preset_context_pairs").val(preset.contextPairCount);
}

async function openPresetEditor(preset = null) {
  await refreshPresetPopupTemplatesIfNeeded();
  const $popup = getPopupRoot();
  const data = preset ? { ...preset } : createBlankImagePreset();
  editingPresetId = data.id;
  fillPresetPopup($popup, data);
  openStoryManagerPopup($popup);
}

function closePresetEditor() {
  closeStoryManagerPopup(getPopupRoot());
  editingPresetId = null;
}

function bindPresetPopupHandlers($popup) {
  if (!$popup?.length) {
    return;
  }

  if (presetPopupHandlersTarget === $popup[0]) {
    return;
  }

  presetPopupHandlersTarget = $popup[0];
  $popup.off(".storyManagerImagePreset");

  $popup
    .find(".story-manager-image-preset-close")
    .on("click.storyManagerImagePreset", closePresetEditor);
  $popup
    .find(".story-manager-image-preset-popup-backdrop")
    .on("click.storyManagerImagePreset", closePresetEditor);

  $popup
    .find("#story_image_preset_insert_default_btn")
    .on("click.storyManagerImagePreset", () => {
      $popup.find("#story_image_preset_instruction").val(DEFAULT_IMAGE_INSTRUCTION);
    });

  $popup.find("#story_image_preset_save_btn").on("click.storyManagerImagePreset", () => {
    const instruction = ($popup.find("#story_image_preset_instruction").val() ?? "").trim();
    if (!instruction) {
      toastImageError(UI.images.presetInstructionEmpty, null);
      return;
    }

    const preset = readPresetFromPopup($popup);
    const existing = getImagePresets().find((item) => item.id === editingPresetId);
    if (existing) {
      preset.createdAt = existing.createdAt;
      preset.enabled = existing.enabled;
    }
    upsertImagePreset(preset);
    closePresetEditor();
    renderImagePresetsList();
    toastImageSuccess(UI.images.presetSaved);
  });
}

async function refreshPresetPopupTemplatesIfNeeded() {
  if (isImagePresetPopupTemplateCurrent()) {
    return;
  }

  const ok = await reloadPopupsTemplates();
  if (ok) {
    destroyPresetPopup();
  }
}

function ensurePresetPopupReady() {
  getPopupRoot();
}

export async function prepareImagePresetPopupUi() {
  await refreshPresetPopupTemplatesIfNeeded();
  ensurePresetPopupReady();
}

function updateImageSettingsVisibility($panel) {
  const enabled = $panel.find("#story_image_enabled").prop("checked");
  $panel.find("#story_image_settings_body").toggle(enabled);
}

export function renderImagePresetsList() {
  const $list = $("#story-image-presets-list");
  const presets = getImagePresets();
  const activeId = getActiveImagePresetId();

  $list.empty();

  if (!isImagesEnabled()) {
    return;
  }

  if (!presets.length) {
    $list.html(`<i>${UI.settings.images.noPresets}</i>`);
    return;
  }

  presets.forEach((preset) => {
    const $card = createFromTemplate("story-manager-image-preset-card-template");
    applyEntityCardTemplateText($card, "imagePreset");
    $card.attr("data-preset-id", preset.id);
    $card.find(".story-image-preset-name").text(preset.name);
    const enabled = preset.enabled !== false;
    $card.find(".story-image-preset-toggle").prop("checked", enabled);
    $card.toggleClass("is-active", preset.id === activeId);
    $card.toggleClass("is-enabled", enabled);
    $card.toggleClass("is-disabled", !enabled);

    $list.append($card);
  });
}

function bindPresetListHandlers($panel) {
  const namespace = ".storyManagerImages";

  $panel.off(namespace);

  $panel.on(`change${namespace}`, "#story_image_enabled", function () {
    const globals = getImageGlobals();
    globals.imagesEnabled = $(this).prop("checked");
    saveSettings();
    updateImageSettingsVisibility($panel);
    renderImagePresetsList();
    import("../buttons.js").then((module) => module.refreshImageButtons());
  });

  $panel.on(`click${namespace}`, "#story_image_preset_create_btn", () => {
    void openPresetEditor();
  });

  $panel.on(`click${namespace}`, "#story_image_preset_import_btn", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const preset = importExtBlocksPresetJson(json);
        upsertImagePreset(preset);
        renderImagePresetsList();
        toastImageSuccess(fmt.imagePresetImported(preset.name));
      } catch (err) {
        toastImageError(UI.images.importFailedPrefix, err);
      }
    };
    input.click();
  });

  $panel.on(`change${namespace}`, ".story-image-preset-toggle", function () {
    const enabled = $(this).prop("checked");
    const id = $(this).closest("[data-preset-id]").attr("data-preset-id");
    if (!id) {
      return;
    }

    setImagePresetEnabled(id, enabled);
    renderImagePresetsList();
  });

  $panel.on(`click${namespace}`, ".story-image-preset-name", function () {
    const id = $(this).closest("[data-preset-id]").attr("data-preset-id");
    if (!id) {
      return;
    }

    setActiveImagePresetId(id);
    renderImagePresetsList();
  });

  $panel.on(`click${namespace}`, ".story-image-preset-edit-btn", function () {
    const id = $(this).closest("[data-preset-id]").attr("data-preset-id");
    const preset = getImagePresets().find((item) => item.id === id);
    if (preset) {
      void openPresetEditor(preset);
    }
  });

  $panel.on(`click${namespace}`, ".story-image-preset-export-btn", function () {
    const id = $(this).closest("[data-preset-id]").attr("data-preset-id");
    const preset = getImagePresets().find((item) => item.id === id);
    if (!preset) {
      return;
    }

    const exportPayload = normalizeImagePresetForStorage(preset);
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${preset.name.replace(/\s+/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  $panel.on(`click${namespace}`, ".story-image-preset-delete-btn", function () {
    const id = $(this).closest("[data-preset-id]").attr("data-preset-id");
    const preset = getImagePresets().find((item) => item.id === id);
    if (!confirm(fmt.imagePresetDeleteConfirm(preset?.name || id))) {
      return;
    }
    deleteImagePreset(id);
    renderImagePresetsList();
  });
}

function syncImageGlobalsCheckboxes($settingsPanel) {
  const globals = getImageGlobals();

  $settingsPanel.find("#story_image_send_char").prop("checked", Boolean(globals.sendCharCard));
  $settingsPanel.find("#story_image_send_user").prop("checked", Boolean(globals.sendUserCard));
  $settingsPanel.find("#story_image_send_lorebook").prop("checked", Boolean(globals.sendLorebook));
}

export function refreshImageGlobalsUI($settingsPanel) {
  if (!$settingsPanel?.length) {
    return;
  }

  const globals = getImageGlobals();
  $settingsPanel.find("#story_image_enabled").prop("checked", Boolean(globals.imagesEnabled));
  syncImageGlobalsCheckboxes($settingsPanel);
  updateImageSettingsVisibility($settingsPanel);
}

export function initImagesUI($settingsPanel) {
  refreshImageGlobalsUI($settingsPanel);

  const syncGlobals = () => {
    const globals = getImageGlobals();
    globals.sendCharCard = $settingsPanel.find("#story_image_send_char").prop("checked");
    globals.sendUserCard = $settingsPanel.find("#story_image_send_user").prop("checked");
    globals.sendLorebook = $settingsPanel.find("#story_image_send_lorebook").prop("checked");
    saveSettings();
  };

  $settingsPanel
    .find("#story_image_send_char, #story_image_send_user, #story_image_send_lorebook")
    .off("change.storyManagerImageGlobals")
    .on("change.storyManagerImageGlobals", syncGlobals);

  updateImageSettingsVisibility($settingsPanel);
  bindPresetListHandlers($settingsPanel);
  void prepareImagePresetPopupUi();
  renderImagePresetsList();

  const activeId = getActiveImagePresetId();
  if (!activeId && getImagePresets().length) {
    setActiveImagePresetId(getImagePresets().find((p) => p.enabled)?.id || getImagePresets()[0].id);
  }
}

export function refreshImagesChatUI() {
  renderImagePresetsList();
}
