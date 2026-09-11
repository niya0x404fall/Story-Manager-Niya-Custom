import { maybeGenerateSummary } from "../app/summary-auto.js";
import { hasActiveChat } from "../app/runtime-context.js";

export function bindSummaryEvents(eventSource, eventTypes) {
  const checkAutomaticSummary = async (messageId) => {
    if (!hasActiveChat()) {
      return;
    }

    await maybeGenerateSummary(messageId);
  };

  eventSource.on(eventTypes.USER_MESSAGE_RENDERED, checkAutomaticSummary);
  eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, checkAutomaticSummary);
}
