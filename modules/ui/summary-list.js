import { getContext } from "../../../../../extensions.js";
import { getEntities, updateEntity } from "../entities.js";
import { createFromTemplate } from "../templates.js";
import { UI } from "../ui-text.js";
import {
  applySummaryChunkEditFormText,
  applySummaryChunkItemTemplateText,
} from "./apply-ui-text.js";
import {
  CARD_LIST_EXPAND_IGNORE,
  renderCardList,
  updateTokenCountLabel,
} from "./card-list.js";
import {
  CHUNK_TYPE,
  formatChunkTitle,
  isSummaryPlaceholderChunk,
  getCombinedChunkText,
  getSortedSummaryChunks,
  hasCompressionBackup,
} from "../summary-chunks.js";
import { captureEditedSummarySources, captureManuallyBoundSummarySources, getVisibleExcludedSummarySourceIds } from "../summary-sources.js";
import { hasBoundSummarySources } from "../summary-integrity.js";
import { reconcileSummaryHistory } from "../summary-history.js";
import { injectAllEntities } from "../injection.js";
import { GENERATION_TYPE, tryStartGeneration, finishGeneration, isGenerationInProgress, showGenerationBusyToast } from "../generation-state.js";
import { chooseSummaryRegenerationSources } from "./summary-source-popup.js";
import {
  toastInfo,
  toastSummaryError,
  toastSummaryStart,
  toastSummarySuccess,
  toastSummaryWarning,
} from "./toasts.js";

const SUMMARY_EXPAND_IGNORE = `${CARD_LIST_EXPAND_IGNORE}, .story-summary-chunk-stale-icon, .story-summary-chunk-uncovered-icon`;

function decorateSummaryChunk($item, chunk) {
  applySummaryChunkItemTemplateText($item);

  const isPlaceholder = isSummaryPlaceholderChunk(chunk);
  const isCompressed = chunk.type === CHUNK_TYPE.COMPRESSED;
  const compressedRange = Array.isArray(chunk.sourceRanges) && chunk.sourceRanges.length
    ? chunk.sourceRanges
        .map((range) => formatChunkTitle(range.start, range.end))
        .join(", ")
    : formatChunkTitle(chunk.startMes, chunk.endMes);
  const compressedShortRange = Array.isArray(chunk.sourceRanges) && chunk.sourceRanges.length > 1
    ? formatChunkTitle(
        Math.min(...chunk.sourceRanges.map((range) => range.start)),
        Math.max(...chunk.sourceRanges.map((range) => range.end)),
      )
    : compressedRange;
  const title = isPlaceholder
    ? formatChunkTitle(chunk.startMes, chunk.endMes)
    : isCompressed
      ? `${UI.summary.compressedShortTitlePrefix} · ${compressedShortRange}`
      : formatChunkTitle(chunk.startMes, chunk.endMes);

  $item.toggleClass("story-summary-chunk-compressed", isCompressed);
  $item.toggleClass("story-summary-chunk-placeholder", isPlaceholder);
  $item
    .find(".story-summary-chunk-title")
    .text(title)
    .attr("title", isCompressed ? `${UI.summary.compressedTitlePrefix}: ${compressedRange}` : title);
  $item.find(".story-summary-chunk-body").text(isPlaceholder ? "" : chunk.text);

  const isStale = !isPlaceholder && chunk.contextValid === false;
  $item.toggleClass("story-summary-chunk-stale", isStale);
  $item.find(".story-summary-chunk-stale-icon").toggle(isStale);
  $item.find(".story-summary-chunk-uncovered-icon").toggle(isPlaceholder);
  $item
    .find(".story-summary-chunk-toggle-checkbox")
    .prop("disabled", isStale)
    .attr("title", isStale ? UI.summary.chunkStaleTitle : "");

  $item
    .find(".story-summary-chunk-regenerate-btn, .story-summary-chunk-edit-btn")
    .toggle(!isPlaceholder);
  $item.find(".story-summary-compressed-badge").toggle(isCompressed);
  $item.find(".story-summary-chunk-select-checkbox").toggle(!isPlaceholder && !isStale);
  $item.find(".story-summary-source-hint").remove();
  const excluded = getVisibleExcludedSummarySourceIds(getContext()?.chat || [], chunk);
  if (!isPlaceholder && !isStale && excluded.length) {
    $("<p class='story-summary-source-hint'></p>")
      .text(`${excluded.length} видимых сообщений вне исходников. Карточка активна. ↻ → «Только видимые сейчас» или «Заполнить пробелы».`)
      .insertAfter($item.find(".story-summary-chunk-header"));
  } else if (!isPlaceholder && !isStale && !hasBoundSummarySources(chunk)) {
    const $hint = $("<p class='story-summary-source-hint'></p>");
    $hint.append(document.createTextNode("Состав исходников не сохранён. "));
    $("<button type='button' class='story-summary-bind-sources-btn'></button>")
      .text("Привязать видимые без запроса")
      .appendTo($hint);
    $hint.insertAfter($item.find(".story-summary-chunk-header"));
  }
}

function updateSummaryTokenCountFromChunks() {
  return updateTokenCountLabel("#story-summary-token-count", getCombinedChunkText);
}

function updateSummaryStaleHint() {
  const hasStaleChunks = getSortedSummaryChunks().some(
    (chunk) => !isSummaryPlaceholderChunk(chunk) && chunk.contextValid === false,
  );
  $(".story-summary-stale-hint").toggleClass("story-manager-hidden", !hasStaleChunks);
}

function enterSummaryEditMode(chunkId) {
  const chatMetadataRef = getContext().chatMetadata;
  const chunk = getEntities("summaryChunks").find((item) => item.id === chunkId);
  if (!chunk) {
    return;
  }
  const originalText = chunk.text;

  const $item = $(`.story-summary-chunk-item[data-summary-chunk-id="${chunkId}"]`);
  $item.find(".story-note-actions").hide();
  $item.find(".story-summary-chunk-body").remove();

  const $editForm = createFromTemplate("story-manager-summary-chunk-edit-template");
  applySummaryChunkEditFormText($editForm);
  $editForm.find(".story-summary-chunk-body-edit").val(chunk.text);
  $item.find(".story-summary-chunk-header").after($editForm);

  $editForm.find(".story-summary-chunk-save-btn").on("click", async () => {
    const newText = $editForm.find(".story-summary-chunk-body-edit").val().trim();
    if (!newText) {
      return;
    }

    if (getContext().chatMetadata !== chatMetadataRef) return;
    reconcileSummaryHistory();
    const current = getEntities("summaryChunks").find((item) => item.id === chunkId);
    if (!current || current.text !== originalText) {
      toastSummaryWarning("Карточка изменилась или удалена. Откройте её заново перед сохранением.");
      return;
    }
    const updates = {
      text: newText,
      contextValid: true,
      sourceUnavailable: false,
      ...captureEditedSummarySources(getContext().chat, current),
    };
    if (chunk.type === CHUNK_TYPE.COMPRESSED) {
      // Повторное сокращение должно использовать уже исправленный пользователем текст.
      updates.sourceText = newText;
    }
    updateEntity("summaryChunks", chunkId, updates);
    injectAllEntities();
    await renderSummary();
  });

  $editForm.find(".story-summary-chunk-cancel-btn").on("click", () => renderSummary());
}

const SUMMARY_CARD_LIST_CONFIG = {
  namespace: "storyManagerSummary",
  containerSelector: "#story-summary-chunks-container",
  entityType: "summaryChunks",
  // Placeholder хранит внутренний якорь старой истории. Это не саммари и не
  // пользовательская карточка, поэтому показывать пустой диапазон вроде 0—0
  // в списке не нужно.
  getItems: () =>
    getSortedSummaryChunks().filter((chunk) => !isSummaryPlaceholderChunk(chunk)),
  emptyHtml: `<i>${UI.settings.summary.empty}</i>`,
  templateId: "story-manager-summary-chunk-item-template",
  itemSelector: ".story-summary-chunk-item",
  idAttribute: "data-summary-chunk-id",
  headerSelector: ".story-summary-chunk-header",
  bodySelector: ".story-summary-chunk-body",
  checkboxSelector: ".story-summary-chunk-toggle-checkbox",
  deleteSelector: ".story-summary-chunk-delete-btn",
  expandSelector: ".story-summary-chunk-toggle-expand",
  expandIgnoreSelector: SUMMARY_EXPAND_IGNORE,
  getTitle: (chunk) => formatChunkTitle(chunk.startMes, chunk.endMes),
  decorateItem: decorateSummaryChunk,
  onBeforeRender: async () => {
    $("#story-summary-rollback-btn").toggleClass(
      "story-manager-hidden",
      !hasCompressionBackup(),
    );
  },
  onAfterToggle: () => updateSummaryTokenCountFromChunks(),
  onAfterDelete: async () => {
    const { updateSummaryIndicators } = await import("../buttons.js");
    updateSummaryIndicators();
    toastInfo(UI.summary.cardDeleted);
  },
  onAfterRender: async () => {
    updateSummaryStaleHint();
    await updateSummaryTokenCountFromChunks();
  },
  actions: [
    {
      selector: ".story-summary-bind-sources-btn",
      handler: async (_e, { id, reRender }) => {
        const context = getContext();
        const metadataRef = context?.chatMetadata;
        const chunk = getEntities("summaryChunks").find((item) => item.id === id);
        if (!chunk || hasBoundSummarySources(chunk)) return;
        const originalText = chunk.text;
        const originalRanges = JSON.stringify({ start: chunk.startMes, end: chunk.endMes, ranges: chunk.sourceRanges });
        let before;
        try {
          before = captureManuallyBoundSummarySources(context.chat, chunk);
        } catch (err) {
          toastSummaryWarning(err.message);
          return;
        }
        if (!window.confirm(
          `Привязать ${before.sourceMessageStates.length} видимых сообщений к карточке ${chunk.startMes} — ${chunk.endMes}? ` +
          "Это не проверяет, что текст саммари действительно описывает все эти сообщения. Запросов к модели не будет.",
        )) return;
        const current = getEntities("summaryChunks").find((item) => item.id === id);
        let after;
        try {
          after = current && captureManuallyBoundSummarySources(getContext().chat, current);
        } catch (_err) {
          // Сообщения могли стать скрытыми во время подтверждения.
        }
        if (getContext()?.chatMetadata !== metadataRef || current !== chunk ||
            hasBoundSummarySources(current) || !after ||
            current.text !== originalText ||
            JSON.stringify({ start: current.startMes, end: current.endMes, ranges: current.sourceRanges }) !== originalRanges ||
            JSON.stringify(after) !== JSON.stringify(before)) {
          toastSummaryWarning("Чат или сообщения изменились. Откройте карточку заново.");
          return;
        }
        updateEntity("summaryChunks", id, before);
        await reRender();
        toastInfo("Видимые сообщения привязаны без запроса к модели.");
      },
    },
    {
      selector: ".story-summary-chunk-stale-icon",
      handler: () => toastSummaryWarning(UI.summary.chunkStaleHelp),
    },
    {
      selector: ".story-summary-chunk-regenerate-btn",
      handler: async (e, { id, reRender }) => {
        const $btn = $(e.currentTarget);
        let token = null;

        try {
          if (isGenerationInProgress()) { showGenerationBusyToast(); return; }
          reconcileSummaryHistory();
          const context = getContext();
          const metadataRef = context.chatMetadata;
          const chunk = getEntities("summaryChunks").find((item) => item.id === id);
          if (!chunk) return;
          const sourceMode = await chooseSummaryRegenerationSources(context.chat, chunk);
          if (!sourceMode) return;
          if (getContext().chatMetadata !== metadataRef) {
            toastSummaryWarning("Чат сменился. Откройте нужную карточку заново.");
            return;
          }
          token = tryStartGeneration({ type: GENERATION_TYPE.SUMMARY, owner: "summary-regenerate" });
          if (!token) { showGenerationBusyToast(); return; }
          $btn.addClass("fa-spin");
          toastSummaryStart(UI.summary.regenerateStart);
          const { regenerateSummaryChunk } = await import("../generators/summary.js");
          if (getContext().chatMetadata !== metadataRef) {
            throw new Error("Чат сменился до начала запроса. Откройте карточку заново.");
          }
          await regenerateSummaryChunk(id, { sourceMode });
          injectAllEntities();
          await reRender();
          toastSummarySuccess(UI.summary.regenerateSuccess);
        } catch (err) {
          toastSummaryError(UI.summary.regenerateError, err);
        } finally {
          if (token) finishGeneration(token);
          $btn.removeClass("fa-spin");
        }
      },
    },
    {
      selector: ".story-summary-chunk-edit-btn",
      handler: (_e, { id }) => enterSummaryEditMode(id),
    },
  ],
};

export async function renderSummary() {
  await renderCardList(SUMMARY_CARD_LIST_CONFIG);
}
