import { updateSummaryIndicators } from "../modules/buttons.js";
import { isGenerationInProgress } from "../modules/generation-state.js";
import { getSettings } from "../modules/settings.js";
import { UI } from "../modules/ui-text.js";
import {
  requestSummaryGenerationStop,
  runSummaryChunkGeneration,
} from "../modules/summary-actions.js";
import {
  getNextAutomaticSummaryPlan,
  hasNewChatMessageSinceBaseline,
  syncSummaryStateWithChat,
} from "../modules/summary-chunks.js";
import {
  toastSummaryError,
  toastSummaryInfo,
  toastSummarySuccess,
} from "../modules/ui/toasts.js";
import {
  clearSummaryProgressToast,
  createSummaryBatchCallbacks,
} from "../modules/ui/summary-progress-toast.js";

let automaticSummaryInProgress = false;

function isAutomaticSummaryEnabled() {
  if (!getSettings().summaryAutoEnabled) {
    return false;
  }

  // Экран и сохранённая настройка не должны расходиться. Если панель уже
  // нарисована и хотя бы один переключатель показывает «выключено», безопаснее
  // не запускать фоновый запрос. Особенно это защищает при двух копиях расширения.
  const toggles = typeof document === "undefined"
    ? []
    : [...document.querySelectorAll("#story_summary_auto_enabled")];
  return toggles.length === 0 || toggles.every((toggle) => toggle.checked);
}

/**
 * Остановить только запрос, который был запущен автоматикой Story Manager.
 * Ручные операции этим переключателем не затрагиваются.
 */
export function stopAutomaticSummaryGeneration() {
  if (!automaticSummaryInProgress) {
    return false;
  }

  return requestSummaryGenerationStop();
}

export async function maybeGenerateSummary(triggerMessageId) {
  const context = SillyTavern.getContext();
  if (!context?.chatMetadata || !Array.isArray(context.chat)) {
    return;
  }

  syncSummaryStateWithChat(context.chat.length);
  updateSummaryIndicators();

  if (!isAutomaticSummaryEnabled()) {
    return;
  }

  if (!hasNewChatMessageSinceBaseline()) {
    return;
  }

  if (isGenerationInProgress()) {
    return;
  }

  const plan = getNextAutomaticSummaryPlan(
    getSettings().summaryInterval,
    context.chat,
    triggerMessageId,
  );
  if (!plan) {
    return;
  }

  // Состав фиксируется до первого await: последующее hide не меняет уже
  // принятую сцену, а правка/свайп/удаление будут замечены перед сохранением.
  const selectedMessages = plan.sourceMessageIds.map((messageId) => ({
    messageId,
    message: context.chat[messageId],
  }));

  const progressCallbacks = createSummaryBatchCallbacks(UI.summary.autoProgressTitle);
  let stopped = false;
  automaticSummaryInProgress = true;

  try {
    const result = await runSummaryChunkGeneration({
      cancellable: true,
      range: { start: plan.start, end: plan.end },
      selectedMessages,
      // Галочка могла быть выключена, пока провайдер готовил ответ.
      // В этом случае результат нельзя сохранять даже при уже завершившемся запросе.
      shouldCommit: isAutomaticSummaryEnabled,
      onProgress: progressCallbacks.onProgress,
      onAttemptStart: progressCallbacks.onAttemptStart,
      onAttemptEnd: progressCallbacks.onAttemptEnd,
      onStopped: () => {
        stopped = true;
      },
    });
    if (result !== null) {
      toastSummarySuccess(UI.summary.autoSuccess);
    } else if (stopped) {
      toastSummaryInfo(UI.summary.autoStopped);
    }
  } catch (err) {
    console.error("Story Manager: Error generating summary", err);
    toastSummaryError(UI.summary.autoError, err);
  } finally {
    automaticSummaryInProgress = false;
    clearSummaryProgressToast();
  }
}
