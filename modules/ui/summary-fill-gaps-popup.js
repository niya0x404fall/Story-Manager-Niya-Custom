import { createFromTemplate } from "../templates.js";
import { fmt, UI } from "../ui-text.js";
import { applySummaryFillGapsPopupText } from "./apply-ui-text.js";
import { mountStoryManagerModal } from "./modal-root.js";
import {
  closeStoryManagerPopup,
  openStoryManagerPopup,
} from "./popup-state.js";
import { getSettings } from "../settings.js";
import { getContext } from "../../../../../extensions.js";
import {
  formatChunkTitle,
  getSummaryFillGapsPlan,
  getUncoveredSummaryGaps,
} from "../summary-chunks.js";
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
  toastSummaryInfo,
  toastSummaryWarning,
} from "./toasts.js";

let summaryFillGapsPopupInitialized = false;
let $summaryFillGapsPopup = null;

function formatFillGapsRangesPreview(plan, maxRanges = 5) {
  if (!plan.length) {
    return "";
  }

  const parts = plan.slice(0, maxRanges).map((range) => formatChunkTitle(range.start, range.end));
  if (plan.length > maxRanges) {
    parts.push(fmt.summaryFillGapsRangesMore(plan.length - maxRanges));
  }

  return fmt.summaryFillGapsRanges(parts);
}

function hideSummaryFillGapsPopup() {
  if ($summaryFillGapsPopup?.length) {
    closeStoryManagerPopup($summaryFillGapsPopup);
  }
}

function ensureSummaryFillGapsPopup() {
  if (summaryFillGapsPopupInitialized) {
    return $summaryFillGapsPopup;
  }

  $summaryFillGapsPopup = createFromTemplate("story-manager-summary-fill-gaps-popup-template");
  applySummaryFillGapsPopupText($summaryFillGapsPopup);
  mountStoryManagerModal($summaryFillGapsPopup);

  $summaryFillGapsPopup
    .find(".story-summary-fill-gaps-close, .story-summary-fill-gaps-backdrop")
    .on("click", () => hideSummaryFillGapsPopup());

  $summaryFillGapsPopup.find("#story-summary-fill-gaps-confirm-btn").on("click", async function () {
    const $btn = $(this);
    $btn.prop("disabled", true);

    try {
      const { fillSummaryGaps } = await import("../summary-actions.js");

      if (isGenerationInProgress()) {
        showGenerationBusyToast();
        return;
      }

      hideSummaryFillGapsPopup();
      clearSummaryProgressToast();

      const result = await fillSummaryGaps(
        createSummaryBatchCallbacks(UI.summary.fillGapsBatchTitle),
      );

      clearSummaryProgressToast();
      const created = result.completed;
      if (result.stopped) {
        toastSummarySuccess(fmt.summaryStoppedPreserved(created));
        return;
      }
      toastSummarySuccess(
        fmt.summaryFillGapsSuccess(created, fmt.cardCountWord(created)),
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
        toastSummaryError(UI.summary.fillGapsError, normalizedError);
      }
      console.error("Story Manager: fill summary gaps failed", err);
    } finally {
      $btn.prop("disabled", false);
    }
  });

  summaryFillGapsPopupInitialized = true;
  return $summaryFillGapsPopup;
}

export function showSummaryFillGapsPopup() {
  const chatLength = getContext()?.chat?.length || 0;
  const interval = getSettings().summaryInterval;
  const gapCount = getUncoveredSummaryGaps(chatLength).length;
  const plan = getSummaryFillGapsPlan(chatLength, interval);
  const requestCount = plan.length;

  if (!chatLength) {
    toastSummaryWarning(UI.common.chatNoMessagesForSummary);
    return;
  }

  if (requestCount === 0) {
    toastSummaryInfo(UI.summary.noGaps);
    return;
  }

  const $popup = ensureSummaryFillGapsPopup();

  $popup.find("#story-summary-fill-gaps-request-info").html(
    fmt.summaryFillGapsRequestInfo(
      gapCount,
      fmt.gapCountWord(gapCount),
      requestCount,
      fmt.requestCountWord(requestCount),
      interval,
    ),
  );

  const rangesPreview = formatFillGapsRangesPreview(plan);
  $popup
    .find("#story-summary-fill-gaps-ranges-info")
    .text(rangesPreview)
    .toggle(Boolean(rangesPreview));

  openStoryManagerPopup($popup);
}
