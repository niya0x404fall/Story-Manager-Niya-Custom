import { injectAllEntities } from "../injection.js";
import {
  SUMMARY_CHUNK_MAX_RETRIES,
  SUMMARY_GENERATION_TIMEOUT_MS,
} from "../generation-timeout.js";
import { fmt, UI } from "../ui-text.js";

let summaryProgressToast = null;
let summaryProgressState = null;
let summaryCountdownInterval = null;
let summaryStopRequestedUI = false;

const SUMMARY_COUNTDOWN_SECONDS = Math.round(SUMMARY_GENERATION_TIMEOUT_MS / 1000);

const SUMMARY_PROGRESS_TOAST_OPTIONS = {
  timeOut: 0,
  extendedTimeOut: 0,
  closeButton: false,
  tapToDismiss: false,
  toastClass: "story-summary-progress-toast",
};

function stopSummaryCountdown() {
  if (summaryCountdownInterval) {
    clearInterval(summaryCountdownInterval);
    summaryCountdownInterval = null;
  }
}

function formatCountdown(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function buildSummaryProgressMessage() {
  const state = summaryProgressState;
  if (!state) {
    return "";
  }

  const waitLine =
    state.attempt > 0
      ? fmt.summaryProgressAttempt(
          state.attempt,
          state.maxAttempts,
          formatCountdown(state.secondsLeft),
        )
      : UI.summary.progressPreparing;

  return `${fmt.summaryProgressTitle(state.done, state.total)}\n${waitLine}`;
}

function refreshSummaryProgressToast() {
  const title = summaryProgressState?.title ?? "";
  const message = buildSummaryProgressMessage();

  if (!summaryProgressToast) {
    summaryProgressToast = toastr.info(message, title, SUMMARY_PROGRESS_TOAST_OPTIONS);
  }

  const $toast = $(summaryProgressToast);
  $toast.find(".toast-title").text(title);
  $toast.find(".toast-message").text(message);

  const $stopButton = $("<button>", {
    type: "button",
    class: `story-summary-stop-btn${summaryStopRequestedUI ? " story-summary-stop-btn--stopping" : ""}`,
    title: UI.summary.stopButton,
    "aria-label": UI.summary.stopButton,
    disabled: summaryStopRequestedUI,
  });
  $stopButton.append(
    $("<span>", {
      class: summaryStopRequestedUI
        ? "fa-solid fa-spinner fa-spin"
        : "fa-solid fa-stop",
      "aria-hidden": "true",
    }),
    $("<span>", {
      class: "story-summary-stop-label",
      text: summaryStopRequestedUI
        ? UI.summary.stoppingButton
        : UI.summary.stopButton,
    }),
  );
  $stopButton.on("click", async function (event) {
    event.preventDefault();
    event.stopPropagation();
    const { requestSummaryGenerationStop } = await import("../summary-actions.js");
    if (requestSummaryGenerationStop()) {
      summaryStopRequestedUI = true;
      $(this)
        .prop("disabled", true)
        .addClass("story-summary-stop-btn--stopping");
      $(this)
        .find(".fa-solid")
        .removeClass("fa-stop")
        .addClass("fa-spinner fa-spin");
      $(this).find(".story-summary-stop-label").text(UI.summary.stoppingButton);
    }
  });
  const $actions = $("<div>", {
    class: "story-summary-progress-actions",
  }).append($stopButton);
  $toast.find(".toast-message").append($actions);
}

export function clearSummaryProgressToast() {
  stopSummaryCountdown();
  summaryProgressState = null;
  summaryStopRequestedUI = false;

  if (summaryProgressToast) {
    toastr.clear(summaryProgressToast);
    summaryProgressToast = null;
  }
}

function ensureSummaryProgressState(title) {
  if (!summaryProgressState) {
    summaryProgressState = {
      title,
      done: 0,
      total: 0,
      attempt: 0,
      maxAttempts: SUMMARY_CHUNK_MAX_RETRIES,
      secondsLeft: SUMMARY_COUNTDOWN_SECONDS,
    };
  } else {
    summaryProgressState.title = title;
  }

  return summaryProgressState;
}

function startSummaryCountdown() {
  stopSummaryCountdown();

  if (!summaryProgressState) {
    return;
  }

  summaryProgressState.secondsLeft = SUMMARY_COUNTDOWN_SECONDS;
  refreshSummaryProgressToast();

  summaryCountdownInterval = setInterval(() => {
    if (!summaryProgressState) {
      stopSummaryCountdown();
      return;
    }

    summaryProgressState.secondsLeft = Math.max(0, summaryProgressState.secondsLeft - 1);
    refreshSummaryProgressToast();
  }, 1000);
}

export function createSummaryBatchCallbacks(title) {
  return {
    onProgress: (done, total) => {
      const state = ensureSummaryProgressState(title);
      state.done = done;
      state.total = total;

      if (done === 0) {
        state.attempt = 0;
        stopSummaryCountdown();
      }

      refreshSummaryProgressToast();
    },
    onAttemptStart: (attempt, maxAttempts) => {
      const state = ensureSummaryProgressState(title);
      state.attempt = attempt;
      state.maxAttempts = maxAttempts;
      startSummaryCountdown();
    },
    onAttemptEnd: () => {
      stopSummaryCountdown();
      if (summaryProgressState) {
        summaryProgressState.secondsLeft = SUMMARY_COUNTDOWN_SECONDS;
        refreshSummaryProgressToast();
      }
    },
    onChunkComplete: async () => {
      const { renderSummary } = await import("./summary-list.js");
      await renderSummary();
      injectAllEntities();
    },
  };
}
