import { maybeGenerateSummary } from "../app/summary-auto.js";
import { hasActiveChat } from "../app/runtime-context.js";

export function bindSummaryEvents(eventSource, eventTypes) {
  eventSource.on(eventTypes.USER_MESSAGE_RENDERED, async (messageId) => {
    if (!hasActiveChat()) {
      return;
    }

    await maybeGenerateSummary(messageId);
  });
}
