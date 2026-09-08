import { refreshImageButtons, updateSummaryIndicators } from "../modules/buttons.js";
import { hasActiveChat } from "../app/runtime-context.js";

export function bindImageEvents(eventSource, eventTypes) {
  eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, async (mesId, renderType) => {
    if (!hasActiveChat()) {
      return;
    }

    if (mesId !== undefined && mesId !== null) {
      const context = SillyTavern.getContext();
      const message = context?.chat?.[mesId];

      if (message && !message.is_user) {
        const {
          applyImageBlockToMessage,
          clearImagePocketForGeneration,
          hasStoredImageState,
          isSwipeGenerationPlaceholder,
        } = await import("../modules/image-pocket.js");

        if (renderType === "swipe" && isSwipeGenerationPlaceholder(message, mesId)) {
          clearImagePocketForGeneration(message);
        } else if (renderType !== "swipe" && hasStoredImageState(message)) {
          await applyImageBlockToMessage(mesId);
        }
      }

      const { scheduleAutoImageBlockGeneration } = await import("../modules/image-actions.js");
      scheduleAutoImageBlockGeneration(mesId, renderType);
    }
  });

  eventSource.on(eventTypes.MESSAGE_RECEIVED, async (mesId, renderType) => {
    if (!hasActiveChat() || mesId === undefined || mesId === null) {
      return;
    }

    const context = SillyTavern.getContext();
    const message = context?.chat?.[mesId];
    if (!message || message.is_user) {
      return;
    }

    const { scheduleAutoImageBlockGeneration } = await import("../modules/image-actions.js");
    scheduleAutoImageBlockGeneration(mesId, renderType);

    const { repairDisplayTextIfNeeded } = await import("../modules/image-pocket.js");
    await repairDisplayTextIfNeeded(mesId);
  });

  eventSource.on(eventTypes.MESSAGE_UPDATED, async (mesId) => {
    if (!hasActiveChat() || mesId === undefined || mesId === null) {
      return;
    }

    const { repairDisplayTextIfNeeded, syncImageBlockFromRenderedDom } = await import(
      "../modules/image-pocket.js"
    );

    // Во время swiping подтягиваем обновлённый блок из DOM.
    await syncImageBlockFromRenderedDom(mesId);

    if (document.body?.dataset?.swiping === "true") {
      return;
    }

    await repairDisplayTextIfNeeded(mesId);
  });

  eventSource.on(eventTypes.MESSAGE_SWIPED, async (mesId) => {
    if (!hasActiveChat()) {
      return;
    }

    const { scheduleSwipeImageSync } = await import("../modules/image-pocket.js");
    scheduleSwipeImageSync(mesId);

    refreshImageButtons();
    updateSummaryIndicators();
  });

  eventSource.on(eventTypes.MESSAGE_EDITED, async (mesId) => {
    if (!hasActiveChat()) {
      return;
    }

    const { cancelPendingAutoImageBlockGeneration } = await import("../modules/image-actions.js");
    cancelPendingAutoImageBlockGeneration();

    const { flushImageEditorOnMessageEdited } = await import("../modules/ui/image-edit.js");
    await flushImageEditorOnMessageEdited(mesId);

    const { onMessageContentEdited } = await import("../modules/image-pocket.js");
    await onMessageContentEdited(mesId);

    refreshImageButtons();
    updateSummaryIndicators();
  });
}
