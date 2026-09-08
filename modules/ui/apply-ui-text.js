import { UI } from "../ui-text.js";

function setLabelText($root, forId, text) {
  $root.find(`label[for="${forId}"] b`).text(text);
}

function setSelectOptions($select, options) {
  $select.find("option").each(function (index) {
    if (options[index] !== undefined) {
      $(this).text(options[index]);
    }
  });
}

/** Подставить тексты панели настроек из ui-text.js (после createFromTemplate). */
export function applySettingsPanelText($panel) {
  const $root = $panel.find("#story_manager_settings").length
    ? $panel.find("#story_manager_settings")
    : $panel;

  $root.find("> .inline-drawer-toggle > b").text(UI.appName);

  const g = UI.settings.general;
  const $general = $root.find("> .inline-drawer-content > .story-manager-section").first();
  $root
    .find(".story-manager-duplicate-install-warning")
    .text(g.duplicateInstallWarning);
  $general.find("> h3").text(g.heading);
  setLabelText($root, "story_manager_profile", g.profileLabel);
  setLabelText($root, "story_manager_character_lorebook", g.lorebookLabel);
  $root.find("#story_manager_open_prompts_btn").text(g.openPrompts);
  $root.find("#story_manager_data_export_btn").text(g.exportData);
  $root.find("#story_manager_data_import_btn").text(g.importData);
  $root.find(".story-manager-data-transfer-hint").text(g.dataTransferHint);
  setLabelText($root, "story_manager_summary_injection_position", g.injectionPositionLabel);
  setSelectOptions($general.find("#story_manager_summary_injection_position"), g.injectionPositions);
  $general.find('label[for="story_manager_summary_injection_depth"] span').text(g.injectionDepth);
  $general.find('label[for="story_manager_summary_injection_role"] span').text(g.injectionRole);
  $general.find(".story-summary-injection-hint").text(g.injectionHint);
  $general.find(".story-summary-depth-hint").text(g.depthHint);

  const $subsections = $root.find(".story-manager-subsections > .story-manager-section");

  const n = UI.settings.notes;
  const $notes = $($subsections[0]);
  $notes.find(".inline-drawer-header > b").text(n.sectionTitle);
  $notes.find("#story-notes-add-btn").text(n.addButton).attr("title", n.addTitle);
  $notes.find("h4").text(n.listHeading);
  $notes.find("#story-notes-container i").text(n.empty);

  const c = UI.settings.characters;
  const $chars = $($subsections[1]);
  $chars.find(".inline-drawer-header > b").text(c.sectionTitle);
  setLabelText($root, "story_manager_character_context", c.contextLabel);
  setSelectOptions($chars.find("#story_manager_character_context"), [
    c.contextOlder,
    c.contextNewer,
  ]);
  $chars.find("h4").text(c.listHeading);
  $chars.find("#story-characters-container i").text(c.empty);

  const l = UI.settings.locations;
  const $locs = $($subsections[2]);
  $locs.find(".inline-drawer-header > b").text(l.sectionTitle);
  setLabelText($root, "story_manager_location_context", l.contextLabel);
  setSelectOptions($locs.find("#story_manager_location_context"), [
    l.contextOlder,
    l.contextNewer,
  ]);
  $locs.find("h4").text(l.listHeading);
  $locs.find("#story-locations-container i").text(l.empty);

  const s = UI.settings.summary;
  const $summary = $($subsections[3]);
  $summary.find(".inline-drawer-header > b").text(s.sectionTitle);
  $summary.find(".story-summary-context-enable-label b").text(s.contextEnable);
  $summary.find(".story-summary-auto-enable-label b").text(s.autoEnable);
  setLabelText($root, "story_manager_summary_interval", s.intervalLabel);
  $summary.find(".story-summary-auto-hint").text(s.autoHint);
  $summary.find(".story-summary-manual-range-title").text(s.manualTitle);
  $summary.find('label[for="story_summary_manual_start"] span').text(s.manualStart);
  $summary.find('label[for="story_summary_manual_end"] span').text(s.manualEnd);
  $summary.find("#story-summary-manual-create-btn").text(s.manualCreate);
  $summary.find(".story-summary-manual-range-hint").text(s.manualHint);
  $summary.find(".story-summary-chunks-heading").text(s.chunksHeading);
  $summary.find(".story-summary-selection-hint").text(s.selectionHint);
  $summary.find(".story-summary-stale-hint").text(s.staleHint);
  $summary.find("#story-summary-chunks-container i").text(s.empty);
  $summary
    .find("#story-summary-compress-btn")
    .text(s.compress)
    .attr("title", s.compressTitle);
  $summary.find("#story-summary-rebuild-btn").text(s.rebuild).attr("title", s.rebuildTitle);
  $summary
    .find("#story-summary-import-builtin-btn")
    .text(s.importBuiltin)
    .attr("title", s.importBuiltinTitle);
  $summary.find("#story-summary-fill-gaps-btn").text(s.fillGaps).attr("title", s.fillGapsTitle);
  $summary.find("#story-summary-rollback-btn").text(s.rollback).attr("title", s.rollbackTitle);
}

export function applyDataImportPopupText($popup) {
  const t = UI.dataTransfer.popup;
  $popup.find(".story-manager-summary-confirm-title").text(t.title);
  $popup.find(".story-manager-data-import-options legend").text(t.modeQuestion);
  const $options = $popup.find(".story-manager-data-import-option");
  $options.eq(0).find("b").text(t.mergeTitle);
  $options.eq(0).find("small").text(t.mergeHint);
  $options.eq(1).find("b").text(t.replaceTitle);
  $options.eq(1).find("small").text(t.replaceHint);
  $popup.find(".story-manager-data-import-settings-row span").text(t.restoreSettings);
  $popup.find(".story-manager-data-import-hint").text(t.localSettingsHint);
  $popup.find(".story-manager-data-import-close").text(UI.common.cancel);
  $popup.find("#story-manager-data-import-confirm-btn").text(t.confirm);
}

export function applyPromptsPopupText($popup) {
  const p = UI.prompts;
  $popup.find(".story-manager-prompts-popup-header > b").text(p.title);
  $popup.find(".story-manager-prompts-close").attr("title", UI.common.close);
  $popup.find('[data-prompt-reset]').attr("title", UI.common.reset);

  const blocks = [
    { key: "notePrompt", cfg: p.blocks.note },
    { key: "characterPrompt", cfg: p.blocks.character },
    { key: "locationPrompt", cfg: p.blocks.location },
    { key: "summaryPrompt", cfg: p.blocks.summary },
    { key: "summaryCompressPrompt", cfg: p.blocks.summaryCompress },
  ];

  blocks.forEach(({ key, cfg }) => {
    const $block = $popup.find(`[data-prompt-key="${key}"]`).closest(".story-manager-prompt-block");
    $block.find("label b").text(cfg.label);
    $popup
      .find(`[data-prompt-key="${key}"]`)
      .attr({ placeholder: cfg.placeholder, "aria-label": cfg.label });
  });

  $popup.find("#story_manager_prompts_reset_all").text(p.resetAllButton);
  $popup.find(".story-manager-prompts-popup-footer .story-manager-prompts-close").text(
    UI.common.close,
  );
}

export function applySummaryRebuildPopupText($popup) {
  const t = UI.summary.popup.rebuild;
  $popup.find(".story-manager-summary-confirm-title").text(t.title);
  $popup.find(".story-manager-summary-confirm-text").text(t.text);
  $popup.find(".story-summary-rebuild-date-hint").text(t.dateHint);
  $popup.find(".story-summary-rebuild-date-fields").attr("aria-label", t.dateGroupLabel);
  $popup.find(".story-summary-rebuild-date-label").eq(0).text(t.day);
  $popup.find(".story-summary-rebuild-date-label").eq(1).text(t.month);
  $popup.find(".story-summary-rebuild-date-label").eq(2).text(t.year);
  $popup.find(".story-summary-rebuild-close").text(UI.common.confirmNo);
  $popup.find("#story-summary-rebuild-confirm-btn").text(t.confirm);
}

export function applySummaryFillGapsPopupText($popup) {
  const t = UI.summary.popup.fillGaps;
  $popup.find(".story-manager-summary-confirm-title").text(t.title);
  $popup.find(".story-manager-summary-confirm-text").text(t.text);
  $popup.find(".story-summary-fill-gaps-close").text(UI.common.confirmNo);
  $popup.find("#story-summary-fill-gaps-confirm-btn").text(t.confirm);
}

export function applySummaryImportBuiltinPopupText($popup) {
  const t = UI.summary.popup.importBuiltin;
  $popup.find(".story-manager-summary-confirm-title").text(t.title);
  $popup.find(".story-summary-import-builtin-close").text(UI.common.confirmNo);
}

export function applyImagePresetPopupText($popup) {
  const t = UI.images;
  $popup.find(".story-manager-prompts-popup-header > b").text(t.presetPopupTitle);
  $popup.find('label:has(#story_image_preset_name) b').text(t.nameLabel);
  $popup.find('label:has(#story_image_preset_context_pairs) b').text(t.contextPairsLabel);
  $popup.find('label[for="story_image_preset_instruction"] b').text(t.instructionLabel);
  $popup.find("#story_image_preset_imagen_hint").text(t.imagenHint);
  $popup
    .find("#story_image_preset_insert_default_btn")
    .text(t.insertDefaultTemplate)
    .attr("title", t.insertDefaultTemplateTitle);
  $popup.find("#story_image_preset_save_btn").text(UI.common.save);
  $popup.find(".story-manager-image-preset-close.menu_button").text(UI.common.close);
}

export function applyNoteAddFormText($form) {
  const t = UI.notes.addForm;
  $form.find("label:has(.story-note-add-title) b").text(t.titleLabel);
  $form.find(".story-note-add-title").attr("placeholder", t.titlePlaceholder);
  $form.find("label:has(.story-note-add-body) b").text(t.bodyLabel);
  $form.find(".story-note-add-body").attr("placeholder", t.bodyPlaceholder);
  $form.find(".story-note-add-save-btn").text(UI.common.save);
  $form.find(".story-note-add-cancel-btn").text(UI.common.cancel);
}

export function applyNoteEditFormText($form) {
  $form.find("label b").text(UI.notes.editForm.bodyLabel);
  $form.find(".story-note-save-btn").text(UI.common.save);
  $form.find(".story-note-cancel-btn").text(UI.common.cancel);
}

export function applySummaryChunkEditFormText($form) {
  $form.find("label b").text(UI.summary.editBodyLabel);
  $form.find(".story-summary-chunk-save-btn").text(UI.common.save);
  $form.find(".story-summary-chunk-cancel-btn").text(UI.common.cancel);
}

export function applySummaryChunkItemTemplateText($item) {
  const t = UI.summary;
  $item.find(".story-summary-chunk-stale-icon").attr({
    title: t.chunkStaleTitle,
    "aria-label": t.chunkStaleTitle,
    role: "button",
    tabindex: "0",
  });
  $item.find(".story-summary-chunk-uncovered-icon").attr("title", t.chunkUncoveredTitle);
  $item.find(".story-summary-compressed-badge").attr("title", t.compressedBadgeTitle);
  $item.find(".story-summary-chunk-regenerate-btn").attr("title", t.regenerateTitle);
  $item.find(".story-summary-chunk-delete-btn").attr("title", t.deleteTitle);
  $item
    .find(".story-summary-chunk-select-checkbox")
    .attr({
      title: t.selectForCompressionTitle,
      "aria-label": t.selectForCompressionTitle,
    });
}

export function applyEntityCardTemplateText($item, entityKind) {
  $item.find(".story-character-lorebook-btn, .story-location-lorebook-btn").attr(
    "title",
    UI.common.lorebookAction,
  );
  if (entityKind === "imagePreset") {
    const t = UI.images.presetCard;
    $item.find(".story-manager-toggle-switch").attr("title", t.toggleTitle);
    $item.find(".story-image-preset-name").attr("title", t.activeTitle);
    $item.find(".story-image-preset-edit-btn").attr("title", t.editTitle);
    $item.find(".story-image-preset-export-btn").attr("title", t.exportTitle);
    $item.find(".story-image-preset-delete-btn").attr("title", t.deleteTitle);
  }
}
