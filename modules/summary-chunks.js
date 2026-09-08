import { getContext } from "../../../../extensions.js";
import { createEntity, getEntities, setEntities } from "./entities.js";
import { getSettings } from "./settings.js";
import { saveChatMetadata } from "./storage.js";
import {
  captureSummarySourceMessageStates,
  findSummaryRangeOverlaps,
  getChunkCoverageRanges,
  hasExactSummarySources,
  getSummaryPlaceholderEndAfterResize,
  isSummaryChunkContextUsable,
  isSummarySourceStateCurrent,
  reindexSummaryBoundaryAfterDeletions,
  reindexSummaryChunkAfterDeletions,
  summaryChunkCoversMessage,
} from "./summary-integrity.js";

export const SUMMARY_STATE_KEY = "story-manager-summary-state";

export const CHUNK_TYPE = Object.freeze({
  CHUNK: "chunk",
  COMPRESSED: "compressed",
  /** Пустая карточка для неразмеченной истории. */
  PLACEHOLDER: "placeholder",
});

export function isSummaryPlaceholderChunk(chunk) {
  return chunk?.type === CHUNK_TYPE.PLACEHOLDER;
}

function getSummaryState() {
  const context = getContext();
  if (!context?.chatMetadata) {
    return { compressionBackup: null };
  }

  if (!context.chatMetadata[SUMMARY_STATE_KEY]) {
    context.chatMetadata[SUMMARY_STATE_KEY] = {
      compressionBackup: null,
      lastKnownChatLength: 0,
      /** Индекс первого неучтённого сообщения. */
      summaryAnchorMes: 0,
      /** Чат уже прошёл первичную инициализацию. */
      summaryChatInitialized: false,
    };
  }

  const state = context.chatMetadata[SUMMARY_STATE_KEY];
  if (!Number.isInteger(state.summaryAnchorMes)) {
    state.summaryAnchorMes = 0;
  }
  if (typeof state.summaryChatInitialized !== "boolean") {
    state.summaryChatInitialized = Boolean(
      state.summaryHistoryAdopted || state.summaryTrackingStart != null,
    );
  }

  return context.chatMetadata[SUMMARY_STATE_KEY];
}

function createPlaceholderChunk(startMes, endMes) {
  createEntity("summaryChunks", {
    type: CHUNK_TYPE.PLACEHOLDER,
    startMes,
    endMes,
    text: "",
    contextValid: true,
  });
}

function clampPlaceholderEndMes(chatLength) {
  if (!chatLength) {
    return;
  }

  const chunks = getEntities("summaryChunks");
  const placeholder = chunks.find((chunk) => isSummaryPlaceholderChunk(chunk));
  if (!placeholder) {
    return;
  }

  const newEnd = getSummaryPlaceholderEndAfterResize(
    placeholder.endMes,
    chatLength,
  );
  // Заглушка отмечает только историю, которая уже существовала при первом
  // запуске Story Manager. Расширять её на новые сообщения нельзя: иначе
  // pending всегда остаётся равным нулю и автосаммари никогда не срабатывает.
  // Уменьшение оставляем для случая, когда история стала короче вне текущей
  // сессии и событие удаления не успело перенумеровать карточки.
  if (placeholder.endMes === newEnd) {
    return;
  }

  placeholder.endMes = newEnd;
  placeholder.contextValid = true;
  const context = getContext();
  if (context?.chatMetadata) {
    context.chatMetadata["story-manager-summary-chunks"] = chunks;
    saveSummaryState();
  }
}

/** Инициализировать якорь и заглушку при открытии чата. */
export function ensureSummaryBootstrap(chatLength = getContext()?.chat?.length || 0) {
  migrateLegacySummary();

  const chunks = getEntities("summaryChunks");
  if (chunks.length > 0) {
    clampPlaceholderEndMes(chatLength);
    return;
  }

  const state = getSummaryState();

  if (!state.summaryChatInitialized) {
    state.summaryChatInitialized = true;

    if (chatLength === 0) {
      state.summaryAnchorMes = 0;
      saveSummaryState();
      return;
    }

    createPlaceholderChunk(0, chatLength - 1);
    saveSummaryState();
    return;
  }

  if (
    chatLength > 0 &&
    !state.legacyPlaceholderMigrated &&
    (state.summaryHistoryAdopted || state.summaryTrackingStart != null)
  ) {
    state.legacyPlaceholderMigrated = true;
    createPlaceholderChunk(0, chatLength - 1);
    saveSummaryState();
  }
}

/** Сбросить якорь (для пересборки с нуля). */
export function resetSummaryAnchorMes(anchorMes = 0) {
  const state = getSummaryState();
  state.summaryAnchorMes = anchorMes;
  saveSummaryState();
}

/** Зафиксировать baseline длины чата. */
export function resetSummaryChatLengthBaseline(chatLength = getContext()?.chat?.length || 0) {
  const state = getSummaryState();
  state.lastKnownChatLength = chatLength;
  saveSummaryState();
}

/** true, если с baseline добавилось новое сообщение. */
export function hasNewChatMessageSinceBaseline() {
  const chatLength = getContext()?.chat?.length || 0;
  const state = getSummaryState();
  const baseline = Number.isInteger(state.lastKnownChatLength)
    ? state.lastKnownChatLength
    : chatLength;

  if (chatLength > baseline) {
    state.lastKnownChatLength = chatLength;
    saveSummaryState();
    return true;
  }

  return false;
}

function saveSummaryState() {
  saveChatMetadata();
}

export function formatChunkTitle(startMes, endMes) {
  return `${startMes} — ${endMes}`;
}

export function getSortedSummaryChunks() {
  return getEntities("summaryChunks")
    .slice()
    .sort((a, b) => a.startMes - b.startMes || a.createdAt - b.createdAt);
}

function getAnchorChunks() {
  return getSortedSummaryChunks().filter(
    (chunk) =>
      (isSummaryPlaceholderChunk(chunk) ||
        (chunk.contextValid !== false && !chunk.sourceUnavailable)) &&
      Number.isInteger(chunk.startMes) &&
      Number.isInteger(chunk.endMes) &&
      chunk.startMes <= chunk.endMes,
  );
}

/** Индекс первого сообщения, ещё не учтённого карточками. */
export function getSummaryAnchorMes(chatLength = getContext()?.chat?.length || 0) {
  const anchorChunks = getAnchorChunks();
  if (anchorChunks.length > 0) {
    const anchor = Math.max(...anchorChunks.map((chunk) => chunk.endMes)) + 1;
    return Math.min(anchor, Math.max(0, chatLength));
  }

  const state = getSummaryState();
  const stored = Number.isInteger(state.summaryAnchorMes) ? state.summaryAnchorMes : 0;
  return Math.min(stored, Math.max(0, chatLength));
}

export function getNextChunkStart(chatLength = getContext()?.chat?.length || 0) {
  return getSummaryAnchorMes(chatLength);
}

export function getPendingMessageCount(chatLength) {
  if (!chatLength) {
    return 0;
  }

  return Math.max(0, chatLength - getNextChunkStart());
}

export function getMessagesUntilNext(interval, chatLength) {
  return interval - getPendingMessageCount(chatLength);
}

function isVisibleSummaryMessage(message) {
  return Boolean(message && !message.is_system);
}

/** Количество новых видимых сообщений после последней обработанной границы. */
export function getPendingVisibleMessageCount(
  chat = getContext()?.chat || [],
  beforeMessageId = Array.isArray(chat) ? chat.length : 0,
) {
  const messages = Array.isArray(chat) ? chat : [];
  const start = getNextChunkStart(messages.length);
  const endExclusive = Math.max(
    start,
    Math.min(
      Number.isInteger(beforeMessageId) ? beforeMessageId : messages.length,
      messages.length,
    ),
  );
  let count = 0;

  for (let messageId = start; messageId < endExclusive; messageId += 1) {
    if (isVisibleSummaryMessage(messages[messageId])) {
      count += 1;
    }
  }

  return count;
}

export function getVisibleMessagesUntilNext(
  interval,
  chat = getContext()?.chat || [],
  beforeMessageId = Array.isArray(chat) ? chat.length : 0,
) {
  return interval - getPendingVisibleMessageCount(chat, beforeMessageId);
}

/**
 * Диапазон из очередных видимых сообщений. Скрытые сообщения внутри диапазона
 * остаются его частью только для движения границы и не попадают в запрос.
 */
export function getNextVisibleChunkRange(
  interval,
  chat = getContext()?.chat || [],
  { beforeMessageId, forcePartial = false } = {},
) {
  const messages = Array.isArray(chat) ? chat : [];
  const start = getNextChunkStart(messages.length);
  const endExclusive = Math.max(
    start,
    Math.min(
      Number.isInteger(beforeMessageId) ? beforeMessageId : messages.length,
      messages.length,
    ),
  );

  if (start >= endExclusive || !Number.isInteger(interval) || interval < 1) {
    return null;
  }

  const visibleIds = [];
  for (let messageId = start; messageId < endExclusive; messageId += 1) {
    if (!isVisibleSummaryMessage(messages[messageId])) {
      continue;
    }
    visibleIds.push(messageId);
    if (!forcePartial && visibleIds.length === interval) {
      return { start, end: messageId, sourceMessageIds: visibleIds };
    }
  }

  if (!forcePartial || visibleIds.length === 0) {
    return null;
  }

  return {
    start,
    end: endExclusive - 1,
    sourceMessageIds: visibleIds,
  };
}

/**
 * План автоматики после нового сообщения пользователя. Текущий ход пользователя
 * не включается. После достижения интервала берём оставшиеся ответы персонажей
 * до следующего видимого пользовательского хода, чтобы не обрывать сцену.
 */
export function getNextAutomaticSummaryPlan(
  interval,
  chat = getContext()?.chat || [],
  triggerMessageId,
) {
  const messages = Array.isArray(chat) ? chat : [];
  const triggerId = Number.parseInt(triggerMessageId, 10);
  if (
    !Number.isInteger(triggerId) ||
    triggerId < 0 ||
    triggerId >= messages.length ||
    !messages[triggerId]?.is_user ||
    messages[triggerId]?.is_system
  ) {
    return null;
  }

  const initial = getNextVisibleChunkRange(interval, messages, {
    beforeMessageId: triggerId,
  });
  if (!initial) {
    return null;
  }

  let boundary = triggerId;
  for (let messageId = initial.end + 1; messageId <= triggerId; messageId += 1) {
    const message = messages[messageId];
    if (message?.is_user && !message.is_system) {
      boundary = messageId;
      break;
    }
  }

  const sourceMessageIds = [];
  for (let messageId = initial.start; messageId < boundary; messageId += 1) {
    if (isVisibleSummaryMessage(messages[messageId])) {
      sourceMessageIds.push(messageId);
    }
  }

  return {
    start: initial.start,
    end: boundary - 1,
    sourceMessageIds,
  };
}

export function shouldAutoGenerateSummary(interval, chatLength) {
  return getPendingMessageCount(chatLength) >= interval;
}

function getMergedCoverageRanges(chunks = getSortedSummaryChunks()) {
  const ranges = chunks
    .filter(
      (chunk) =>
        !isSummaryPlaceholderChunk(chunk) &&
        chunk.contextValid !== false &&
        !chunk.sourceUnavailable &&
        Number.isInteger(chunk.startMes) &&
        Number.isInteger(chunk.endMes) &&
        chunk.startMes <= chunk.endMes,
    )
    .flatMap((chunk) => hasExactSummarySources(chunk)
      ? chunk.sourceMessageStates.map((state) => ({ start: state.messageId, end: state.messageId }))
      : getChunkCoverageRanges(chunk))
    .sort((a, b) => a.start - b.start);

  const merged = [];

  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end + 1) {
      merged.push({ ...range });
    } else {
      last.end = Math.max(last.end, range.end);
    }
  }

  return merged;
}

/** Непокрытые карточками участки истории [start, end]. */
export function getUncoveredSummaryGaps(chatLength = getContext()?.chat?.length || 0) {
  if (!chatLength) {
    return [];
  }

  const merged = getMergedCoverageRanges();
  const gaps = [];
  let cursor = 0;

  for (const { start, end } of merged) {
    if (cursor < start) {
      gaps.push({ start: cursor, end: start - 1 });
    }
    cursor = Math.max(cursor, end + 1);
  }

  if (cursor < chatLength) {
    gaps.push({ start: cursor, end: chatLength - 1 });
  }

  // Скрытые сообщения не предлагают пересказать. Открытое ранее исключённое
  // сообщение снова появится в пробелах, не выключая существующую карточку.
  const chat = getContext()?.chat || [];
  return gaps.flatMap((gap) => {
    const visible = [];
    let start = null;
    for (let id = gap.start; id <= gap.end; id++) {
      if (!chat[id]?.is_system) {
        if (start === null) start = id;
      } else if (start !== null) {
        visible.push({ start, end: id - 1 });
        start = null;
      }
    }
    if (start !== null) visible.push({ start, end: gap.end });
    return visible;
  });
}

/** Разбить пробел на куски по интервалу. */
export function splitGapIntoChunkRanges(gap, interval) {
  if (!gap || interval < 1) {
    return [];
  }

  const ranges = [];
  let start = gap.start;

  while (start <= gap.end) {
    const end = Math.min(start + interval - 1, gap.end);
    ranges.push({ start, end });
    start = end + 1;
  }

  return ranges;
}

/** План для «Заполнить пробелы» в порядке сообщений. */
export function getSummaryFillGapsPlan(
  chatLength = getContext()?.chat?.length || 0,
  interval = getSettings()?.summaryInterval,
) {
  const gaps = getUncoveredSummaryGaps(chatLength);
  return gaps
    .flatMap((gap) => splitGapIntoChunkRanges(gap, interval))
    .sort((a, b) => a.start - b.start);
}

export function getSummaryFillGapsRequestCount(
  chatLength = getContext()?.chat?.length || 0,
  interval = getSettings()?.summaryInterval,
) {
  return getSummaryFillGapsPlan(chatLength, interval).length;
}

/** План пересборки «с нуля» по всей истории. */
export function getSummaryRebuildPlan(
  chatLength = getContext()?.chat?.length || 0,
  interval = getSettings()?.summaryInterval,
) {
  if (!chatLength || !interval || interval < 1) {
    return [];
  }

  return splitGapIntoChunkRanges({ start: 0, end: chatLength - 1 }, interval);
}

/** Количество запросов для полной пересборки. */
export function getSummaryRebuildRequestCount(
  chatLength = getContext()?.chat?.length || 0,
  interval = getSettings()?.summaryInterval,
) {
  return getSummaryRebuildPlan(chatLength, interval).length;
}

/**
 * @returns {{ start: number, end: number } | null}
 */
export function getNextChunkRange(interval, chatLength, { forcePartial = false } = {}) {
  const start = getNextChunkStart();
  if (start >= chatLength) {
    return null;
  }

  if (forcePartial) {
    return { start, end: chatLength - 1 };
  }

  const pending = chatLength - start;
  if (pending < interval) {
    return null;
  }

  return {
    start,
    end: Math.min(start + interval - 1, chatLength - 1),
  };
}

export function getCombinedChunkText(chunks = getSortedSummaryChunks()) {
  return chunks
    .filter((chunk) => isSummaryChunkContextUsable(chunk))
    .map((chunk) => {
      if (chunk.type === CHUNK_TYPE.COMPRESSED) {
        return chunk.text;
      }

      return `### Сообщения ${formatChunkTitle(chunk.startMes, chunk.endMes)}\n${chunk.text}`;
    })
    .join("\n\n");
}

/** Валидные карточки, пересекающие пользовательский диапазон. */
export function getOverlappingSummaryChunks(startMes, endMes) {
  return findSummaryRangeOverlaps(getSortedSummaryChunks(), startMes, endMes);
}

/** Зафиксировать текущие отпечатки сообщений, относящихся к карточке. */
export function captureCurrentSummaryChunkSourceStates(chunk) {
  return captureSummarySourceMessageStates(
    getContext()?.chat,
    getChunkCoverageRanges(chunk),
  );
}

export function hasCompressionBackup() {
  const backup = getSummaryState().compressionBackup;
  if (Array.isArray(backup)) {
    return backup.length > 0;
  }
  return (
    backup &&
    Number.isInteger(backup.compressedChunkId) &&
    Array.isArray(backup.sourceChunks) &&
    backup.sourceChunks.length > 0
  );
}

export function getCompressionBackupChunks() {
  const backup = getSummaryState().compressionBackup;
  if (Array.isArray(backup)) {
    return backup;
  }
  return Array.isArray(backup?.sourceChunks) ? backup.sourceChunks : [];
}

export function setCompressionBackup(chunks, compressedChunkId) {
  const state = getSummaryState();
  state.compressionBackup = {
    compressedChunkId,
    sourceChunks: JSON.parse(JSON.stringify(chunks)),
  };
  saveSummaryState();
}

export function clearCompressionBackup() {
  const state = getSummaryState();
  state.compressionBackup = null;
  saveSummaryState();
}

export function rollbackCompression() {
  const state = getSummaryState();
  const backup = state.compressionBackup;
  if (!hasCompressionBackup()) {
    throw new Error("Нет сохранённой версии для отката.");
  }

  const currentChunks = getEntities("summaryChunks");

  if (Array.isArray(backup)) {
    // Миграция отката из 0.3.0–0.3.2: раньше сохранялся весь список.
    // Новые обычные карточки, созданные после сокращения, нельзя терять.
    const backupIds = new Set(backup.map((chunk) => chunk.id));
    const laterChunks = currentChunks.filter(
      (chunk) => !backupIds.has(chunk.id) && chunk.type !== CHUNK_TYPE.COMPRESSED,
    );
    setEntities("summaryChunks", [...backup, ...laterChunks]);
    clearCompressionBackup();
    return;
  }

  const sourceChunks = backup.sourceChunks;
  const sourceIds = new Set(sourceChunks.map((chunk) => chunk.id));
  const preservedChunks = currentChunks.filter(
    (chunk) =>
      chunk.id !== backup.compressedChunkId && !sourceIds.has(chunk.id),
  );
  setEntities("summaryChunks", [...preservedChunks, ...sourceChunks]);
  clearCompressionBackup();
}

export function getChunksBefore(chunkId) {
  const chunks = getSortedSummaryChunks();
  const index = chunks.findIndex((chunk) => chunk.id === chunkId);
  if (index <= 0) {
    return [];
  }

  return chunks.slice(0, index);
}

export function migrateLegacySummary() {
  const chunks = getEntities("summaryChunks");
  if (chunks.length > 0) {
    return;
  }

  const legacy = getEntities("summary");
  if (!legacy?.text?.trim()) {
    return;
  }

  let startMes = 0;
  let endMes = 0;

  if (Number.isInteger(legacy.lastChunkStart) && Number.isInteger(legacy.lastChunkEnd)) {
    startMes = legacy.lastChunkStart;
    endMes = Math.max(legacy.lastChunkStart, legacy.lastChunkEnd - 1);
  } else if (Number.isInteger(legacy.lastSummaryAt) && legacy.lastSummaryAt > 0) {
    endMes = legacy.lastSummaryAt - 1;
  }

  createEntity("summaryChunks", {
    type: CHUNK_TYPE.CHUNK,
    startMes,
    endMes,
    text: legacy.text,
    contextValid: true,
  });
}

export function syncSummaryStateWithChat(
  chatLength = getContext()?.chat?.length || 0,
  { auditSources = false } = {},
) {
  ensureSummaryBootstrap(chatLength);

  const chunks = getEntities("summaryChunks");
  if (!chunks.length) {
    return;
  }

  if (!chatLength) {
    const nextChunks = chunks
      .filter((chunk) => !isSummaryPlaceholderChunk(chunk))
      .map((chunk) => ({
        ...chunk,
        contextValid: false,
        sourceUnavailable: true,
      }));
    const context = getContext();
    if (context?.chatMetadata) {
      context.chatMetadata["story-manager-summary-chunks"] = nextChunks;
      saveSummaryState();
    }
    return;
  }

  let changed = false;
  const chat = getContext()?.chat || [];

  for (const chunk of chunks) {
    if (isSummaryPlaceholderChunk(chunk)) {
      continue;
    }

    // 0.4.0–0.4.2 сохраняли состояние hide/unhide рядом с отпечатком текста.
    // Оно больше не является частью контроля целостности и удаляется без
    // изменения самой карточки.
    if (
      Array.isArray(chunk.sourceMessageStates) &&
      chunk.sourceMessageStates.some((state) =>
        Object.prototype.hasOwnProperty.call(state || {}, "hidden"),
      )
    ) {
      chunk.sourceMessageStates = chunk.sourceMessageStates.map((state) => {
        const { hidden: _hidden, ...contentState } = state || {};
        return contentState;
      });
      changed = true;
    }

    const sourceStateCurrent = auditSources || chunk.endMes >= chatLength
      ? isSummarySourceStateCurrent(chunk, chat)
      : null;

    if (chunk.contextValid !== false && sourceStateCurrent === false) {
      chunk.contextValid = false;
      changed = true;
    }

    if (chunk.startMes >= chatLength) {
      if (chunk.contextValid !== false || !chunk.sourceUnavailable) {
        chunk.contextValid = false;
        chunk.sourceUnavailable = true;
        changed = true;
      }
      continue;
    }

    if (chunk.endMes >= chatLength) {
      chunk.endMes = chatLength - 1;
      // У точной карточки могли удалить только исключённый хвост диапазона.
      if (!hasExactSummarySources(chunk) || sourceStateCurrent !== true) {
        chunk.contextValid = false;
      }
      if (Array.isArray(chunk.sourceRanges)) {
        chunk.sourceRanges = chunk.sourceRanges
          .filter((range) => range.start < chatLength)
          .map((range) => ({ ...range, end: Math.min(range.end, chatLength - 1) }));
      }
      changed = true;
    }

    if (chunk.startMes > chunk.endMes) {
      chunk.contextValid = false;
      changed = true;
    }
  }

  if (changed) {
    const context = getContext();
    if (context?.chatMetadata) {
      context.chatMetadata["story-manager-summary-chunks"] = chunks;
      saveSummaryState();
    }
  }
}

export function invalidateChunksForMessage(messageId) {
  const safeId = Number.parseInt(messageId, 10);
  if (!Number.isInteger(safeId)) {
    return [];
  }

  return applySummaryHistoryMutation({ changedMessageIds: [safeId] }).invalidatedChunkIds;
}

function updateCompressionBackupForHistoryMutation(
  backup,
  deletedMessageIds,
  changedMessageIds,
) {
  const sourceChunks = Array.isArray(backup)
    ? backup
    : Array.isArray(backup?.sourceChunks)
      ? backup.sourceChunks
      : null;

  if (!sourceChunks) {
    return false;
  }

  let changed = false;
  const nextSourceChunks = sourceChunks.map((sourceChunk) => {
    const result = reindexSummaryChunkAfterDeletions(sourceChunk, deletedMessageIds);
    const next = result.chunk;
    const wasInvalidated = changedMessageIds.some((messageId) =>
      summaryChunkCoversMessage(next, messageId),
    );

    if (wasInvalidated && next.type !== CHUNK_TYPE.PLACEHOLDER) {
      next.contextValid = false;
    }

    changed ||= result.changed || wasInvalidated;
    return next;
  });

  if (!changed) {
    return false;
  }

  if (Array.isArray(backup)) {
    const state = getSummaryState();
    state.compressionBackup = nextSourceChunks;
  } else {
    backup.sourceChunks = nextSourceChunks;
  }

  return true;
}

/**
 * Применить изменения истории к карточкам одним сохранением.
 * deletedMessageIds используют старые mesid; changedMessageIds — текущие.
 */
export function applySummaryHistoryMutation({
  deletedMessageIds = [],
  changedMessageIds = [],
} = {}) {
  const deleted = [...new Set(deletedMessageIds.filter(Number.isInteger))];
  const changedMessages = [...new Set(changedMessageIds.filter(Number.isInteger))];
  const chunks = getEntities("summaryChunks");
  const invalidatedChunkIds = new Set();
  let changed = false;
  const nextChunks = [];

  for (const chunk of chunks) {
    const result = reindexSummaryChunkAfterDeletions(chunk, deleted);
    const next = result.chunk;

    if (isSummaryPlaceholderChunk(next) && result.removed) {
      changed = true;
      continue;
    }

    const invalidatedByContent =
      !isSummaryPlaceholderChunk(next) &&
      changedMessages.some((messageId) => summaryChunkCoversMessage(next, messageId));

    if (invalidatedByContent) {
      next.contextValid = false;
    }

    if (
      !isSummaryPlaceholderChunk(next) &&
      (result.touched || result.removed || invalidatedByContent)
    ) {
      invalidatedChunkIds.add(next.id);
    }

    changed ||= result.changed || invalidatedByContent;
    nextChunks.push(next);
  }

  const state = getSummaryState();
  if (Number.isInteger(state.summaryAnchorMes) && deleted.length > 0) {
    const shiftedAnchor = reindexSummaryBoundaryAfterDeletions(
      state.summaryAnchorMes,
      deleted,
    );
    if (shiftedAnchor !== state.summaryAnchorMes) {
      state.summaryAnchorMes = shiftedAnchor;
      changed = true;
    }
  }

  const backupChanged = updateCompressionBackupForHistoryMutation(
    state.compressionBackup,
    deleted,
    changedMessages,
  );
  changed = changed || backupChanged;

  if (changed) {
    const context = getContext();
    if (context?.chatMetadata) {
      context.chatMetadata["story-manager-summary-chunks"] = nextChunks;
      saveSummaryState();
    }
  }

  return {
    changed,
    invalidatedChunkIds: [...invalidatedChunkIds],
    deletedMessageIds: deleted,
    changedMessageIds: changedMessages,
  };
}
