import { fmt, UI } from "./ui-text.js";
import { toastInfo } from "./ui/toasts.js";

export const GENERATION_TYPE = Object.freeze({
  NOTE: "note",
  CHARACTER: "character",
  LOCATION: "location",
  IMAGE_MANUAL: "image-manual",
  IMAGE_AUTO: "image-auto",
  SUMMARY: "summary",
  SUMMARY_REBUILD: "summary-rebuild",
  SUMMARY_FILL_GAPS: "summary-fill-gaps",
});

/** @deprecated Импортируйте UI.generation.busy из ui-text.js */
export const GENERATION_BUSY_MESSAGE = UI.generation.busy;

const GENERATION_TYPE_LABELS = Object.freeze({
  [GENERATION_TYPE.NOTE]: UI.generation.typeLabels.note,
  [GENERATION_TYPE.CHARACTER]: UI.generation.typeLabels.character,
  [GENERATION_TYPE.LOCATION]: UI.generation.typeLabels.location,
  [GENERATION_TYPE.IMAGE_MANUAL]: UI.generation.typeLabels.imageManual,
  [GENERATION_TYPE.IMAGE_AUTO]: UI.generation.typeLabels.imageAuto,
  [GENERATION_TYPE.SUMMARY]: UI.generation.typeLabels.summary,
  [GENERATION_TYPE.SUMMARY_REBUILD]: UI.generation.typeLabels.summaryRebuild,
  [GENERATION_TYPE.SUMMARY_FILL_GAPS]: UI.generation.typeLabels.summaryFillGaps,
});

let activeGeneration = null;

/**
 * @returns {null | { token: symbol, type: string, owner: string, startedAt: number }}
 */
export function getGenerationState() {
  return activeGeneration;
}

export function isGenerationInProgress() {
  return activeGeneration !== null;
}

export function isGenerationTypeInProgress(type) {
  return activeGeneration?.type === type;
}

export function getActiveGenerationTypeLabel() {
  if (!activeGeneration) {
    return null;
  }

  return (
    GENERATION_TYPE_LABELS[activeGeneration.type] || UI.generation.fallbackTypeLabel
  );
}

export function getGenerationBusyMessage() {
  return GENERATION_BUSY_MESSAGE;
}

export function getGenerationBusyTooltip() {
  const label = getActiveGenerationTypeLabel();
  return label ? fmt.generationBusyTooltip(label) : "";
}

export function showGenerationBusyToast() {
  toastInfo(GENERATION_BUSY_MESSAGE);
}

/**
 * @param {{ type: string, owner?: string }} params
 * @returns {symbol | null}
 */
export function tryStartGeneration(params) {
  if (activeGeneration) {
    return null;
  }

  const token = Symbol("story-manager-generation-lock");
  activeGeneration = {
    token,
    type: params.type,
    owner: params.owner || "unknown",
    startedAt: Date.now(),
  };
  return token;
}

export function finishGeneration(token) {
  if (!activeGeneration) {
    return;
  }

  if (activeGeneration.token !== token) {
    return;
  }

  activeGeneration = null;
}

export function forceResetGenerationState() {
  activeGeneration = null;
}
