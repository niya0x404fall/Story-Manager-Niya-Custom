import { injectAllEntities } from "../injection.js";
import { getSettings, saveSettings } from "../settings.js";
import { getContext } from "../../../../../extensions.js";
import { Popup } from "../../../../../popup.js";
import {
  formatChunkTitle,
  formatCompactSummaryRanges,
  getVisibleMessagesUntilNext,
  getOverlappingSummaryChunks,
  getPendingVisibleMessageCount,
  getUncoveredVisibleRangesBefore,
} from "../summary-chunks.js";
import { fmt, UI } from "../ui-text.js";
import { renderSummary } from "./summary-list.js";
import { showSummaryRebuildPopup } from "./summary-rebuild-popup.js";
import { showSummaryFillGapsPopup } from "./summary-fill-gaps-popup.js";
import { showSummaryImportBuiltinPopup } from "./summary-import-popup.js";
import {
  toastSummaryError,
  toastSummaryStart,
  toastSummarySuccess,
  toastSummaryWarning,
} from "./toasts.js";

function updateSummaryInjectionControls($settingsPanel) {
  const position = $settingsPanel.find("#story_manager_summary_injection_position").val();
  $settingsPanel.find(".story-summary-depth-field").toggle(position === "chat_depth");
  $settingsPanel.find(".story-summary-depth-hint").toggle(position === "chat_depth");
}

function updateSummaryAutoControls($settingsPanel) {
  const autoEnabled = $settingsPanel.find("#story_summary_auto_enabled").prop("checked");
  $settingsPanel.find(".story-summary-auto-interval").toggle(autoEnabled);
  $settingsPanel.find("#story_manager_summary_interval").prop("disabled", !autoEnabled);
}

/**
 * Подтянуть в уже нарисованную панель реальные настройки SillyTavern.
 * Это важно при ранней инициализации: сохранённые extension_settings могут
 * загрузиться на мгновение позже самого HTML расширения.
 */
export function refreshSummarySettingsUI($settingsPanel) {
  const settings = getSettings();

  $settingsPanel
    .find("#story_summary_enabled")
    .prop("checked", Boolean(settings.summaryEnabled));
  $settingsPanel
    .find("#story_summary_auto_enabled")
    .prop("checked", Boolean(settings.summaryAutoEnabled));
  $settingsPanel
    .find("#story_manager_summary_interval")
    .val(settings.summaryInterval);
  $settingsPanel
    .find("#story_manager_summary_injection_position")
    .val(settings.summaryInjectionPosition);
  $settingsPanel
    .find("#story_manager_summary_injection_depth")
    .val(settings.summaryInjectionDepth);
  $settingsPanel
    .find("#story_manager_summary_injection_role")
    .val(settings.summaryInjectionRole);

  updateSummaryAutoControls($settingsPanel);
  updateSummaryInjectionControls($settingsPanel);

  if (!settings.summaryAutoEnabled) {
    import("../../app/summary-auto.js").then(({ stopAutomaticSummaryGeneration }) => {
      stopAutomaticSummaryGeneration();
    });
  }
}

function getSelectedSummaryChunkIds($settingsPanel) {
  return $settingsPanel
    .find("#story-summary-chunks-container .story-summary-chunk-select-checkbox:checked")
    .map(function () {
      return Number.parseInt(
        $(this).closest(".story-summary-chunk-item").attr("data-summary-chunk-id"),
        10,
      );
    })
    .get()
    .filter(Number.isInteger);
}

async function handleSummaryIntervalChange(newInterval) {
  const settings = getSettings();
  const previousInterval = settings.summaryInterval;
  const chat = getContext()?.chat || [];
  const untilNext = getVisibleMessagesUntilNext(newInterval, chat);
  const pending = getPendingVisibleMessageCount(chat);

  // Новое значение должно стать рабочим до первого await: иначе запрос,
  // запущенный из подтверждения или соседнего события, успеет прочитать старый
  // интервал из настроек (например, 2 вместо только что введённых 30).
  settings.summaryInterval = newInterval;
  saveSettings();

  if (untilNext <= 0 && pending > 0) {
    const shouldGenerate = confirm(
      fmt.summaryIntervalConfirmBody(pending, newInterval),
    );

    if (shouldGenerate) {
      try {
        const { runSummaryChunkGeneration } = await import("../summary-actions.js");
        toastSummaryStart(UI.buttons.summary.start);
        await runSummaryChunkGeneration({ forcePartial: true });
        toastSummarySuccess(UI.buttons.summary.success);
      } catch (err) {
        settings.summaryInterval = previousInterval;
        saveSettings();
        toastSummaryError(UI.buttons.summary.error, err);
        return false;
      }
    }
  }

  const { updateSummaryIndicators } = await import("../buttons.js");
  updateSummaryIndicators();
  return true;
}

export function initSummaryUI($settingsPanel) {
  const s = UI.settings.summary;

  $settingsPanel
    .find("#story_summary_enabled")
    .on("change", function () {
      getSettings().summaryEnabled = $(this).prop("checked");
      saveSettings();
      injectAllEntities();
    });

  $settingsPanel
    .find("#story_summary_auto_enabled")
    .on("change", function () {
      const enabled = $(this).prop("checked");
      getSettings().summaryAutoEnabled = enabled;
      saveSettings();
      updateSummaryAutoControls($settingsPanel);
      if (!enabled) {
        import("../../app/summary-auto.js").then(({ stopAutomaticSummaryGeneration }) => {
          stopAutomaticSummaryGeneration();
        });
      }
      import("../buttons.js").then(({ updateSummaryIndicators }) => {
        updateSummaryIndicators();
      });
    });

  $settingsPanel
    .find("#story_manager_summary_injection_position")
    .on("change", function () {
      getSettings().summaryInjectionPosition = $(this).val();
      saveSettings();
      updateSummaryInjectionControls($settingsPanel);
      injectAllEntities();
    });

  $settingsPanel
    .find("#story_manager_summary_injection_depth")
    .on("change", function () {
      const depth = Math.min(10000, Math.max(0, Number.parseInt($(this).val(), 10) || 0));
      $(this).val(depth);
      getSettings().summaryInjectionDepth = depth;
      saveSettings();
      injectAllEntities();
    });

  $settingsPanel
    .find("#story_manager_summary_injection_role")
    .on("change", function () {
      getSettings().summaryInjectionRole = $(this).val();
      saveSettings();
      injectAllEntities();
    });

  refreshSummarySettingsUI($settingsPanel);

  const chatLength = getContext()?.chat?.length || 0;
  $settingsPanel
    .find("#story_summary_manual_start, #story_summary_manual_end")
    .attr("max", Math.max(0, chatLength - 1));

  $settingsPanel.find("#story-summary-manual-create-btn").on("click", async function () {
    const $btn = $(this);
    const start = $settingsPanel.find("#story_summary_manual_start").val();
    const end = $settingsPanel.find("#story_summary_manual_end").val();
    const parsedStart = Number.parseInt(start, 10);
    const parsedEnd = Number.parseInt(end, 10);
    const overlaps = getOverlappingSummaryChunks(parsedStart, parsedEnd);

    if (overlaps.length > 0) {
      const overlapLabels = overlaps
        .map((chunk) => formatChunkTitle(chunk.startMes, chunk.endMes))
        .join(", ");
      if (!confirm(fmt.summaryRangeOverlapConfirm(overlapLabels))) {
        return;
      }
    }

    const precedingGaps = getUncoveredVisibleRangesBefore(
      parsedStart,
      getContext()?.chat || [],
    );
    let allowPrecedingGap = false;
    if (precedingGaps.length > 0) {
      allowPrecedingGap = await Popup.show.confirm(
        "Непокрытая история",
        fmt.summaryPrecedingGapConfirm(
          formatCompactSummaryRanges(precedingGaps),
        ),
      );
      if (!allowPrecedingGap) {
        return;
      }
    }

    $btn.prop("disabled", true).text(s.manualInProgress);
    try {
      const { runManualSummaryRange } = await import("../summary-actions.js");
      toastSummaryStart(UI.summary.manualStart);
      await runManualSummaryRange(start, end, { allowPrecedingGap });
      toastSummarySuccess(UI.summary.manualSuccess);
    } catch (err) {
      toastSummaryError(UI.summary.manualError, err);
    } finally {
      $btn.prop("disabled", false).text(s.manualCreate);
    }
  });

  $settingsPanel
    .find("#story-summary-chunks-container")
    .on("change.storyManagerCompressionSelection", ".story-summary-chunk-select-checkbox", function () {
      $(this)
        .closest(".story-summary-chunk-item")
        .toggleClass("story-summary-selected-for-compression", $(this).prop("checked"));
    });

  $settingsPanel
    .find("#story_manager_summary_interval")
    .on("change", async function () {
      const previousInterval = getSettings().summaryInterval;
      const newInterval = Math.max(1, parseInt($(this).val(), 10) || 10);
      $(this).val(newInterval);

      const applied = await handleSummaryIntervalChange(newInterval);
      if (!applied) {
        $(this).val(previousInterval);
      }
    });

  $settingsPanel.find("#story-summary-compress-btn").on("click", async function () {
    const $btn = $(this);
    const selectedIds = getSelectedSummaryChunkIds($settingsPanel);

    if (selectedIds.length === 0) {
      toastSummaryWarning(UI.summary.nothingToCompress);
      return;
    }

    $btn.prop("disabled", true).text(s.compressInProgress);
    try {
      toastSummaryStart(UI.summary.compressStart);
      const { compressSummary } = await import("../generators/summary.js");
      await compressSummary(selectedIds);
      await renderSummary();
      injectAllEntities();
      toastSummarySuccess(UI.summary.compressSuccess);
    } catch (err) {
      toastSummaryError(UI.summary.compressError, err);
    } finally {
      $btn.prop("disabled", false).text(s.compress);
    }
  });

  $settingsPanel.find("#story-summary-rollback-btn").on("click", async function () {
    const $btn = $(this);

    if (!confirm(UI.summary.rollbackConfirm)) {
      return;
    }

    $btn.prop("disabled", true);
    try {
      const { rollbackCompression } = await import("../generators/summary.js");
      rollbackCompression();
      await renderSummary();
      injectAllEntities();
      toastSummarySuccess(UI.summary.rollbackSuccess);
    } catch (err) {
      toastSummaryError(UI.common.error, err);
    } finally {
      $btn.prop("disabled", false);
    }
  });

  $settingsPanel.find("#story-summary-rebuild-btn").on("click", () => {
    showSummaryRebuildPopup();
  });

  $settingsPanel.find("#story-summary-fill-gaps-btn").on("click", () => {
    showSummaryFillGapsPopup();
  });

  $settingsPanel.find("#story-summary-import-builtin-btn").on("click", async function () {
    try {
      const { hasBuiltinSummarizeText } = await import("../summary-actions.js");

      if (!hasBuiltinSummarizeText()) {
        toastSummaryWarning(UI.summary.builtinNotFound);
        return;
      }

      showSummaryImportBuiltinPopup();
    } catch (err) {
      toastSummaryError(UI.common.error, err);
    }
  });
}
