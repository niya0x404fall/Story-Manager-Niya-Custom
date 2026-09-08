import {
  getEntities,
  createEntity,
  toggleEntity,
  updateEntity,
} from "../entities.js";
import { buildNotesInjectionText, injectAllEntities } from "../injection.js";
import { createFromTemplate } from "../templates.js";
import { UI } from "../ui-text.js";
import {
  applyNoteAddFormText,
  applyNoteEditFormText,
} from "./apply-ui-text.js";
import { renderCardList, updateTokenCountLabel } from "./card-list.js";
import {
  toastEntityError,
  toastEntitySuccess,
  toastEntityWarning,
} from "./toasts.js";

let notesUiInitialized = false;

export function initNotesUI($settingsPanel) {
  if (notesUiInitialized) return;
  notesUiInitialized = true;

  $settingsPanel.find("#story-notes-add-btn").on("click", () => {
    const $formWrap = $settingsPanel.find("#story-notes-add-form-wrap");
    if ($formWrap.is(":visible") && $formWrap.children().length) {
      $formWrap.find(".story-note-add-title").trigger("focus");
      return;
    }
    showAddNoteForm($formWrap);
  });
}

function showAddNoteForm($formWrap) {
  $formWrap.empty().removeClass("story-manager-hidden");
  const $form = createFromTemplate("story-manager-note-add-template");
  if ($form.length === 0) {
    console.error("Story Manager: note add template not found");
    toastEntityError(
      `${UI.notes.formLoadFailed} ${UI.common.formReloadHint}`,
      null,
    );
    $formWrap.addClass("story-manager-hidden");
    return;
  }
  applyNoteAddFormText($form);
  $formWrap.append($form);

  $form.find(".story-note-add-cancel-btn").on("click", () => {
    $formWrap.addClass("story-manager-hidden").empty();
  });

  $form.find(".story-note-add-save-btn").on("click", () => {
    const title = $form.find(".story-note-add-title").val().trim();
    const body = $form.find(".story-note-add-body").val().trim();
    if (!title || !body) {
      toastEntityWarning(UI.notes.fillTitleAndBody);
      return;
    }

    createEntity("notes", { title, body });
    $formWrap.addClass("story-manager-hidden").empty();
    renderNotes();
    injectAllEntities();
    toastEntitySuccess(UI.notes.added);
  });

  $form.find(".story-note-add-title").trigger("focus");
}

function updateNotesTokenCount() {
  return updateTokenCountLabel("#story-notes-token-count", () =>
    buildNotesInjectionText(),
  );
}

const NOTES_CARD_LIST_CONFIG = {
  namespace: "storyManagerNotes",
  containerSelector: "#story-notes-container",
  entityType: "notes",
  getItems: () => getEntities("notes"),
  emptyHtml: `<i>${UI.notes.emptyList}</i>`,
  templateId: "story-manager-note-item-template",
  itemSelector: ".story-note-item",
  idAttribute: "data-note-id",
  titleSelector: ".story-note-title",
  bodySelector: ".story-note-body",
  checkboxSelector: ".story-note-toggle-checkbox",
  deleteSelector: ".story-note-delete-btn",
  expandSelector: ".story-note-toggle-expand",
  getTitle: (note) => note.title,
  getBody: (note) => note.body,
  onAfterToggle: () => updateNotesTokenCount(),
  onAfterRender: () => updateNotesTokenCount(),
  actions: [
    {
      selector: ".story-note-edit-btn",
      handler: (_e, { id }) => enterEditMode(id),
    },
  ],
};

export function renderNotes() {
  void renderCardList(NOTES_CARD_LIST_CONFIG);
}

function enterEditMode(noteId) {
  const notes = getEntities("notes");
  const note = notes.find((n) => n.id === noteId);
  if (!note) return;

  const $noteItem = $(`.story-note-item[data-note-id="${noteId}"]`);
  const $titleInput = $("<input>", {
    type: "text",
    class: "story-note-title-edit text_pole",
  }).val(note.title);
  $noteItem.find(".story-note-title").replaceWith($titleInput);

  $noteItem.find(".story-note-actions").hide();
  $noteItem.find(".story-note-body").remove();

  const $editForm = createFromTemplate("story-manager-note-edit-template");
  applyNoteEditFormText($editForm);
  $editForm.find(".story-note-body-edit").val(note.body);
  $noteItem.find(".story-note-header").after($editForm);

  $editForm.find(".story-note-save-btn").on("click", function () {
    const newTitle = $noteItem.find(".story-note-title-edit").val().trim();
    const newBody = $editForm.find(".story-note-body-edit").val().trim();
    if (newTitle && newBody) {
      updateEntity("notes", noteId, { title: newTitle, body: newBody });
      renderNotes();
    }
  });

  $editForm.find(".story-note-cancel-btn").on("click", () => renderNotes());
}
