import { getContext } from "../../../../extensions.js";
import {
  clearMessageImageBlock,
  clearImagePocketForGeneration,
  hasStoredImageState,
  isImageStateCurrentForMes,
  isSwipeGenerationPlaceholder,
} from "./image-pocket.js";
import { isImagesEnabled, getActiveImagePreset } from "./image-presets.js";
import { generateImageBlock } from "./generators/image-block.js";
import {
  GENERATION_TYPE,
  isGenerationTypeInProgress,
  tryStartGeneration,
  finishGeneration,
} from "./generation-state.js";
import { toastImageError, toastImageStart } from "./ui/toasts.js";

/** Не автогенерим блок: стриминг, правка сообщения и т.п. */
const SKIP_AUTO_IMAGE_RENDER_TYPES = new Set(["append", "continue", "edit"]);

export function cancelPendingAutoImageBlockGeneration() {
  clearTimeout(autoImageTimer);
  autoImageTimer = null;
  pendingAutoMesId = null;
  pendingAutoRenderType = null;
}

let autoImageTimer = null;
let pendingAutoMesId = null;
let pendingAutoRenderType = null;

export function isAutoImageGenerationInProgress() {
  return isGenerationTypeInProgress(GENERATION_TYPE.IMAGE_AUTO);
}

export function canAutoGenerateImageBlock(mesId, renderType) {
  if (!isImagesEnabled() || !getActiveImagePreset()) {
    return false;
  }

  if (renderType && SKIP_AUTO_IMAGE_RENDER_TYPES.has(renderType)) {
    return false;
  }

  const context = getContext();
  const chat = context?.chat;
  if (!Array.isArray(chat) || chat.length === 0) {
    return false;
  }

  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0 || safeId >= chat.length) {
    return false;
  }

  const message = chat[safeId];
  if (!message || message.is_user) {
    return false;
  }

  if (safeId !== chat.length - 1) {
    return false;
  }

  if (isImageStateCurrentForMes(message)) {
    return false;
  }

  const prev = chat[safeId - 1];
  if (!prev?.is_user) {
    return false;
  }

  return true;
}

/**
 * Отложенный автоген — после стриминга/свайпа, когда mes и extra уже финальные.
 */
export function scheduleAutoImageBlockGeneration(mesId, renderType) {
  pendingAutoMesId = mesId;
  // В стриминге ждём финальное состояние сообщения.
  pendingAutoRenderType =
    renderType && SKIP_AUTO_IMAGE_RENDER_TYPES.has(renderType) ? null : renderType;

  clearTimeout(autoImageTimer);
  autoImageTimer = setTimeout(() => {
    autoImageTimer = null;
    const id = pendingAutoMesId;
    const type = pendingAutoRenderType;
    pendingAutoMesId = null;
    pendingAutoRenderType = null;
    void runAutoImageBlockGeneration(id, type);
  }, 350);
}

export async function runAutoImageBlockGeneration(mesId, renderType) {
  const context = getContext();
  const chat = context?.chat;
  const safeId = Number.parseInt(mesId, 10);
  const message =
    Array.isArray(chat) && Number.isInteger(safeId) ? chat[safeId] : null;

  if (!canAutoGenerateImageBlock(mesId, renderType)) {
    return null;
  }

  const generationToken = tryStartGeneration({
    type: GENERATION_TYPE.IMAGE_AUTO,
    owner: "image-actions.runAutoImageBlockGeneration",
  });
  if (!generationToken) {
    return null;
  }

  if (message && isSwipeGenerationPlaceholder(message, safeId)) {
    clearImagePocketForGeneration(message);
  } else if (
    message?.extra &&
    hasStoredImageState(message) &&
    !isImageStateCurrentForMes(message)
  ) {
    clearMessageImageBlock(message);
  }

  const { lockAllButtons, unlockAllButtons } = await import("./buttons.js");

  lockAllButtons();

  try {
    toastImageStart();
    return await generateImageBlock(mesId);
  } catch (err) {
    console.error("Story Manager: auto image block generation failed", err);
    toastImageError("Не удалось добавить визуал в сообщение.", err);
    return null;
  } finally {
    unlockAllButtons();
    finishGeneration(generationToken);
  }
}
