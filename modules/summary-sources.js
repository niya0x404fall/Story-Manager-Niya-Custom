/** Выбор сообщений для запроса. Никаких запросов и изменений видимости. */
import {
  captureSummarySourceMessageStates,
  getChunkCoverageRanges,
  getSummaryMessageFingerprint,
  getSummaryMessageIdentity,
  hasExactSummarySources,
} from "./summary-integrity.js";

export const SUMMARY_SOURCE_MODE = Object.freeze({
  ORIGINAL: "original",
  VISIBLE: "visible",
  ALL: "all",
});

function entriesInRanges(chat, ranges) {
  const ids = new Set();
  for (const { start, end } of ranges) {
    for (let id = Math.max(0, start); id <= Math.min(end, chat.length - 1); id++) {
      if (chat[id]) ids.add(id);
    }
  }
  return [...ids].sort((a, b) => a - b)
    .map((messageId) => ({ messageId, message: chat[messageId] }));
}

export function selectSummarySources(chat, chunk, mode) {
  if (!Array.isArray(chat)) throw new Error("Сначала откройте чат.");
  if (mode === SUMMARY_SOURCE_MODE.ORIGINAL) {
    if (!hasExactSummarySources(chunk)) {
      throw new Error("Старый состав источников не сохранён. Выберите весь диапазон или только видимые сообщения.");
    }
    return chunk.sourceMessageStates.map((state) => {
      const message = chat[state.messageId];
      if (!message || (state.identity && getSummaryMessageIdentity(message) !== state.identity)) {
        throw new Error("Исходное сообщение удалено или перемещено. Повторите выбор источников после обновления чата.");
      }
      return { messageId: state.messageId, message };
    }).sort((a, b) => a.messageId - b.messageId);
  }
  const entries = entriesInRanges(chat, getChunkCoverageRanges(chunk));
  if (mode === SUMMARY_SOURCE_MODE.ALL) return entries;
  if (mode === SUMMARY_SOURCE_MODE.VISIBLE) {
    return entries.filter(({ message }) => !message?.is_system);
  }
  throw new Error("Выберите, по каким сообщениям пересобрать карточку.");
}

/** Снимок источников фиксируется ДО await, одновременно с телом запроса. */
export function captureSelectedSummarySources(entries) {
  return {
    sourceSelectionVersion: 1,
    sourceMessageStates: entries.map(({ messageId, message }) => ({
      messageId,
      fingerprint: getSummaryMessageFingerprint(message),
      identity: getSummaryMessageIdentity(message),
    })),
  };
}

export function formatSelectedSummaryMessages(entries) {
  return entries.map(({ messageId, message }) =>
    `[${messageId}] ${message.name}: ${message.mes}`,
  ).join("\n\n");
}

/** Hide в полёте не меняет снимок; правка/удаление запрещает запись позднего ответа. */
export function assertSummarySourcesUnchanged(chat, entries, selection) {
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const state = selection.sourceMessageStates[index];
    if (chat[entry.messageId] !== entry.message ||
        getSummaryMessageFingerprint(chat[entry.messageId]) !== state.fingerprint) {
      throw new Error("Исходники изменились во время запроса. Готовый ответ не сохранён, прежняя карточка осталась.");
    }
  }
}

/** Карандаш меняет текст, но не включает ранее исключённые сообщения. */
export function captureEditedSummarySources(chat, chunk) {
  if (hasExactSummarySources(chunk)) {
    const entries = chunk.sourceMessageStates
      .filter((state) => chat[state.messageId])
      .map((state) => ({ messageId: state.messageId, message: chat[state.messageId] }));
    return captureSelectedSummarySources(entries);
  }
  // Даже сохранение карандашом не превращает неизвестное происхождение в точное.
  return {
    sourceSelectionVersion: null,
    sourceMessageStates: captureSummarySourceMessageStates(chat, getChunkCoverageRanges(chunk)),
  };
}

export function combineSummarySources(chat, chunks) {
  if (!chunks.every(hasExactSummarySources)) {
    return {
      sourceSelectionVersion: null,
      sourceMessageStates: captureSummarySourceMessageStates(chat, chunks.flatMap(getChunkCoverageRanges)),
    };
  }
  const ids = [...new Set(chunks.flatMap((chunk) =>
    chunk.sourceMessageStates.map((state) => state.messageId),
  ))].sort((a, b) => a - b);
  return captureSelectedSummarySources(ids.map((messageId) => ({ messageId, message: chat[messageId] })));
}

export function getSummarySourceChoices(chat, chunk) {
  const exact = hasExactSummarySources(chunk);
  const choices = [];
  if (exact) {
    const available = chunk.sourceMessageStates.filter((state) => chat[state.messageId]);
    choices.push({
      mode: SUMMARY_SOURCE_MODE.ORIGINAL,
      label: "По сохранённым исходникам",
      description: "Тот же набор, что при последнем создании карточки, включая скрытое позже. Текст сообщений берётся текущий.",
      count: available.length,
      hiddenCount: available.filter((state) => chat[state.messageId]?.is_system).length,
    });
  }
  const visible = selectSummarySources(chat, chunk, SUMMARY_SOURCE_MODE.VISIBLE);
  choices.push({
    mode: SUMMARY_SOURCE_MODE.VISIBLE,
    label: "Только видимые сейчас",
    description: "Заново взять диапазон, исключив все скрытые сообщения. Ранее исключённые, но открытые теперь сообщения войдут.",
    count: visible.length,
    hiddenCount: 0,
  });
  if (!exact) {
    const all = selectSummarySources(chat, chunk, SUMMARY_SOURCE_MODE.ALL);
    choices.push({
      mode: SUMMARY_SOURCE_MODE.ALL,
      label: "Весь диапазон, включая скрытые",
      description: "Для старой карточки, чьи правильные исходники вы скрыли ради экономии токенов. Ненужные скрытые ветки тоже попадут в запрос.",
      count: all.length,
      hiddenCount: all.filter(({ message }) => message.is_system).length,
    });
  }
  return { exact, choices };
}

export function getVisibleExcludedSummarySourceIds(chat, chunk) {
  if (!hasExactSummarySources(chunk)) return [];
  const included = new Set(chunk.sourceMessageStates.map((state) => state.messageId));
  return selectSummarySources(chat, chunk, SUMMARY_SOURCE_MODE.VISIBLE)
    .filter((entry) => !included.has(entry.messageId)).map((entry) => entry.messageId);
}
