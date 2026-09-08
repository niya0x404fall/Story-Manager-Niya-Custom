import { getContext } from "../../../../../extensions.js";
import { removeReasoningFromString } from "../../../../../reasoning.js";
import { getSettings } from "../settings.js";
import { generateQuietWithProfile } from "../profiles.js";
import {
  withGenerationTimeout,
  GENERATION_TIMEOUT_ERROR_MESSAGE,
} from "../generation-timeout.js";
import {
  createEntity,
  getEntities,
  getNextEntityId,
  setEntities,
  updateEntity,
} from "../entities.js";
import {
  CHUNK_TYPE,
  formatChunkTitle,
  getCompressionBackupChunks,
  isSummaryPlaceholderChunk,
  getCombinedChunkText,
  getNextVisibleChunkRange,
  getSortedSummaryChunks,
  rollbackCompression,
  setCompressionBackup,
  syncSummaryStateWithChat,
} from "../summary-chunks.js";
import { getChunkCoverageRanges } from "../summary-integrity.js";
import {
  SUMMARY_SOURCE_MODE,
  assertSummarySourcesUnchanged,
  captureSelectedSummarySources,
  combineSummarySources,
  formatSelectedSummaryMessages,
  selectSummarySources,
} from "../summary-sources.js";
import { reconcileSummaryHistory } from "../summary-history.js";

export { rollbackCompression };

function reconcileBeforeSummaryOperation() {
  const context = getContext();
  reconcileSummaryHistory();
  syncSummaryStateWithChat(context?.chat?.length || 0, { auditSources: true });
}

function chunkRevision(chunk) {
  if (!chunk) return null;
  // Переключение контекста не меняет текст, который пользователь пересобирает.
  const { enabled: _enabled, updatedAt: _updatedAt, ...content } = chunk;
  return JSON.stringify(content);
}

function assertChunkUnchanged(chunkId, revision) {
  const current = getEntities("summaryChunks").find((item) => item.id === chunkId);
  if (chunkRevision(current) !== revision) {
    throw new Error("Карточка изменилась или удалена во время запроса. Ответ не сохранён.");
  }
}

function assertSameChat(chatMetadataRef) {
  if (getContext().chatMetadata !== chatMetadataRef) {
    throw new Error("Активный чат сменился во время операции с саммари.");
  }
}

function buildGenerationPrompt({ previousText, formattedMessages, range, eventStartDate }) {
  let fullPrompt = "";

  if (previousText?.trim()) {
    fullPrompt += `### Existing Summary (continue from here):\n${previousText}\n\n`;
  }

  if (eventStartDate?.trim()) {
    fullPrompt += `Дата начала событий: ${eventStartDate.trim()}\n\n`;
  }

  fullPrompt += `### Messages ${formatChunkTitle(range.start, range.end)} to Summarize:\n${formattedMessages}`;
  return fullPrompt;
}

async function runSummaryGeneration(fullPrompt, { signal = null } = {}) {
  const settings = getSettings();
  const requestController = new AbortController();
  const forwardAbort = () => requestController.abort(signal?.reason);
  if (signal?.aborted) {
    forwardAbort();
  } else {
    signal?.addEventListener("abort", forwardAbort, { once: true });
  }

  const generationPromise = generateQuietWithProfile({
    prompt: fullPrompt,
    systemPrompt: settings.summaryPrompt,
    responseLength: 2000,
    signal: requestController.signal,
  }).then((rawResult) => removeReasoningFromString(rawResult).trim());
  const cancellablePromise = Promise.race([
    generationPromise,
    new Promise((_, reject) => {
      if (requestController.signal.aborted) {
        reject(new DOMException("Generation aborted", "AbortError"));
        return;
      }
      requestController.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Generation aborted", "AbortError")),
        { once: true },
      );
    }),
  ]);

  try {
    return await withGenerationTimeout(cancellablePromise, {
      errorMessage: GENERATION_TIMEOUT_ERROR_MESSAGE,
      onTimeout: () => requestController.abort("Story Manager summary timed out"),
    });
  } finally {
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function runSummaryCompression(sourceText) {
  const settings = getSettings();
  const requestController = new AbortController();
  return withGenerationTimeout(
    generateQuietWithProfile({
      prompt: sourceText,
      systemPrompt: settings.summaryCompressPrompt,
      responseLength: 2000,
      signal: requestController.signal,
    }).then((rawResult) => removeReasoningFromString(rawResult).trim()),
    {
      errorMessage: GENERATION_TIMEOUT_ERROR_MESSAGE,
      onTimeout: () => requestController.abort("Story Manager compression timed out"),
    },
  );
}

/**
 * Сгенерировать один кусок саммари для заданного диапазона сообщений.
 * @param {{ start: number, end: number }} range
 * @param {{ eventStartDate?: string | null, signal?: AbortSignal|null, shouldCommit?: (() => boolean) }} [options]
 */
export async function generateSummaryChunkForRange(range, options = {}) {
  reconcileBeforeSummaryOperation();
  const { eventStartDate, signal = null, shouldCommit } = options;
  const context = getContext();
  const chatMetadataRef = context.chatMetadata;
  const chatLog = context.chat;

  const start = Math.max(0, range.start);
  const end = Math.min(range.end, chatLog.length - 1);

  if (end < start) {
    throw new Error("Некорректный диапазон сообщений для саммари.");
  }

  const messagesToSummarize = Array.isArray(options.selectedMessages)
    ? options.selectedMessages.filter(({ messageId, message }) =>
      Number.isInteger(messageId) && messageId >= start && messageId <= end && message,
    )
    : selectSummarySources(
      chatLog, { startMes: start, endMes: end }, SUMMARY_SOURCE_MODE.VISIBLE,
    );
  const formattedMessages = formatSelectedSummaryMessages(messagesToSummarize);
  if (!formattedMessages.trim()) {
    return null;
  }
  const sourceSelection = captureSelectedSummarySources(messagesToSummarize);
  const staleExactChunk = getEntities("summaryChunks").find(
    (chunk) => chunk.type === CHUNK_TYPE.CHUNK && chunk.contextValid === false &&
      chunk.startMes === start && chunk.endMes === end,
  );
  const staleRevision = chunkRevision(staleExactChunk);

  const previousText = getCombinedChunkText(
    getSortedSummaryChunks().filter((chunk) => chunk.endMes < start),
  );

  const result = await runSummaryGeneration(
    buildGenerationPrompt({
      previousText,
      formattedMessages,
      range: { start, end },
      eventStartDate,
    }),
    { signal },
  );

  if (signal?.aborted) {
    throw new DOMException("Generation aborted", "AbortError");
  }
  if (typeof shouldCommit === "function" && !shouldCommit()) {
    throw new DOMException("Automatic summary was disabled", "AbortError");
  }
  if (!result) {
    throw new Error("Модель вернула пустое саммари.");
  }

  assertSameChat(chatMetadataRef);
  assertSummarySourcesUnchanged(getContext().chat, messagesToSummarize, sourceSelection);

  if (staleExactChunk) {
    assertChunkUnchanged(staleExactChunk.id, staleRevision);
    updateEntity("summaryChunks", staleExactChunk.id, {
      text: result,
      contextValid: true,
      sourceUnavailable: false,
      ...sourceSelection,
    });
  } else {
    createEntity("summaryChunks", {
      type: CHUNK_TYPE.CHUNK,
      startMes: start,
      endMes: end,
      text: result,
      contextValid: true,
      ...sourceSelection,
    });
  }
  return result;
}

/**
 * @param {{ forcePartial?: boolean, signal?: AbortSignal|null, range?: {start:number,end:number}, selectedMessages?: Array<{messageId:number,message:object}> }} [options]
 */
export async function generateSummaryChunk(options = {}) {
  const context = getContext();
  const interval = getSettings().summaryInterval;
  const range = options.range || getNextVisibleChunkRange(interval, context.chat, {
    forcePartial: Boolean(options.forcePartial),
  });

  if (!range) {
    return null;
  }

  return generateSummaryChunkForRange(range, {
    signal: options.signal ?? null,
    shouldCommit: options.shouldCommit,
    selectedMessages: options.selectedMessages,
  });
}

export async function regenerateSummaryChunk(chunkId, { sourceMode } = {}) {
  reconcileBeforeSummaryOperation();
  const context = getContext();
  const chatMetadataRef = context.chatMetadata;
  const chunk = getEntities("summaryChunks").find((item) => item.id === chunkId);

  if (!chunk || isSummaryPlaceholderChunk(chunk)) {
    throw new Error("Эту карточку нельзя перегенерировать.");
  }
  const revision = chunkRevision(chunk);

  if (chunk.sourceUnavailable) {
    throw new Error(
      "Исходные сообщения этой карточки удалены. Исправьте текст вручную или удалите карточку.",
    );
  }

  if (chunk.type === CHUNK_TYPE.COMPRESSED) {
    if (chunk.contextValid === false) {
      throw new Error(
        "Сжатая карточка устарела. Отмените сокращение и перегенерируйте исходные карточки либо исправьте её вручную.",
      );
    }
    const sourceRanges = Array.isArray(chunk.sourceRanges) && chunk.sourceRanges.length
      ? chunk.sourceRanges
      : [{ start: chunk.startMes, end: chunk.endMes }];
    const backupChunks = getCompressionBackupChunks()
      .filter(
        (candidate) =>
          !isSummaryPlaceholderChunk(candidate) &&
          sourceRanges.some(
            (range) =>
              candidate.startMes >= range.start && candidate.endMes <= range.end,
          ),
      )
      .sort((a, b) => a.startMes - b.startMes);
    const backupText = getCombinedChunkText(backupChunks);
    const sourceText = String(chunk.sourceText || backupText || chunk.text || "").trim();
    if (!sourceText) {
      throw new Error("В сжатой карточке нет текста для повторного сокращения.");
    }

    const result = await runSummaryCompression(sourceText);
    if (!result) throw new Error("Модель вернула пустое саммари.");
    assertSameChat(chatMetadataRef);
    reconcileBeforeSummaryOperation();
    assertChunkUnchanged(chunkId, revision);
    updateEntity("summaryChunks", chunkId, {
      text: result,
      contextValid: true,
      sourceUnavailable: false,
    });
    return result;
  }

  if (chunk.type !== CHUNK_TYPE.CHUNK) {
    throw new Error("Эту карточку нельзя перегенерировать.");
  }

  const chatLog = context.chat;
  const start = Math.max(0, chunk.startMes);
  const end = Math.min(chunk.endMes, chatLog.length - 1);

  if (end < start) {
    throw new Error("Диапазон сообщений больше не совпадает с историей чата.");
  }

  const messagesToSummarize = selectSummarySources(chatLog, chunk, sourceMode);
  const formattedMessages = formatSelectedSummaryMessages(messagesToSummarize);

  if (!formattedMessages.trim()) {
    throw new Error("В выбранном наборе нет сообщений. Запрос не отправлен; карточка сохранена.");
  }
  const sourceSelection = captureSelectedSummarySources(messagesToSummarize);

  const previousText = getCombinedChunkText(
    getSortedSummaryChunks().filter((candidate) => candidate.endMes < start),
  );

  const result = await runSummaryGeneration(
    buildGenerationPrompt({
      previousText,
      formattedMessages,
      range: { start, end },
    }),
  );

  assertSameChat(chatMetadataRef);
  assertSummarySourcesUnchanged(getContext().chat, messagesToSummarize, sourceSelection);
  assertChunkUnchanged(chunkId, revision);
  if (!result) throw new Error("Модель вернула пустое саммари.");

  updateEntity("summaryChunks", chunkId, {
    text: result,
    contextValid: true,
    sourceUnavailable: false,
    ...sourceSelection,
  });
  return result;
}

export async function compressSummary(chunkIds = []) {
  reconcileBeforeSummaryOperation();
  const context = getContext();
  const chatMetadataRef = context.chatMetadata;
  const selectedIds = new Set(
    chunkIds.map((id) => Number.parseInt(id, 10)).filter(Number.isInteger),
  );
  const chunks = getSortedSummaryChunks().filter(
    (chunk) =>
      selectedIds.has(chunk.id) &&
      !isSummaryPlaceholderChunk(chunk) &&
      chunk.contextValid !== false &&
      !chunk.sourceUnavailable &&
      chunk.text,
  );

  if (chunks.length === 0) {
    throw new Error("Выберите хотя бы одну карточку для сокращения.");
  }

  // Отбор для сокращения независим от галочки вставки в контекст.
  const combinedText = getCombinedChunkText(chunks.map((chunk) => ({ ...chunk, enabled: true })));
  const sourceRanges = chunks.flatMap((chunk) => getChunkCoverageRanges(chunk));
  const sourceSelection = combineSummarySources(context.chat, chunks);
  const revisions = chunks.map((chunk) => [chunk.id, chunkRevision(chunk)]);
  const result = await runSummaryCompression(combinedText);

  assertSameChat(chatMetadataRef);
  reconcileBeforeSummaryOperation();
  for (const [id, revision] of revisions) assertChunkUnchanged(id, revision);
  if (!result) throw new Error("Модель вернула пустое саммари.");

  const startMes = Math.min(...sourceRanges.map((range) => range.start));
  const endMes = Math.max(...sourceRanges.map((range) => range.end));
  const now = Date.now();
  const compressedChunk = {
    id: getNextEntityId("summaryChunks"),
    type: CHUNK_TYPE.COMPRESSED,
    startMes,
    endMes,
    sourceRanges,
    sourceText: combinedText,
    ...sourceSelection,
    text: result,
    enabled: true,
    contextValid: chunks.every((chunk) => chunk.contextValid !== false),
    createdAt: now,
    updatedAt: now,
  };
  setCompressionBackup(chunks, compressedChunk.id);
  const allChunks = getEntities("summaryChunks");
  setEntities("summaryChunks", [
    ...allChunks.filter((chunk) => !chunks.some((selected) => selected.id === chunk.id)),
    compressedChunk,
  ]);
  return result;
}
