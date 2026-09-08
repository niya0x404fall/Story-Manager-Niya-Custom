import { createDefaultImagePreset, MINIMAL_IMAGE_INSTRUCTION } from "./image-defaults.js";
import { getPresetInstruction, normalizeImagePresetForStorage } from "./image-preset.js";
import { normalizeImagenWrapper } from "./image-tag-normalize.js";

/** Только «последние N сообщений» → число пар user+bot; текстовые вставки context builder не импортируем. */
function extractContextPairCount(contextItems = []) {
  let maxMessages = 0;

  for (const item of contextItems) {
    if (item?.type === "last_messages" && Number.isInteger(item.messages_count)) {
      maxMessages = Math.max(maxMessages, item.messages_count);
    }
  }

  return Math.max(1, Math.ceil(maxMessages / 2));
}

function mergeExtBlocksInstruction(prompt, template) {
  const promptText = (prompt || "").trim();
  const templateText = normalizeImagenWrapper((template || "").trim());

  if (!promptText && !templateText) {
    return MINIMAL_IMAGE_INSTRUCTION;
  }
  if (!promptText) {
    return templateText;
  }
  if (!templateText) {
    return promptText;
  }

  return `${promptText}\n\n${templateText}`;
}

function isExtBlocksPayload(raw) {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  if (Array.isArray(raw)) {
    return true;
  }
  if (Array.isArray(raw.blocks)) {
    return true;
  }
  if (raw.block_type) {
    return true;
  }
  if (Array.isArray(raw.preset?.blocks)) {
    return true;
  }
  return false;
}

function collectExtBlocks(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (Array.isArray(raw.blocks)) {
    return raw.blocks;
  }
  if (raw.block_type) {
    return [raw];
  }
  if (Array.isArray(raw.preset?.blocks)) {
    return raw.preset.blocks;
  }
  return [];
}

/** Импорт JSON экспорта Story Manager (`instruction` или legacy prompt + htmlTemplate). */
function importStoryManagerPresetJson(raw) {
  const base = createDefaultImagePreset();

  return normalizeImagePresetForStorage({
    ...base,
    ...raw,
    id: raw.id || `preset-${Date.now()}`,
    name: raw.name || base.name,
    enabled: raw.enabled !== false,
    instruction: getPresetInstruction(raw),
    contextPairCount: raw.contextPairCount || base.contextPairCount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    importedFrom: raw.importedFrom || "story-manager",
  });
}

function importExtBlocksBlock(raw, block) {
  const base = createDefaultImagePreset();
  const instruction = mergeExtBlocksInstruction(block.prompt, block.template);

  return normalizeImagePresetForStorage({
    ...base,
    id: `preset-${Date.now()}`,
    name: block.name || raw.name || "Imported ExtBlocks",
    enabled: true,
    instruction,
    contextPairCount: extractContextPairCount(block.context),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    importedFrom: "extblocks",
  });
}

/**
 * Импорт ExtBlocks или экспорта Story Manager.
 * ExtBlocks: prompt + template → одно поле instruction; context builder (text) отбрасывается.
 */
export function importExtBlocksPresetJson(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Некорректный JSON пресета.");
  }

  if (!isExtBlocksPayload(raw)) {
    return importStoryManagerPresetJson(raw);
  }

  const blocks = collectExtBlocks(raw);
  if (!blocks.length) {
    throw new Error("В файле не найдено блоков ExtBlocks для импорта.");
  }

  const block = blocks.find((item) => item.block_type === "generated") || blocks[0];
  return importExtBlocksBlock(raw, block);
}
