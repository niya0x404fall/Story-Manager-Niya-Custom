import { hasActiveChat } from "../app/runtime-context.js";
import { injectAllEntities } from "../modules/injection.js";
import {
  reconcileSummaryHistory,
  resetSummaryHistorySnapshot,
} from "../modules/summary-history.js";
import { UI } from "../modules/ui-text.js";
import { renderSummary } from "../modules/ui/summary-list.js";
import { toastSummaryWarning } from "../modules/ui/toasts.js";

async function refreshInvalidatedSummary(result, { notify = true } = {}) {
  if (!result?.changed) {
    return false;
  }

  await renderSummary();
  injectAllEntities();

  if (notify && result.invalidatedChunkIds.length > 0) {
    toastSummaryWarning(UI.summary.staleExcluded);
  }

  return true;
}

export function bindChatEvents(eventSource, eventTypes, { refreshFromChatState }) {
  eventSource.on(eventTypes.CHAT_CHANGED, async () => {
    await refreshFromChatState();
  });

  eventSource.on(eventTypes.MESSAGE_DELETED, async () => {
    if (!hasActiveChat()) {
      return;
    }

    const result = reconcileSummaryHistory();
    await refreshFromChatState();
    if (result.invalidatedChunkIds.length > 0) {
      toastSummaryWarning(UI.summary.staleExcluded);
    }
  });

  eventSource.on(eventTypes.MESSAGE_EDITED, async () => {
    if (!hasActiveChat()) {
      return;
    }

    const result = reconcileSummaryHistory();
    await refreshInvalidatedSummary(result);
  });

  eventSource.on(eventTypes.MESSAGE_SWIPED, async () => {
    if (!hasActiveChat()) {
      return;
    }

    const result = reconcileSummaryHistory();
    await refreshInvalidatedSummary(result);
  });

  const captureRenderedMessage = async () => {
    if (!hasActiveChat()) {
      return;
    }
    // Обычно это только добавление в конец: карточки не меняются, снимок обновляется.
    await refreshInvalidatedSummary(reconcileSummaryHistory());
  };
  eventSource.on(eventTypes.USER_MESSAGE_RENDERED, captureRenderedMessage);
  eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, captureRenderedMessage);

  // Сверяем историю ДО того, как ST собирает Main Prompt и Depth-инъекции.
  // GENERATE_BEFORE_COMBINE_PROMPTS для этой задачи уже слишком поздний:
  // before/after-story extension prompts к тому моменту превращены в строки.
  eventSource.on(eventTypes.GENERATION_AFTER_COMMANDS, async () => {
    if (!hasActiveChat()) {
      return;
    }

    const result = reconcileSummaryHistory();
    // Обновить источник prompt нужно немедленно; перерисовка UI может ждать.
    injectAllEntities();
    if (result.changed) {
      await renderSummary();
      if (result.invalidatedChunkIds.length > 0) {
        toastSummaryWarning(UI.summary.staleExcluded);
      }
    }
  });

  resetSummaryHistorySnapshot();
}
