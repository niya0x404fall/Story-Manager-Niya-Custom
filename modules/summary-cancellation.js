let activeSummaryBatch = null;

/** Создаёт отдельный сигнал остановки для массовой генерации саммари. */
export function beginSummaryBatchCancellation() {
  activeSummaryBatch = {
    stopRequested: false,
    controller: new AbortController(),
  };
  return activeSummaryBatch.controller.signal;
}

export function getSummaryBatchSignal() {
  return activeSummaryBatch?.controller?.signal ?? null;
}

export function isSummaryStopRequested() {
  return Boolean(activeSummaryBatch?.stopRequested);
}

/** Отменяет запрос Story Manager, не останавливая параллельный ответ персонажа. */
export function requestSummaryStop() {
  if (!activeSummaryBatch || activeSummaryBatch.stopRequested) {
    return false;
  }

  activeSummaryBatch.stopRequested = true;
  activeSummaryBatch.controller.abort("Story Manager summary stopped by user");
  return true;
}

export function endSummaryBatchCancellation() {
  activeSummaryBatch = null;
}
