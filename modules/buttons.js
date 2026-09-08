import { eventSource, event_types } from "../../../../../script.js";
import { createFromTemplate } from "./templates.js";
import { getSettings } from "./settings.js";
import {
  getPendingVisibleMessageCount,
  getVisibleMessagesUntilNext,
} from "./summary-chunks.js";
import { generateNote } from "./generators/note.js";
import { generateCharacter } from "./generators/character.js";
import { generateLocation } from "./generators/location.js";
import { updateEntityButtonTooltips } from "./message-context.js";
import { injectAllEntities } from "./injection.js";
import { renderNotes } from "./ui/notes.js";
import { renderCharacters } from "./ui/characters.js";
import { renderLocations } from "./ui/locations.js";
import {
  GENERATION_TYPE,
  forceResetGenerationState,
  getGenerationBusyTooltip,
  isGenerationInProgress,
  showGenerationBusyToast,
  tryStartGeneration,
  finishGeneration,
} from "./generation-state.js";
import { fmt, UI } from "./ui-text.js";
import {
  toastEntityError,
  toastEntityStart,
  toastEntitySuccess,
  toastInfo,
  toastSummaryError,
  toastSummaryStart,
  toastSummarySuccess,
  toastWarning,
} from "./ui/toasts.js";

let isRefreshing = false;
let buttonsInitialized = false;
let chatObserver = null;

/**
 * Заблокировать все кнопки Story Manager
 */
const MESSAGE_BUTTON_SELECTOR =
  ".story-manager-note-btn, .story-manager-char-btn, .story-manager-loc-btn, .story-manager-summary-indicator";

export function lockAllButtons() {
  $(MESSAGE_BUTTON_SELECTOR).addClass("story-manager-busy");
}

/**
 * Разблокировать все кнопки Story Manager
 */
export function unlockAllButtons() {
  $(MESSAGE_BUTTON_SELECTOR).removeClass("story-manager-busy");
}

function resetButtonLockState() {
  forceResetGenerationState();
  unlockAllButtons();
}

function resolveMessageIdFromMesElement(mesElement) {
  const fromAttr = Number.parseInt(mesElement.attr("mesid"), 10);
  if (Number.isInteger(fromAttr) && fromAttr >= 0) {
    return fromAttr;
  }

  const $chat = $("#chat, #chat_container").first();
  const index = $chat.length ? $chat.find(".mes").index(mesElement) : -1;
  if (index >= 0) {
    return index;
  }

  const context = SillyTavern.getContext();
  if (Array.isArray(context?.chat)) {
    const mesText = mesElement.find(".mes_text").text().trim().slice(0, 200);
    if (mesText) {
      const found = context.chat.findIndex(
        (message) => (message?.mes || "").trim().slice(0, 200) === mesText,
      );
      if (found >= 0) {
        return found;
      }
    }
  }

  return Number.NaN;
}

/** Порядок слева направо: саммари → заметка → персонаж → локация */
const MESSAGE_BUTTON_ORDER = [
  ".story-manager-summary-indicator",
  ".story-manager-note-btn",
  ".story-manager-char-btn",
  ".story-manager-loc-btn",
];

function reorderStoryManagerMessageButtons(controls) {
  for (let i = MESSAGE_BUTTON_ORDER.length - 1; i >= 0; i--) {
    const $btn = controls.children(MESSAGE_BUTTON_ORDER[i]);
    if ($btn.length) {
      controls.prepend($btn);
    }
  }
}

/**
 * Добавить кнопки на одно сообщение
 */
function injectButton(mesElement) {
  if (!mesElement || mesElement.length === 0) return;

  const $mesButtons = mesElement.find(".mes_buttons");
  if ($mesButtons.length === 0) return;

  if ($mesButtons.find(".story-manager-note-btn").length === 0) {
    const $noteBtn = createFromTemplate("story-manager-button-template");
    $noteBtn.attr("title", UI.messageButtons.note);
    $mesButtons.prepend($noteBtn);
  }

  if ($mesButtons.find(".story-manager-char-btn").length === 0) {
    $mesButtons.prepend(
      createFromTemplate("story-manager-character-button-template"),
    );
  }

  if ($mesButtons.find(".story-manager-loc-btn").length === 0) {
    $mesButtons.prepend(
      createFromTemplate("story-manager-location-button-template"),
    );
  }

  if ($mesButtons.find(".story-manager-summary-indicator").length === 0) {
    $mesButtons.prepend(
      createFromTemplate("story-manager-summary-indicator-template"),
    );
  }

  reorderStoryManagerMessageButtons($mesButtons);
}

function refreshMessageButtons() {
  $(".mes").each(function () {
    injectButton($(this));
  });
}

function refreshAllButtons() {
  if (isRefreshing) return;
  isRefreshing = true;

  requestAnimationFrame(() => {
    refreshMessageButtons();
    updateEntityButtonTooltips();
    isRefreshing = false;
  });
}

let refreshButtonsTimer = null;

function scheduleRefreshAllButtons() {
  if (refreshButtonsTimer) {
    clearTimeout(refreshButtonsTimer);
  }

  refreshButtonsTimer = setTimeout(() => {
    refreshButtonsTimer = null;
    refreshAllButtons();
  }, 120);
}

function bindMessageButtonHandlers() {
  const $root = $("#chat").length ? $("#chat") : $(document);

  $root.off("click.storyManager");
  $root.on("click.storyManager", ".story-manager-note-btn", onNoteButtonClick);
  $root.on("click.storyManager", ".story-manager-char-btn", onCharButtonClick);
  $root.on("click.storyManager", ".story-manager-loc-btn", onLocButtonClick);
  $root.on(
    "click.storyManager",
    ".story-manager-summary-indicator",
    onSummaryIndicatorClick,
  );
}

export function initButtons() {
  resetButtonLockState();
  bindMessageButtonHandlers();

  if (buttonsInitialized) {
    refreshAllButtons();
    updateEntityButtonTooltips();
    return;
  }

  buttonsInitialized = true;
  refreshAllButtons();

  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (id) => {
    injectButton($(`.mes[mesid="${id}"]`));
    updateEntityButtonTooltips();
  });

  eventSource.on(event_types.USER_MESSAGE_RENDERED, (id) => {
    injectButton($(`.mes[mesid="${id}"]`));
    updateEntityButtonTooltips();
  });

  eventSource.on(event_types.MESSAGE_SWIPED, () => {
    scheduleRefreshAllButtons();
  });

  eventSource.on(event_types.MESSAGE_EDITED, () => {
    scheduleRefreshAllButtons();
  });

  eventSource.on(event_types.MESSAGE_DELETED, () => {
    scheduleRefreshAllButtons();
  });

  const chat = document.getElementById("chat");
  if (chat && !chatObserver) {
    chatObserver = new MutationObserver((mutations) => {
      const shouldRefresh = mutations.some(
        (mutation) =>
          mutation.type === "childList" && mutation.target.id === "chat",
      );
      if (shouldRefresh) {
        scheduleRefreshAllButtons();
      }
    });

    chatObserver.observe(chat, {
      childList: true,
      subtree: false,
      attributes: false,
    });
  }

  updateEntityButtonTooltips();
}

async function handleGenerationClick({
  button,
  buttonClass,
  generationType,
  generator,
  onSuccess,
  startToast,
  successToast,
  errorToast,
  invalidMessageMessage,
}) {
  const mesElement = $(button).closest(".mes");
  if (!mesElement.length) {
    toastWarning(invalidMessageMessage || UI.buttons.messageNotFound);
    return;
  }

  const messageId = resolveMessageIdFromMesElement(mesElement);
  if (!Number.isInteger(messageId)) {
    toastWarning(
      invalidMessageMessage || UI.buttons.messageIdUnknown,
    );
    return;
  }

  const generationToken = tryStartGeneration({
    type: generationType,
    owner: buttonClass,
  });
  if (!generationToken) {
    showGenerationBusyToast();
    return;
  }

  if (startToast) {
    toastEntityStart(startToast);
  }

  const $button = $(button);
  const originalClasses = $button.attr("class");

  lockAllButtons();
  $button.attr(
    "class",
    `${buttonClass} mes_button fa-solid fa-spinner fa-spin`,
  );

  try {
    const result = await generator(messageId);

    if (result === false) {
      throw new Error("Generation returned no result");
    }

    await onSuccess();
    if (successToast) {
      toastEntitySuccess(successToast);
    }
  } catch (err) {
    console.error("Story Manager: generation failed", err);
    const fallbackError = UI.buttons.operationFailed;
    toastEntityError(errorToast || fallbackError, err);
  } finally {
    $button.attr("class", originalClasses);
    unlockAllButtons();
    finishGeneration(generationToken);
  }
}

async function onNoteButtonClick() {
  await handleGenerationClick({
    button: this,
    buttonClass: "story-manager-note-btn",
    generationType: GENERATION_TYPE.NOTE,
    generator: generateNote,
    startToast: UI.buttons.note.start,
    onSuccess: async () => {
      renderNotes();
      injectAllEntities();
    },
    successToast: UI.buttons.note.success,
    errorToast: UI.buttons.note.error,
  });
}

async function onCharButtonClick() {
  await handleGenerationClick({
    button: this,
    buttonClass: "story-manager-char-btn",
    generationType: GENERATION_TYPE.CHARACTER,
    generator: generateCharacter,
    startToast: UI.buttons.character.start,
    onSuccess: async () => {
      renderCharacters();
    },
    successToast: UI.buttons.character.success,
    errorToast: UI.buttons.character.error,
  });
}

async function onLocButtonClick() {
  await handleGenerationClick({
    button: this,
    buttonClass: "story-manager-loc-btn",
    generationType: GENERATION_TYPE.LOCATION,
    generator: generateLocation,
    startToast: UI.buttons.location.start,
    onSuccess: async () => {
      renderLocations();
    },
    successToast: UI.buttons.location.success,
    errorToast: UI.buttons.location.error,
  });
}

export function updateSummaryIndicators() {
  const context = SillyTavern.getContext();
  if (!context || !context.chat) return;

  const settings = getSettings();
  const messagesUntilNext = Math.max(
    0,
    getVisibleMessagesUntilNext(settings.summaryInterval, context.chat),
  );
  const pending = getPendingVisibleMessageCount(context.chat);

  const tooltipText =
    messagesUntilNext > 0
      ? fmt.summaryUntil(messagesUntilNext, pending)
      : isGenerationInProgress()
        ? getGenerationBusyTooltip()
        : pending > 0
          ? UI.buttons.summary.readyToUpdate
          : UI.buttons.summary.upToDate;

  $(".story-manager-summary-indicator").attr("title", tooltipText);
}

export function setSummaryGenerating(isActive) {
  if (isActive) {
    $(".story-manager-summary-indicator")
      .removeClass("fa-book")
      .addClass("fa-spinner fa-spin");
  } else {
    updateSummaryIndicators();
    $(".story-manager-summary-indicator")
      .removeClass("fa-spinner fa-spin")
      .addClass("fa-book");
  }
}

async function onSummaryIndicatorClick() {
  const context = SillyTavern.getContext();
  if (!context || !context.chat) {
    toastInfo(UI.buttons.summary.unavailableOutsideChat);
    return;
  }

  const settings = getSettings();
  const messagesUntilNext = Math.max(
    0,
    getVisibleMessagesUntilNext(settings.summaryInterval, context.chat),
  );

  if (messagesUntilNext > 0) {
    toastInfo(fmt.summaryCountdown(messagesUntilNext));
    return;
  }

  try {
    toastSummaryStart(UI.buttons.summary.start);
    const { runSummaryChunkGeneration } = await import("./summary-actions.js");
    const result = await runSummaryChunkGeneration();
    if (result === null) {
      if (isGenerationInProgress()) {
        showGenerationBusyToast();
      } else {
        toastInfo(UI.buttons.summary.noNewMessages);
      }
      return;
    }
    toastSummarySuccess(UI.buttons.summary.success);
  } catch (err) {
    toastSummaryError(UI.buttons.summary.error, err);
  }
}
