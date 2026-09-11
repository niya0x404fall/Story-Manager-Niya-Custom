import {
  generateSummaryChunk,
  generateSummaryChunkForRange,
} from "./generators/summary.js";
import { renderSummary } from "./ui/summary.js";
import { injectAllEntities } from "./injection.js";
import {
  clearCompressionBackup,
  getPendingVisibleMessageCount,
  getUncoveredVisibleRangeBefore,
  getSummaryFillGapsPlan,
  getSummaryRebuildPlan,
  resetSummaryAnchorMes,
} from "./summary-chunks.js";
import { getSettings } from "./settings.js";
import { UI } from "./ui-text.js";
import { createEntity, deleteEntity, setEntities, updateEntity } from "./entities.js";
import { getContext } from "../../../../extensions.js";
import { hasBuiltinSummarizeText, getBuiltinSummarizeText } from "./builtin-summary-import.js";
import {
  CHUNK_TYPE,
  captureCurrentSummaryChunkSourceStates,
  getSortedSummaryChunks,
  isSummaryPlaceholderChunk,
} from "./summary-chunks.js";
import { SUMMARY_CHUNK_MAX_RETRIES } from "./generation-timeout.js";
import {
  GENERATION_TYPE,
  finishGeneration,
  getGenerationBusyMessage,
  isGenerationTypeInProgress,
  tryStartGeneration,
} from "./generation-state.js";
import {
  beginSummaryBatchCancellation,
  endSummaryBatchCancellation,
  getSummaryBatchSignal,
  isSummaryStopRequested,
  requestSummaryStop,
} from "./summary-cancellation.js";

export function isSummaryGenerationInProgress() {
  return (
    isGenerationTypeInProgress(GENERATION_TYPE.SUMMARY) ||
    isGenerationTypeInProgress(GENERATION_TYPE.SUMMARY_REBUILD) ||
    isGenerationTypeInProgress(GENERATION_TYPE.SUMMARY_FILL_GAPS)
  );
}

async function generateSummaryChunkWithRetries(
  range,
  { onAttemptStart, onAttemptEnd, eventStartDate } = {},
) {
  let lastError = null;

  for (let attempt = 1; attempt <= SUMMARY_CHUNK_MAX_RETRIES; attempt++) {
    if (isSummaryStopRequested()) {
      return null;
    }

    onAttemptStart?.(attempt, SUMMARY_CHUNK_MAX_RETRIES);

    try {
      const result = await generateSummaryChunkForRange(range, {
        eventStartDate,
        signal: getSummaryBatchSignal(),
      });
      if (result === null) {
        throw new Error(
          `Нет текста для сообщений ${range.start}–${range.end}.`,
        );
      }
      onAttemptEnd?.();
      return result;
    } catch (err) {
      lastError = err;
      onAttemptEnd?.();
      if (isSummaryStopRequested() || err?.name === "AbortError") {
        return null;
      }
    }
  }

  throw lastError || new Error("Не удалось сгенерировать кусок саммари.");
}

/**
 * @param {Array<{ start: number, end: number }>} plan
 * @param {{ onProgress?: (done: number, total: number) => void, onChunkComplete?: () => void | Promise<void>, onAttemptStart?: (attempt: number, maxAttempts: number) => void, onAttemptEnd?: () => void }} [callbacks]
 * @param {{ eventStartDate?: string | null }} [options]
 */
async function runSummaryPlan(plan, callbacks = {}, options = {}) {
  const { onProgress, onChunkComplete, onAttemptStart, onAttemptEnd } = callbacks;
  const { eventStartDate } = options;
  const total = plan.length;

  onProgress?.(0, total);

  let completed = 0;

  for (let index = 0; index < plan.length; index++) {
    if (isSummaryStopRequested()) {
      return { completed, stopped: true };
    }

    const range = plan[index];

    try {
      const result = await generateSummaryChunkWithRetries(range, {
        onAttemptStart,
        onAttemptEnd,
        eventStartDate: index === 0 ? eventStartDate : undefined,
      });
      if (result === null && isSummaryStopRequested()) {
        return { completed, stopped: true };
      }
    } catch (err) {
      console.error(
        `Story Manager: Summary aborted at messages ${range.start}–${range.end}`,
        err,
      );
      throw new Error(UI.summary.aborted);
    }

    if (onChunkComplete) {
      await onChunkComplete();
    }

    completed = index + 1;
    onProgress?.(completed, total);
  }

  return { completed, stopped: false };
}

export function requestSummaryGenerationStop() {
  return requestSummaryStop();
}

export async function runSummaryChunkGeneration(options = {}) {
  const {
    cancellable = false,
    forcePartial = false,
    range,
    selectedMessages,
    shouldCommit,
    onProgress,
    onAttemptStart,
    onAttemptEnd,
    onStopped,
  } = options;
  const generationToken = tryStartGeneration({
    type: GENERATION_TYPE.SUMMARY,
    owner: "summary-actions.runSummaryChunkGeneration",
  });
  if (!generationToken) {
    return null;
  }

  let buttonControls = null;
  let attemptStarted = false;

  if (cancellable) {
    beginSummaryBatchCancellation();
  }

  try {
    onProgress?.(0, 1);
    buttonControls = await import("./buttons.js");
    buttonControls.lockAllButtons();
    buttonControls.setSummaryGenerating(true);

    onAttemptStart?.(1, 1);
    attemptStarted = true;

    const result = await generateSummaryChunk({
      forcePartial,
      range,
      selectedMessages,
      signal: cancellable ? getSummaryBatchSignal() : null,
      shouldCommit,
    });
    if (result !== null) {
      await renderSummary();
      injectAllEntities();
      onProgress?.(1, 1);
    }
    buttonControls.updateSummaryIndicators();
    return result;
  } catch (err) {
    if (
      cancellable &&
      (isSummaryStopRequested() || err?.name === "AbortError")
    ) {
      onStopped?.();
      return null;
    }
    throw err;
  } finally {
    if (attemptStarted) {
      onAttemptEnd?.();
    }
    if (cancellable) {
      endSummaryBatchCancellation();
    }
    buttonControls?.setSummaryGenerating(false);
    buttonControls?.unlockAllButtons();
    finishGeneration(generationToken);
  }
}

/** Создать одну карточку по точному пользовательскому диапазону сообщений. */
export async function runManualSummaryRange(
  startMes,
  endMes,
  { allowPrecedingGap = false } = {},
) {
  const context = getContext();
  const chatLength = context?.chat?.length || 0;
  const start = Number.parseInt(startMes, 10);
  const end = Number.parseInt(endMes, 10);

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error("Укажите начало и конец диапазона числами.");
  }
  if (start < 0 || end < start || end >= chatLength) {
    throw new Error(`Допустимый диапазон: 0–${Math.max(0, chatLength - 1)}.`);
  }

  const precedingGap = getUncoveredVisibleRangeBefore(start, context.chat);
  if (precedingGap && !allowPrecedingGap) {
    throw new Error(
      `Перед диапазоном остались непокрытые видимые сообщения ${precedingGap.start}–${precedingGap.end}. Подтвердите создание ещё раз.`,
    );
  }

  const generationToken = tryStartGeneration({
    type: GENERATION_TYPE.SUMMARY,
    owner: "summary-actions.runManualSummaryRange",
  });
  if (!generationToken) {
    throw new Error(getGenerationBusyMessage());
  }

  const { lockAllButtons, setSummaryGenerating, updateSummaryIndicators, unlockAllButtons } =
    await import("./buttons.js");
  lockAllButtons();
  setSummaryGenerating(true);

  try {
    const result = await generateSummaryChunkForRange({ start, end });
    if (result === null) {
      throw new Error("В выбранном диапазоне нет видимых сообщений.");
    }
    await renderSummary();
    injectAllEntities();
    updateSummaryIndicators();
    return result;
  } finally {
    setSummaryGenerating(false);
    unlockAllButtons();
    finishGeneration(generationToken);
  }
}

export function canGenerateSummaryChunk() {
  const context = SillyTavern.getContext();
  const interval = getSettings().summaryInterval;
  return getPendingVisibleMessageCount(context?.chat || []) >= interval;
}

export function getSummaryPendingCount() {
  return getPendingVisibleMessageCount(SillyTavern.getContext()?.chat || []);
}

/**
 * Удаляет все карточки и генерирует саммари по всей истории чата заново.
 * @param {{ onProgress?: (done: number, total: number) => void, onChunkComplete?: () => void | Promise<void> }} [callbacks]
 * @param {{ eventStartDate?: string | null }} [options]
 */
export async function rebuildSummaryFromScratch(callbacks = {}, options = {}) {
  const context = getContext();
  const chatLength = context?.chat?.length || 0;

  if (!chatLength) {
    throw new Error("В чате нет сообщений для саммари.");
  }

  const interval = getSettings().summaryInterval;
  const plan = getSummaryRebuildPlan(chatLength, interval);

  if (plan.length === 0) {
    throw new Error("Не удалось составить план генерации саммари.");
  }

  const generationToken = tryStartGeneration({
    type: GENERATION_TYPE.SUMMARY_REBUILD,
    owner: "summary-actions.rebuildSummaryFromScratch",
  });
  if (!generationToken) {
    throw new Error(getGenerationBusyMessage());
  }

  const { lockAllButtons, setSummaryGenerating, updateSummaryIndicators, unlockAllButtons } =
    await import("./buttons.js");
  lockAllButtons();
  setSummaryGenerating(true);

  try {
    beginSummaryBatchCancellation();
    setEntities("summaryChunks", []);
    clearCompressionBackup();
    resetSummaryAnchorMes(0);

    const result = await runSummaryPlan(plan, callbacks, {
      eventStartDate: options.eventStartDate ?? null,
    });

    injectAllEntities();
    updateSummaryIndicators();
    return result;
  } finally {
    endSummaryBatchCancellation();
    setSummaryGenerating(false);
    unlockAllButtons();
    finishGeneration(generationToken);
  }
}

/**
 * Сгенерировать саммари для всех непокрытых участков истории.
 * @param {{ onProgress?: (done: number, total: number) => void, onChunkComplete?: () => void | Promise<void>, onAttemptStart?: (attempt: number, maxAttempts: number) => void, onAttemptEnd?: () => void }} [callbacks]
 */
export async function fillSummaryGaps(callbacks = {}) {
  const context = getContext();
  const chatLength = context?.chat?.length || 0;

  if (!chatLength) {
    throw new Error("В чате нет сообщений для саммари.");
  }

  const interval = getSettings().summaryInterval;
  const plan = getSummaryFillGapsPlan(chatLength, interval);

  if (plan.length === 0) {
    throw new Error("Пробелов нет — вся история уже покрыта карточками.");
  }

  const generationToken = tryStartGeneration({
    type: GENERATION_TYPE.SUMMARY_FILL_GAPS,
    owner: "summary-actions.fillSummaryGaps",
  });
  if (!generationToken) {
    throw new Error(getGenerationBusyMessage());
  }

  const { lockAllButtons, setSummaryGenerating, updateSummaryIndicators, unlockAllButtons } =
    await import("./buttons.js");
  lockAllButtons();
  setSummaryGenerating(true);

  try {
    beginSummaryBatchCancellation();
    const result = await runSummaryPlan(plan, callbacks);
    injectAllEntities();
    updateSummaryIndicators();
    return result;
  } finally {
    endSummaryBatchCancellation();
    setSummaryGenerating(false);
    unlockAllButtons();
    finishGeneration(generationToken);
  }
}

/**
 * Импорт саммари из встроенного Summarize как одна карточка 0 … конец чата.
 */
export async function importBuiltinSummaryAsChunk() {
  const context = getContext();
  const chatLength = context?.chat?.length || 0;

  if (!chatLength) {
    throw new Error("В чате нет сообщений.");
  }

  if (!hasBuiltinSummarizeText()) {
    throw new Error(
      "Встроенное саммари не найдено. Заполните Summarize в чате или сгенерируйте его там.",
    );
  }

  const text = getBuiltinSummarizeText();
  const endMes = chatLength - 1;
  const chunks = getSortedSummaryChunks().filter((chunk) => !isSummaryPlaceholderChunk(chunk));
  const placeholder = getSortedSummaryChunks().find((chunk) => isSummaryPlaceholderChunk(chunk));
  const existing = chunks.find((chunk) => chunk.startMes === 0 && chunk.endMes === endMes);
  const sourceMessageStates = captureCurrentSummaryChunkSourceStates({
    startMes: 0,
    endMes,
  });

  if (placeholder) {
    deleteEntity("summaryChunks", placeholder.id);
  }

  if (existing) {
    updateEntity("summaryChunks", existing.id, {
      text,
      type: CHUNK_TYPE.CHUNK,
      contextValid: true,
      sourceUnavailable: false,
      sourceMessageStates,
    });
    return { updated: true, startMes: 0, endMes };
  }

  createEntity("summaryChunks", {
    type: CHUNK_TYPE.CHUNK,
    startMes: 0,
    endMes,
    text,
    contextValid: true,
    sourceMessageStates,
  });

  return { updated: false, startMes: 0, endMes };
}

export { hasBuiltinSummarizeText };
