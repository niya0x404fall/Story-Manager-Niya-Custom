import { createFromTemplate } from "../templates.js";
import { getSummarySourceChoices } from "../summary-sources.js";
import { openStoryManagerPopup, closeStoryManagerPopup } from "./popup-state.js";

let closeActiveChoice = null;

/** Открытие и отмена окна не обращаются к модели. */
export function chooseSummaryRegenerationSources(chat, chunk) {
  closeActiveChoice?.(null);
  const $popup = createFromTemplate("story-manager-summary-source-popup-template");
  const previousFocus = document.activeElement;
  const compressed = chunk.type === "compressed";
  const { exact, choices } = compressed
    ? { exact: true, choices: [{ mode: "compressed", label: "Повторно сократить", description: "Использовать сохранённый текст до сокращения. Сообщения чата заново не читаются.", count: 1 }] }
    : getSummarySourceChoices(chat, chunk);

  $popup.find(".story-summary-source-title").text(`Пересобрать саммари ${chunk.startMes} — ${chunk.endMes}?`);
  $popup.find(".story-summary-source-legacy").toggle(!exact);
  const $choices = $popup.find(".story-summary-source-choices");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (mode) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown, true);
      closeStoryManagerPopup($popup);
      $popup.remove();
      closeActiveChoice = null;
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(mode);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      } else if (event.key === "Tab") {
        const controls = $popup.find("button:not(:disabled)").toArray();
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    closeActiveChoice = finish;
    for (const choice of choices) {
      const $button = $("<button type='button' class='menu_button story-summary-source-choice'></button>");
      $("<strong></strong>").text(choice.label).appendTo($button);
      $("<span></span>").text(choice.description).appendTo($button);
      if (!compressed) {
        $("<small></small>").text(`Сообщений: ${choice.count}; из них скрытых: ${choice.hiddenCount}.`).appendTo($button);
      }
      $button.attr("data-source-mode", choice.mode).prop("disabled", choice.count === 0)
        .on("click", () => finish(choice.mode));
      $choices.append($button);
    }
    $popup.find(".story-summary-source-cancel, .story-manager-prompts-popup-backdrop")
      .on("click", () => finish(null));
    document.addEventListener("keydown", onKeydown, true);
    openStoryManagerPopup($popup);
    // Фокус на отмене: Enter при случайном открытии не запускает запрос.
    $popup.find(".story-summary-source-cancel").trigger("focus");
  });
}
