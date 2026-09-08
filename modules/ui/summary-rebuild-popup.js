import { createFromTemplate } from "../templates.js";
import { fmt, UI } from "../ui-text.js";
import { applySummaryRebuildPopupText } from "./apply-ui-text.js";
import { mountStoryManagerModal } from "./modal-root.js";
import {
  closeStoryManagerPopup,
  openStoryManagerPopup,
} from "./popup-state.js";
import { getSettings } from "../settings.js";
import { getContext } from "../../../../../extensions.js";
import { getSummaryRebuildRequestCount } from "../summary-chunks.js";
import {
  GENERATION_BUSY_MESSAGE,
  isGenerationInProgress,
  showGenerationBusyToast,
} from "../generation-state.js";
import {
  clearSummaryProgressToast,
  createSummaryBatchCallbacks,
} from "./summary-progress-toast.js";
import {
  toastSummaryError,
  toastSummarySuccess,
  toastSummaryWarning,
} from "./toasts.js";

let summaryRebuildPopupInitialized = false;
let $summaryRebuildPopup = null;

function sanitizeSummaryDateInput($input) {
  const maxLength = Number.parseInt($input.attr("maxlength"), 10);
  const limit = Number.isFinite(maxLength) ? maxLength : 4;
  const digits = String($input.val() ?? "").replace(/\D/g, "").slice(0, limit);

  if ($input.val() !== digits) {
    $input.val(digits);
  }
}

function readSummaryRebuildEventStartDate($popup) {
  const day = $popup.find("#story-summary-rebuild-start-day").val().trim();
  const month = $popup.find("#story-summary-rebuild-start-month").val().trim();
  const year = $popup.find("#story-summary-rebuild-start-year").val().trim();

  if (!day || !month || !year) {
    return null;
  }

  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(day)}.${pad(month)}.${year}`;
}

function clearSummaryRebuildDateFields($popup) {
  $popup
    .find(
      "#story-summary-rebuild-start-day, #story-summary-rebuild-start-month, #story-summary-rebuild-start-year",
    )
    .val("");
}

function hideSummaryRebuildPopup() {
  if ($summaryRebuildPopup?.length) {
    closeStoryManagerPopup($summaryRebuildPopup);
  }
}

function ensureSummaryRebuildPopup() {
  if (summaryRebuildPopupInitialized) {
    return $summaryRebuildPopup;
  }

  $summaryRebuildPopup = createFromTemplate("story-manager-summary-rebuild-popup-template");
  applySummaryRebuildPopupText($summaryRebuildPopup);
  mountStoryManagerModal($summaryRebuildPopup);

  $summaryRebuildPopup.find(".story-summary-rebuild-date-input").on("input", function () {
    sanitizeSummaryDateInput($(this));
  });

  $summaryRebuildPopup.find(".story-summary-rebuild-close, .story-summary-rebuild-backdrop").on(
    "click",
    () => hideSummaryRebuildPopup(),
  );

  $summaryRebuildPopup.find("#story-summary-rebuild-confirm-btn").on("click", async function () {
    const $btn = $(this);
    $btn.prop("disabled", true);

    try {
      const { rebuildSummaryFromScratch } = await import("../summary-actions.js");

      if (isGenerationInProgress()) {
        showGenerationBusyToast();
        return;
      }

      const eventStartDate = readSummaryRebuildEventStartDate($summaryRebuildPopup);

      hideSummaryRebuildPopup();
      clearSummaryProgressToast();

      const result = await rebuildSummaryFromScratch(
        createSummaryBatchCallbacks(UI.summary.rebuildBatchTitle),
        { eventStartDate },
      );

      clearSummaryProgressToast();
      const created = result.completed;
      if (result.stopped) {
        toastSummarySuccess(fmt.summaryStoppedPreserved(created));
        return;
      }
      toastSummarySuccess(
        created === 1
          ? fmt.summaryRebuildSuccessOne()
          : fmt.summaryRebuildSuccessMany(created),
      );
    } catch (err) {
      clearSummaryProgressToast();
      if (err?.message === GENERATION_BUSY_MESSAGE) {
        showGenerationBusyToast();
      } else {
        const normalizedError =
          err?.message === UI.summary.aborted
            ? new Error(UI.common.operationAborted)
            : err;
        toastSummaryError(UI.summary.rebuildError, normalizedError);
      }
      console.error("Story Manager: rebuild summary failed", err);
    } finally {
      $btn.prop("disabled", false);
    }
  });

  summaryRebuildPopupInitialized = true;
  return $summaryRebuildPopup;
}

export function showSummaryRebuildPopup() {
  const chatLength = getContext()?.chat?.length || 0;
  const requestCount = getSummaryRebuildRequestCount();

  if (!chatLength) {
    toastSummaryWarning(UI.common.chatNoMessagesForSummary);
    return;
  }

  const $popup = ensureSummaryRebuildPopup();

  $popup.find("#story-summary-rebuild-request-info").html(
    fmt.summaryRebuildRequestInfo(
      requestCount,
      fmt.requestCountWord(requestCount),
      getSettings().summaryInterval,
      chatLength,
    ),
  );

  clearSummaryRebuildDateFields($popup);
  openStoryManagerPopup($popup);
}
