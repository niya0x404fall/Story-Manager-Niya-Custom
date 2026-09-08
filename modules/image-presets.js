import { getSettings, saveSettings, mergeImageGlobals } from "./settings.js";
import { createDefaultImagePreset } from "./image-defaults.js";
import {
  getPresetInstruction,
  normalizeImagePresetForStorage,
} from "./image-preset.js";
import { saveChatMetadata } from "./storage.js";

function migratePresetsIfNeeded(presets) {
  let dirty = false;
  const next = presets.map((preset) => {
    if (!preset?.prompt && !preset?.htmlTemplate) {
      return preset;
    }
    dirty = true;
    return normalizeImagePresetForStorage(preset);
  });
  return dirty ? next : presets;
}

export function getImageGlobals() {
  const settings = getSettings();

  if (!settings.imageGlobals || typeof settings.imageGlobals !== "object") {
    settings.imageGlobals = mergeImageGlobals({});
  } else {
    mergeImageGlobals(settings.imageGlobals);
  }

  return settings.imageGlobals;
}

export function isImagesEnabled() {
  return Boolean(getImageGlobals().imagesEnabled);
}

export function getImagePresets() {
  const settings = getSettings();
  if (!Array.isArray(settings.imagePresets)) {
    settings.imagePresets = [createDefaultImagePreset()];
  }
  if (settings.imagePresets.length === 0) {
    settings.imagePresets.push(createDefaultImagePreset());
  }

  const migrated = migratePresetsIfNeeded(settings.imagePresets);
  if (migrated !== settings.imagePresets) {
    settings.imagePresets = migrated;
    saveSettings();
  }

  return settings.imagePresets;
}

export function getImagePresetById(presetId) {
  return getImagePresets().find((preset) => preset.id === presetId) || null;
}

export function getActiveImagePreset() {
  const all = getImagePresets();
  const enabled = all.filter((preset) => preset.enabled !== false);
  const activeId = getActiveImagePresetId();

  if (activeId) {
    const active = enabled.find((preset) => preset.id === activeId);
    if (active) {
      return active;
    }
  }

  if (enabled.length > 0) {
    const fallback = enabled[0];
    setActiveImagePresetId(fallback.id);
    return fallback;
  }

  return null;
}

export function saveImagePresets(presets) {
  getSettings().imagePresets = presets.map(normalizeImagePresetForStorage);
  saveSettings();
}

export function upsertImagePreset(preset) {
  const presets = getImagePresets();
  const index = presets.findIndex((item) => item.id === preset.id);
  const next = normalizeImagePresetForStorage({
    ...preset,
    updatedAt: Date.now(),
  });

  if (index === -1) {
    presets.push(next);
  } else {
    presets[index] = { ...presets[index], ...next };
  }

  saveImagePresets(presets);
  return next;
}

export { getPresetInstruction };

export function deleteImagePreset(presetId) {
  const presets = getImagePresets().filter((preset) => preset.id !== presetId);
  saveImagePresets(presets.length ? presets : [createDefaultImagePreset()]);
}

/**
 * Вкл/выкл пресета. Если пресетов несколько и включаем один — остальные выключаются.
 */
export function setImagePresetEnabled(presetId, enabled) {
  const presets = getImagePresets();
  const target = presets.find((preset) => preset.id === presetId);
  if (!target) {
    return;
  }

  if (presets.length <= 1) {
    target.enabled = enabled;
    saveImagePresets(presets);
    return;
  }

  if (enabled) {
    for (const preset of presets) {
      preset.enabled = preset.id === presetId;
    }
    saveImagePresets(presets);
    setActiveImagePresetId(presetId);
    return;
  }

  target.enabled = false;
  saveImagePresets(presets);
}

export function getActiveImagePresetId() {
  const context = SillyTavern.getContext();
  return context?.chatMetadata?.["story-manager-image-state"]?.activePresetId || "";
}

export function setActiveImagePresetId(presetId) {
  const context = SillyTavern.getContext();
  if (!context?.chatMetadata) {
    return;
  }

  if (!context.chatMetadata["story-manager-image-state"]) {
    context.chatMetadata["story-manager-image-state"] = {};
  }

  context.chatMetadata["story-manager-image-state"].activePresetId = presetId || "";
  saveChatMetadata();
}
