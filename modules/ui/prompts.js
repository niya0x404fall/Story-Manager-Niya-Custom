import {
  defaultSettings,
  getSettings,
  saveSettings,
} from "../settings.js";
import { createFromTemplate } from "../templates.js";
import { UI } from "../ui-text.js";
import { applyPromptsPopupText } from "./apply-ui-text.js";
import { mountStoryManagerModal } from "./modal-root.js";
import {
  closeStoryManagerPopup,
  isStoryManagerPopupOpen,
  openStoryManagerPopup,
} from "./popup-state.js";
import { toastEntitySuccess } from "./toasts.js";

const PROMPT_KEYS = [
  "notePrompt",
  "characterPrompt",
  "locationPrompt",
  "summaryPrompt",
  "summaryCompressPrompt",
];

const MOBILE_PROMPTS_MEDIA = window.matchMedia("(max-width: 520px)");

let $popupRoot = null;

function setMobilePromptBlockOpen($popup, $block, open) {
  $popup.find(".story-manager-prompt-block").each(function () {
    const $current = $(this);
    const isOpen = open && this === $block?.[0];
    $current.toggleClass("story-manager-prompt-block-open", isOpen);
    $current
      .find(".story-manager-prompt-block-header")
      .attr("aria-expanded", String(isOpen));
  });
}

function syncMobilePromptBlocks($popup) {
  const $blocks = $popup.find(".story-manager-prompt-block");

  if (!MOBILE_PROMPTS_MEDIA.matches) {
    $blocks.addClass("story-manager-prompt-block-open");
    $blocks
      .find(".story-manager-prompt-block-header")
      .attr("aria-expanded", "true");
    return;
  }

  const $openBlock = $blocks.filter(".story-manager-prompt-block-open").first();
  setMobilePromptBlockOpen($popup, $openBlock, $openBlock.length > 0);
}

function bindMobilePromptBlocks($popup) {
  const $headers = $popup.find(".story-manager-prompt-block-header");
  $headers.attr({
    role: "button",
    tabindex: "0",
    "aria-expanded": "false",
  });

  const toggle = (event) => {
    if (!MOBILE_PROMPTS_MEDIA.matches) {
      return;
    }
    if ($(event.target).closest("[data-prompt-reset]").length) {
      return;
    }

    event.preventDefault();
    const $block = $(event.currentTarget).closest(".story-manager-prompt-block");
    const shouldOpen = !$block.hasClass("story-manager-prompt-block-open");
    setMobilePromptBlockOpen($popup, $block, shouldOpen);

    if (shouldOpen) {
      $block[0]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  $headers
    .off("click.storyManagerMobilePrompts keydown.storyManagerMobilePrompts")
    .on("click.storyManagerMobilePrompts", toggle)
    .on("keydown.storyManagerMobilePrompts", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        toggle(event);
      }
    });

  MOBILE_PROMPTS_MEDIA.addEventListener?.("change", () => {
    syncMobilePromptBlocks($popup);
  });
  syncMobilePromptBlocks($popup);
}

function getPopupRoot() {
  if ($popupRoot?.length) {
    return $popupRoot;
  }

  $popupRoot = createFromTemplate("story-manager-prompts-popup-template");
  applyPromptsPopupText($popupRoot);
  mountStoryManagerModal($popupRoot);
  bindMobilePromptBlocks($popupRoot);
  return $popupRoot;
}

function bindPopupCloseHandlers($popup) {
  const close = () => closeStoryManagerPopup($popup);

  $popup.find(".story-manager-prompts-close").on("click", close);
  $popup.find(".story-manager-prompts-popup-backdrop").on("click", close);

  $(document).on("keydown.storyManagerPrompts", (event) => {
    if (event.key === "Escape" && isStoryManagerPopupOpen($popup)) {
      close();
    }
  });
}

function fillPromptFields($popup) {
  const settings = getSettings();

  PROMPT_KEYS.forEach((key) => {
    $popup.find(`[data-prompt-key="${key}"]`).val(settings[key] ?? "");
  });
}

function bindPromptFields($popup) {
  const settings = getSettings();

  PROMPT_KEYS.forEach((key) => {
    const $field = $popup.find(`[data-prompt-key="${key}"]`);

    $field.off("input.storyManagerPrompts").on("input.storyManagerPrompts", function () {
      settings[key] = $(this).val();
      saveSettings();
    });

    $popup
      .find(`[data-prompt-reset="${key}"]`)
      .off("click.storyManagerPrompts")
      .on("click.storyManagerPrompts", () => {
        const def = defaultSettings[key];
        if (!def) {
          return;
        }

        settings[key] = def;
        $field.val(def);
        saveSettings();
        toastEntitySuccess(UI.prompts.resetOne);
      });
  });

  $popup
    .find("#story_manager_prompts_reset_all")
    .off("click.storyManagerPrompts")
    .on("click.storyManagerPrompts", () => {
      PROMPT_KEYS.forEach((key) => {
        settings[key] = defaultSettings[key];
        $popup.find(`[data-prompt-key="${key}"]`).val(defaultSettings[key]);
      });
      saveSettings();
      toastEntitySuccess(UI.prompts.resetAll);
    });
}

export function initPromptsManager($settingsPanel) {
  const $popup = getPopupRoot();
  bindPopupCloseHandlers($popup);
  bindPromptFields($popup);

  $settingsPanel.find("#story_manager_open_prompts_btn").on("click", () => {
    fillPromptFields($popup);
    if (MOBILE_PROMPTS_MEDIA.matches) {
      setMobilePromptBlockOpen($popup, null, false);
    }
    openStoryManagerPopup($popup);
  });
}
