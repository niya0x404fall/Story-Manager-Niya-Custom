/** Чистые функции контроля целостности саммари — без зависимостей от SillyTavern. */

const PLACEHOLDER_TYPE = "placeholder";

function isIntegerRange(range) {
  return (
    Number.isInteger(range?.start) &&
    Number.isInteger(range?.end) &&
    range.start <= range.end
  );
}

/** Реальные исходные диапазоны карточки, включая выборочно сжатые карточки. */
export function getChunkCoverageRanges(chunk) {
  if (Array.isArray(chunk?.sourceRanges) && chunk.sourceRanges.length > 0) {
    return chunk.sourceRanges
      .filter(isIntegerRange)
      .map((range) => ({ start: range.start, end: range.end }));
  }

  if (
    Number.isInteger(chunk?.startMes) &&
    Number.isInteger(chunk?.endMes) &&
    chunk.startMes <= chunk.endMes
  ) {
    return [{ start: chunk.startMes, end: chunk.endMes }];
  }

  return [];
}

/** Карточка безопасна для отправки модели. */
export function isSummaryChunkContextUsable(chunk) {
  return Boolean(
    chunk &&
      chunk.type !== PLACEHOLDER_TYPE &&
      chunk.enabled !== false &&
      chunk.contextValid !== false &&
      !chunk.sourceUnavailable &&
      String(chunk.text || "").trim(),
  );
}

export function summaryChunkCoversMessage(chunk, messageId) {
  if (!Number.isInteger(messageId)) {
    return false;
  }

  if (hasExactSummarySources(chunk)) {
    return chunk.sourceMessageStates.some((state) => state.messageId === messageId);
  }
  return getChunkCoverageRanges(chunk).some(
    (range) => messageId >= range.start && messageId <= range.end,
  );
}

/** Только версия 1 гарантирует, что список совпадает с отправленным запросом. */
export function hasExactSummarySources(chunk) {
  return chunk?.sourceSelectionVersion === 1 &&
    Array.isArray(chunk.sourceMessageStates) &&
    chunk.sourceMessageStates.every((state) =>
      Number.isInteger(state?.messageId) && state.messageId >= 0 &&
      typeof state.fingerprint === "string" && state.fingerprint.length > 0,
    );
}

export function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

/**
 * Заглушка фиксирует только уже принятую историю: рост чата не должен
 * расширять её, а сокращение истории может безопасно уменьшить правую границу.
 */
export function getSummaryPlaceholderEndAfterResize(currentEnd, chatLength) {
  if (
    !Number.isInteger(currentEnd) ||
    !Number.isInteger(chatLength) ||
    chatLength <= 0
  ) {
    return currentEnd;
  }

  return Math.min(currentEnd, chatLength - 1);
}

/** Сдвинуть позицию между сообщениями после удаления старых mesid. */
export function reindexSummaryBoundaryAfterDeletions(boundary, deletedMessageIds) {
  if (!Number.isInteger(boundary)) {
    return boundary;
  }
  const deletedBefore = new Set(
    (deletedMessageIds || []).filter(
      (deletedId) => Number.isInteger(deletedId) && deletedId < boundary,
    ),
  ).size;
  return Math.max(0, boundary - deletedBefore);
}

/** Валидные карточки, которые пересекаются с новым ручным диапазоном. */
export function findSummaryRangeOverlaps(chunks, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
    return [];
  }

  return (Array.isArray(chunks) ? chunks : []).filter(
    (chunk) =>
      chunk?.type !== PLACEHOLDER_TYPE &&
      chunk?.contextValid !== false &&
      !chunk?.sourceUnavailable &&
      getChunkCoverageRanges(chunk).some((range) =>
        rangesOverlap(start, end, range.start, range.end),
      ),
  );
}

function stableMessagePart(message) {
  return (
    message?.send_date ??
    message?.gen_started ??
    message?.extra?.api_id ??
    message?.extra?.message_id ??
    ""
  );
}

function stableMessageKey(message) {
  const stablePart = stableMessagePart(message);

  if (stablePart === "") {
    return "";
  }

  return [stablePart, message?.name ?? "", Boolean(message?.is_user)].join("\u0001");
}

function messageContentKey(message) {
  return [
    message?.name ?? "",
    Boolean(message?.is_user),
    message?.mes ?? "",
    message?.swipe_id ?? "",
  ].join("\u0001");
}

function hashText(value) {
  const text = String(value ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function getSummaryMessageFingerprint(message) {
  return hashText(messageContentKey(message));
}

export function getSummaryMessageIdentity(message) {
  // Имя/роль могут быть отредактированы. Это содержание, а не ID сообщения.
  const key = stableMessagePart(message);
  return key !== "" ? hashText(key) : null;
}

/**
 * Запомнить содержимое всех сообщений, относящихся к карточке, без копирования
 * текста. Видимость намеренно не входит в отпечаток: hide/unhide управляет
 * сырым контекстом SillyTavern, но не меняет уже зафиксированный канон.
 */
export function captureSummarySourceMessageStates(chat, ranges) {
  const messages = Array.isArray(chat) ? chat : [];
  const seen = new Set();
  const states = [];

  for (const range of Array.isArray(ranges) ? ranges : []) {
    if (!isIntegerRange(range)) {
      continue;
    }
    for (let messageId = range.start; messageId <= range.end; messageId += 1) {
      if (seen.has(messageId) || !messages[messageId]) {
        continue;
      }
      seen.add(messageId);
      states.push({
        messageId,
        fingerprint: getSummaryMessageFingerprint(messages[messageId]),
        identity: getSummaryMessageIdentity(messages[messageId]),
      });
    }
  }

  return states;
}

/**
 * true/false для сохранённого отпечатка, null для старой карточки без отпечатка.
 * Поле `hidden` из карточек 0.4.0–0.4.2 игнорируется для обратной
 * совместимости: скрытие сообщения не делает его пересказ неверным.
 */
export function isSummarySourceStateCurrent(chunk, chat) {
  if (!Array.isArray(chunk?.sourceMessageStates) || chunk.sourceMessageStates.length === 0) {
    return null;
  }

  const messages = Array.isArray(chat) ? chat : [];
  return chunk.sourceMessageStates.every((state) => {
    const messageId = Number.parseInt(state?.messageId, 10);
    const message = messages[messageId];
    return Boolean(
      Number.isInteger(messageId) &&
        message &&
        (!state.identity || getSummaryMessageIdentity(message) === state.identity) &&
        getSummaryMessageFingerprint(message) === state.fingerprint,
    );
  });
}

/** Снимок сохраняет ссылки на сообщения: после splice оставшиеся объекты узнаются точно. */
export function createSummaryMessageSnapshot(chat) {
  return (Array.isArray(chat) ? chat : []).map((message) => ({
    reference: message,
    stableKey: stableMessageKey(message),
    contentKey: messageContentKey(message),
    hidden: Boolean(message?.is_system),
  }));
}

function isSameMessage(left, right) {
  if (!left || !right) {
    return false;
  }
  if (left.reference && left.reference === right.reference) {
    return true;
  }
  if (left.stableKey && right.stableKey) {
    return left.stableKey === right.stableKey;
  }
  return left.contentKey === right.contentKey;
}

function recordMessageChange(result, previous, current, currentIndex) {
  if (previous.hidden !== current.hidden) {
    result.visibilityChangedMessageIds.push(currentIndex);
  }
  if (previous.contentKey !== current.contentKey) {
    result.contentChangedMessageIds.push(currentIndex);
  }
}

/**
 * Сравнить историю между событиями ST.
 * deletedMessageIds относятся к старой нумерации, changedMessageIds — к текущей.
 */
export function diffSummaryMessageSnapshots(previous, current) {
  const before = Array.isArray(previous) ? previous : [];
  const after = Array.isArray(current) ? current : [];
  const result = {
    deletedMessageIds: [],
    visibilityChangedMessageIds: [],
    contentChangedMessageIds: [],
    changedMessageIds: [],
  };

  let oldIndex = 0;
  let newIndex = 0;
  let deletionsLeft = Math.max(0, before.length - after.length);

  while (oldIndex < before.length && newIndex < after.length) {
    if (isSameMessage(before[oldIndex], after[newIndex])) {
      recordMessageChange(result, before[oldIndex], after[newIndex], newIndex);
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (deletionsLeft > 0) {
      let skipped = 1;
      while (
        skipped <= deletionsLeft &&
        oldIndex + skipped < before.length &&
        !isSameMessage(before[oldIndex + skipped], after[newIndex])
      ) {
        skipped += 1;
      }

      if (
        skipped <= deletionsLeft &&
        oldIndex + skipped < before.length &&
        isSameMessage(before[oldIndex + skipped], after[newIndex])
      ) {
        for (let offset = 0; offset < skipped; offset += 1) {
          result.deletedMessageIds.push(oldIndex + offset);
        }
        oldIndex += skipped;
        deletionsLeft -= skipped;
        continue;
      }
    }

    // Та же позиция, но объект был заменён или отредактирован.
    result.contentChangedMessageIds.push(newIndex);
    if (before[oldIndex]?.hidden !== after[newIndex]?.hidden) {
      result.visibilityChangedMessageIds.push(newIndex);
    }
    oldIndex += 1;
    newIndex += 1;
  }

  while (oldIndex < before.length && deletionsLeft > 0) {
    result.deletedMessageIds.push(oldIndex);
    oldIndex += 1;
    deletionsLeft -= 1;
  }

  result.deletedMessageIds = [...new Set(result.deletedMessageIds)].sort((a, b) => a - b);
  result.visibilityChangedMessageIds = [
    ...new Set(result.visibilityChangedMessageIds),
  ].sort((a, b) => a - b);
  result.contentChangedMessageIds = [
    ...new Set(result.contentChangedMessageIds),
  ].sort((a, b) => a - b);
  // Hide/unhide — это настройка передачи сырого сообщения в контекст, а не
  // изменение его содержания. Карточки инвалидируются только при реальном
  // изменении текста/свайпа (и отдельно при удалении).
  result.changedMessageIds = [...result.contentChangedMessageIds];

  return result;
}

function reindexRangeAfterDeletions(range, deletedMessageIds) {
  let start = range.start;
  let end = range.end;
  let touched = false;

  for (const deletedId of deletedMessageIds) {
    if (deletedId < start) {
      start -= 1;
      end -= 1;
      continue;
    }

    if (deletedId <= end) {
      touched = true;
      if (start === end) {
        return { range: null, touched: true };
      }
      end -= 1;
    }
  }

  return { range: { start, end }, touched };
}

/**
 * Перенумеровать одну карточку после удаления сообщений.
 * ID удаления передаются в старой системе координат и обрабатываются справа налево.
 */
export function reindexSummaryChunkAfterDeletions(chunk, deletedMessageIds) {
  const deleted = [...new Set((deletedMessageIds || []).filter(Number.isInteger))]
    .sort((a, b) => b - a);
  const next = { ...chunk };

  if (deleted.length === 0) {
    return { chunk: next, changed: false, touched: false, removed: false };
  }

  const hasSourceRanges = Array.isArray(chunk?.sourceRanges) && chunk.sourceRanges.length > 0;
  const ranges = getChunkCoverageRanges(chunk);
  const transformed = ranges.map((range) => reindexRangeAfterDeletions(range, deleted));
  const survivingRanges = transformed
    .map((item) => item.range)
    .filter(Boolean);
  const rangeTouched = transformed.some((item) => item.touched);
  const shifted = survivingRanges.some(
    (range, index) =>
      range.start !== ranges[index]?.start || range.end !== ranges[index]?.end,
  );
  const removed = ranges.length > 0 && survivingRanges.length === 0;
  let sourceStateTouched = false;

  if (Array.isArray(chunk?.sourceMessageStates)) {
    next.sourceMessageStates = chunk.sourceMessageStates
      .map((state) => {
        let messageId = Number.parseInt(state?.messageId, 10);
        if (!Number.isInteger(messageId)) {
          return null;
        }
        for (const deletedId of deleted) {
          if (messageId === deletedId) {
            sourceStateTouched = true;
            return null;
          }
          if (deletedId < messageId) {
            messageId -= 1;
          }
        }
        return { ...state, messageId };
      })
      .filter(Boolean);
  }

  if (hasSourceRanges) {
    next.sourceRanges = survivingRanges;
  }

  if (survivingRanges.length > 0) {
    next.startMes = Math.min(...survivingRanges.map((range) => range.start));
    next.endMes = Math.max(...survivingRanges.map((range) => range.end));
  }

  // Удаление исключённой ветки меняет границы, но не содержание саммари.
  const touched = hasExactSummarySources(chunk) ? sourceStateTouched : rangeTouched;
  if (touched && chunk?.type !== PLACEHOLDER_TYPE) {
    next.contextValid = false;
  }
  if (removed && chunk?.type !== PLACEHOLDER_TYPE) {
    next.contextValid = false;
    next.sourceUnavailable = true;
  }

  return {
    chunk: next,
    changed: rangeTouched || shifted || removed || sourceStateTouched,
    touched,
    removed,
  };
}
