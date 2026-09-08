import { getContext } from "../../../../../extensions.js";
import { isImagesEnabled } from "../image-presets.js";
import {
  applyImageBlockToMessage,
  getMessageImageHtmlForEditor,
  getMessageImageHtmlRaw,
  hasMessageImageError,
  isDisplayTextStale,
  mergeImageBlockWithRenderedSrc,
  triggerSillyImagesForMessage,
  rebuildDisplayText,
  setMessageImageHtml,
  syncImageMetaToCurrentMes,
  promoteCompletedImageBlockToPocket,
  syncImageBlockFromRenderedDom,
} from "../image-pocket.js";
import { saveChat } from "../storage.js";
import { UI } from "../ui-text.js";

let bound = false;
let editingMesId = null;
let imageHtmlAtEditOpen = "";

function findEditorTextarea() {
  return $("#curEditTextarea, #message_text, #mes_text, textarea.edit_textarea").first();
}

function isBotChatMessage(message) {
  return Boolean(message && !message.is_user);
}

function removeEditorPanel() {
  $("#story-manager-image-edit-panel").remove();
  $(".story-manager-image-edit-preview").remove();
  editingMesId = null;
  imageHtmlAtEditOpen = "";
}

export async function syncImageEditorFromPanel(options = {}) {
  if (editingMesId === null) {
    return;
  }

  const $textarea = $("#story-manager-image-edit-textarea");
  if (!$textarea.length) {
    return;
  }

  const context = getContext();
  const message = context?.chat?.[editingMesId];
  if (!isBotChatMessage(message)) {
    return;
  }

  let html = ($textarea.val() || "").trim();
  html = mergeImageBlockWithRenderedSrc(html, message, editingMesId);
  const htmlUnchanged = html === (imageHtmlAtEditOpen || "").trim();
  const mesAtSave =
    (findEditorTextarea().val?.() ?? message.mes ?? "").toString();
  const setRes = setMessageImageHtml(message, html, { mesAtSave });
  await applyImageBlockToMessage(editingMesId);
  saveChat();
  imageHtmlAtEditOpen = html;

  const allowSillyImages = options.allowSillyImagesTrigger !== false;
  const hasNewGenTag = html.includes("[IMG:GEN]");
  if (allowSillyImages && !htmlUnchanged && hasNewGenTag && setRes?.ok) {
    triggerSillyImagesForMessage(editingMesId);
  }
}

async function flushImageEditorIfOpen() {
  if (editingMesId === null) {
    return;
  }

  const $textarea = $("#story-manager-image-edit-textarea");
  if (!$textarea.length) {
    return;
  }

  const message = getContext()?.chat?.[editingMesId];
  if (!isBotChatMessage(message)) {
    return;
  }

  const html = ($textarea.val() || "").trim();
  if (html === (imageHtmlAtEditOpen || "").trim()) {
    return;
  }

  await syncImageEditorFromPanel({ allowSillyImagesTrigger: false });
}

async function restoreImageAfterEditEnd(mesId, options = {}) {
  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0) {
    return;
  }

  const message = getContext()?.chat?.[safeId];
  if (!message || message.is_user) {
    return;
  }

  if (!getMessageImageHtmlRaw(message) && !hasMessageImageError(message)) {
    return;
  }

  promoteCompletedImageBlockToPocket(message);
  if (!options.skipDomSync) {
    await syncImageBlockFromRenderedDom(safeId);
  }

  if (!isDisplayTextStale(message, safeId)) {
    syncImageMetaToCurrentMes(message);
    return;
  }

  rebuildDisplayText(message);
  syncImageMetaToCurrentMes(message);
  await applyImageBlockToMessage(safeId);
  saveChat();
}

/** Вызывается из index.js на MESSAGE_EDITED. */
export async function flushImageEditorOnMessageEdited(mesId) {
  if (!isImagesEnabled()) {
    return;
  }

  const editedId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(editedId)) {
    return;
  }

  const flushedFromPanel = editingMesId !== null && editedId === editingMesId;
  if (flushedFromPanel) {
    await flushImageEditorIfOpen();
  }

  removeEditorPanel();
  await restoreImageAfterEditEnd(editedId, {
    skipDomSync: flushedFromPanel,
  });
}

function showEditorPanel(mesId) {
  removeEditorPanel();

  const safeMesId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeMesId) || safeMesId < 0) {
    return;
  }

  const context = getContext();
  const message = context?.chat?.[safeMesId];
  const $anchor = findEditorTextarea();

  if (!$anchor.length || !isBotChatMessage(message)) {
    return;
  }

  editingMesId = safeMesId;

  promoteCompletedImageBlockToPocket(message);
  let html = getMessageImageHtmlForEditor(message, safeMesId);
  const rawPocket = getMessageImageHtmlRaw(message);
  if (
    html &&
    rawPocket.includes("[IMG:GEN]") &&
    html !== rawPocket &&
    !html.includes("[IMG:GEN]")
  ) {
    setMessageImageHtml(message, html, { mesAtSave: message.mes || "" });
    saveChat();
  }
  imageHtmlAtEditOpen = html;

  const $panel = $(`
    <div id="story-manager-image-edit-panel" class="story-manager-image-edit-panel">
      <label><b>${UI.images.messageEditHtmlLabel}</b></label>
      <textarea id="story-manager-image-edit-textarea" class="text_pole" rows="8"></textarea>
    </div>
  `);

  $panel.find("textarea").val(html);
  $anchor.after($panel);
}

export function initImageMessageEditor() {
  if (bound) {
    return;
  }

  bound = true;

  $(document).on("click.storyManagerImageEdit", ".mes_edit", function () {
    if (!isImagesEnabled()) {
      return;
    }

    const mesId = $(this).closest(".mes").attr("mesid");
    setTimeout(() => showEditorPanel(mesId), 250);
  });

  $(document).on(
    "click.storyManagerImageEdit",
    "#message_cancel, #mes_cancel, .mes_edit_cancel",
    function () {
      const mesId =
        editingMesId ?? $(this).closest(".mes").attr("mesid");
      removeEditorPanel();
      void restoreImageAfterEditEnd(mesId);
    },
  );
}
