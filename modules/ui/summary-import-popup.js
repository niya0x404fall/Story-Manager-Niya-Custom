import { injectAllEntities } from "../injection.js";
import { createFromTemplate } from "../templates.js";
import { fmt, UI } from "../ui-text.js";
import { applySummaryImportBuiltinPopupText } from "./apply-ui-text.js";
import { mountStoryManagerModal } from "./modal-root.js";
import {
  closeStoryManagerPopup,
  openStoryManagerPopup,
} from "./popup-state.js";
import { getContext } from "../../../../../extensions.js";
import { formatChunkTitle, getSortedSummaryChunks } from "../summary-chunks.js";
import { renderSummary } from "./summary-list.js";
import {
  toastSummaryError,
  toastSummarySuccess,
  toastSummaryWarning,
} from "./toasts.js";

let summaryImportBuiltinPopupInitialized = false;
let $summaryImportBuiltinPopup = null;

function hideSummaryImportBuiltinPopup() {
  if ($summaryImportBuiltinPopup?.length) {
    closeStoryManagerPopup($summaryImportBuiltinPopup);
  }
}

function ensureSummaryImportBuiltinPopup() {
  if (summaryImportBuiltinPopupInitialized) {
    return $summaryImportBuiltinPopup;
  }

  $summaryImportBuiltinPopup = createFromTemplate(
    "story-manager-summary-import-builtin-popup-template",
  );
  applySummaryImportBuiltinPopupText($summaryImportBuiltinPopup);
  mountStoryManagerModal($summaryImportBuiltinPopup);

  $summaryImportBuiltinPopup
    .find(".story-summary-import-builtin-close, .story-summary-import-builtin-backdrop")
    .on("click", () => hideSummaryImportBuiltinPopup());

  $summaryImportBuiltinPopup
    .find("#story-summary-import-builtin-confirm-btn")
    .on("click", async function () {
      const $btn = $(this);
      $btn.prop("disabled", true);

      try {
        const { importBuiltinSummaryAsChunk } = await import("../summary-actions.js");
        hideSummaryImportBuiltinPopup();

        const result = await importBuiltinSummaryAsChunk();
        await renderSummary();
        injectAllEntities();
        const { updateSummaryIndicators } = await import("../buttons.js");
        updateSummaryIndicators();

        const endMes = result.endMes;
        const rangeLabel = formatChunkTitle(0, endMes);
        toastSummarySuccess(
          result.updated
            ? fmt.summaryImportBuiltinUpdate(rangeLabel)
            : fmt.summaryImportBuiltinCreate(rangeLabel),
        );
      } catch (err) {
        toastSummaryError(UI.common.error, err);
        console.error("Story Manager: import builtin summary failed", err);
      } finally {
        $btn.prop("disabled", false);
      }
    });

  summaryImportBuiltinPopupInitialized = true;
  return $summaryImportBuiltinPopup;
}

export function showSummaryImportBuiltinPopup() {
  const chatLength = getContext()?.chat?.length || 0;

  if (!chatLength) {
    toastSummaryWarning(UI.common.chatNoMessages);
    return;
  }

  const endMes = chatLength - 1;
  const chunks = getSortedSummaryChunks();
  const hasFullRange = chunks.some(
    (chunk) => chunk.startMes === 0 && chunk.endMes === endMes,
  );
  const $popup = ensureSummaryImportBuiltinPopup();
  const rangeLabel = formatChunkTitle(0, endMes);
  const t = UI.summary.popup.importBuiltin;

  let desc;
  let confirmLabel;

  if (hasFullRange) {
    desc = fmt.summaryImportBuiltinReplaceDesc(rangeLabel);
    confirmLabel = t.confirmReplace;
  } else if (chunks.length > 0) {
    desc = fmt.summaryImportBuiltinCreateWithExistingDesc(rangeLabel);
    confirmLabel = t.confirmImport;
  } else {
    desc = fmt.summaryImportBuiltinCreateDesc(rangeLabel);
    confirmLabel = t.confirmImport;
  }

  $popup.find("#story-summary-import-builtin-desc").text(desc);
  $popup.find("#story-summary-import-builtin-confirm-btn").text(confirmLabel);
  openStoryManagerPopup($popup);
}
