import { mountStoryManagerModal } from "./modal-root.js";

/** Открытый оверлей-попап (display:flex задаётся в CSS). */
export const STORY_MANAGER_POPUP_OPEN_CLASS = "story-manager-popup-open";

function resetPopupScroll($popup) {
  const root = $popup[0];
  if (root) {
    root.scrollTop = 0;
  }

  $popup.find(".story-manager-summary-confirm-panel, .story-manager-prompts-popup-panel").each(
    function resetPanelScroll() {
      this.scrollTop = 0;
    },
  );

  $popup.find(".story-manager-summary-confirm-body, .story-manager-prompts-popup-body").each(
    function resetBodyScroll() {
      this.scrollTop = 0;
    },
  );
}

export function openStoryManagerPopup($popup) {
  mountStoryManagerModal($popup);
  resetPopupScroll($popup);
  $popup.addClass(STORY_MANAGER_POPUP_OPEN_CLASS);
}

export function closeStoryManagerPopup($popup) {
  $popup.removeClass(STORY_MANAGER_POPUP_OPEN_CLASS);
}

export function isStoryManagerPopupOpen($popup) {
  return $popup.hasClass(STORY_MANAGER_POPUP_OPEN_CLASS);
}
