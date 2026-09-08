/**
 * Пресет картинок: одно поле `instruction` (промпт + HTML вместе).
 */

/** Заголовок главной инструкции в chat-массиве для генерации картинки. */
export const PRESET_INSTRUCTION_ADMIN_HEADER = "### Administrator";

export function getPresetInstruction(preset) {
  if (!preset) {
    return "";
  }

  const instruction = String(preset.instruction ?? "").trim();
  if (instruction) {
    return instruction;
  }

  const prompt = String(preset.prompt ?? "").trim();
  let template = String(preset.htmlTemplate ?? "").trim();
  if (!prompt && !template) {
    return "";
  }

  template = template.replace(/^\[SAMPLE BLOCK\]\s*\n*/i, "").trim();

  if (!prompt) {
    return template;
  }
  if (!template) {
    return prompt;
  }

  return `${prompt}\n\n${template}`;
}

/** Сохраняем только `instruction`, legacy-поля убираем. */
export function normalizeImagePresetForStorage(preset) {
  if (!preset || typeof preset !== "object") {
    return preset;
  }

  const instruction = getPresetInstruction(preset);
  const next = { ...preset, instruction };
  delete next.prompt;
  delete next.htmlTemplate;
  return next;
}

/** Текст первого system-сообщения (с пометкой Administrator). */
export function buildPresetInstructionMessageContent(instruction) {
  const text = String(instruction ?? "").trim();
  if (!text) {
    return "";
  }

  if (/^###\s*Administrator\b/i.test(text)) {
    return text;
  }

  return `${PRESET_INSTRUCTION_ADMIN_HEADER}\n\n${text}`;
}
