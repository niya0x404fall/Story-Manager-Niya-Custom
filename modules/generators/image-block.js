import { getContext } from "../../../../../extensions.js";
import { removeReasoningFromString } from "../../../../../reasoning.js";
import { generateQuietWithProfile } from "../profiles.js";
import { getImageGlobals, getActiveImagePreset, isImagesEnabled } from "../image-presets.js";
import { collectLorebookSystemMessages } from "../image-lorebook.js";
import {
  withGenerationTimeout,
  GENERATION_TIMEOUT_ERROR_MESSAGE,
} from "../generation-timeout.js";
import {
  applyImageBlockToMessage,
  extractImageHtmlFromModelOutput,
  getMessageImageHtml,
  triggerSillyImagesForMessage,
  setMessageImageHtml,
} from "../image-pocket.js";
import {
  buildPresetInstructionMessageContent,
  getPresetInstruction,
} from "../image-preset.js";
import { saveChat } from "../storage.js";
import { toastImageError, toastImageSuccess } from "../ui/toasts.js";

function substituteMacros(text, context) {
  if (!text) {
    return "";
  }

  const fields =
    typeof context.getCharacterCardFields === "function"
      ? context.getCharacterCardFields()
      : {};

  return text
    .replace(/\{\{char\}\}/gi, context.name2 || "Character")
    .replace(/\{\{user\}\}/gi, context.name1 || "User")
    .replace(/\{\{charIfNotGroup\}\}/gi, context.name2 || "Character")
    .replace(/\{\{persona\}\}/gi, fields.persona || "")
    .replace(/\{\{description\}\}/gi, fields.description || "");
}

function getCardFields(context) {
  if (typeof context.getCharacterCardFields === "function") {
    return context.getCharacterCardFields();
  }
  return {};
}

function substituteFromContext(context, template) {
  if (typeof context.substituteParams !== "function") {
    return "";
  }

  const substituted = context.substituteParams(template);
  if (!substituted || substituted === template) {
    return "";
  }

  return substituted.trim();
}

function getCharDescriptionText(context) {
  const fields = getCardFields(context);
  if (fields.description?.trim()) {
    return fields.description.trim();
  }

  const character = context.characters?.[context.characterId];
  if (!character) {
    return substituteFromContext(context, "{{description}}");
  }

  const data = character.data || {};
  if (data.description?.trim()) {
    return data.description.trim();
  }
  if (character.description?.trim()) {
    return character.description.trim();
  }

  const fallback = [data.personality, data.scenario].filter(Boolean).join("\n").trim();
  if (fallback) {
    return fallback;
  }

  return substituteFromContext(context, "{{description}}");
}

function getUserPersonaText(context) {
  const fields = getCardFields(context);
  if (fields.persona?.trim()) {
    return fields.persona.trim();
  }

  const fromPowerUser = context.powerUserSettings?.persona_description?.trim();
  if (fromPowerUser) {
    return fromPowerUser;
  }

  return substituteFromContext(context, "{{persona}}");
}

function buildCharCardSection(context) {
  const globals = getImageGlobals();
  if (!globals.sendCharCard) {
    return "";
  }

  const description = getCharDescriptionText(context);
  if (!description) {
    return "";
  }

  return `### Character card ({{char}})\n${substituteMacros(description, context)}`;
}

function buildUserCardSection(context) {
  const globals = getImageGlobals();
  if (!globals.sendUserCard) {
    return "";
  }

  const persona = getUserPersonaText(context);
  if (!persona) {
    return "";
  }

  return `### User card ({{user}})\n${substituteMacros(persona, context)}`;
}

/** Текст последних count сообщений чата до endIndex включительно (для скана лорбука). */
export function getLastChatMessagesText(chat, endIndex, count = 2) {
  const parts = [];
  for (let i = endIndex; i >= 0 && parts.length < count; i--) {
    const text = chat[i]?.mes;
    if (typeof text === "string" && text.trim()) {
      parts.unshift(text.trim());
    }
  }
  return parts.join("\n");
}

/**
 * @returns {Array<{ userText: string, botText: string, botIndex: number, imageHtml: string }>}
 */
export function collectPairsUpTo(chat, endIndex, maxPairs) {
  const pairs = [];

  for (let index = 0; index <= endIndex; index++) {
    const message = chat[index];
    if (!message?.is_user) {
      continue;
    }

    const bot = chat[index + 1];
    if (!bot || bot.is_user || index + 1 > endIndex) {
      continue;
    }

    pairs.push({
      userText: message.mes || "",
      botText: bot.mes || "",
      botIndex: index + 1,
      imageHtml: getMessageImageHtml(bot),
    });
  }

  return pairs.slice(-maxPairs);
}

/** @typedef {{ role: "system" | "user" | "assistant", content: string }} ImageChatMessage */

function pushMessage(messages, role, content) {
  const text = String(content ?? "").trim();
  if (!text) {
    return;
  }

  messages.push({ role, content: text });
}

function formatPairUserContent(pair, { sceneLabel = "" } = {}) {
  const context = getContext();
  const header = sceneLabel ? `${sceneLabel}\n` : "";
  return (
    header +
    `[USER — ${context.name1 || "User"}]:\n${pair.userText}\n\n` +
    `[BOT — ${context.name2 || "Character"}]:\n${pair.botText}`
  );
}

function formatPairAssistantContent(pair) {
  if (!pair.imageHtml) {
    return "";
  }

  return `[Previous image block for this scene]:\n${pair.imageHtml}`;
}

function pushPresetInstructionMessage(messages, preset, context) {
  const instruction = getPresetInstruction(preset);
  if (!instruction) {
    return;
  }

  const content = buildPresetInstructionMessageContent(
    substituteMacros(instruction, context),
  );
  pushMessage(messages, "system", content);
}

/**
 * Собирает chat-массив для слабых моделей: отдельные system/user/assistant вместо двух «слипшихся» блоков.
 * @returns {Promise<{ messages: ImageChatMessage[], messageId: number }>}
 */
export async function buildImageGenerationMessages(messageId, preset) {
  const context = getContext();
  const chat = context.chat;
  const safeId = Math.max(0, Math.min(chat.length - 1, Number.parseInt(messageId, 10) || 0));
  const target = chat[safeId];

  if (!target || target.is_user) {
    throw new Error("Картинку можно создать только для ответа бота.");
  }

  const pairs = collectPairsUpTo(chat, safeId, preset.contextPairCount || 4);
  const lorebookScanText = getLastChatMessagesText(chat, safeId, 2);
  const historyPairs = pairs.filter((pair) => pair.botIndex < safeId);
  const currentPair = pairs.find((pair) => pair.botIndex === safeId);

  if (!currentPair) {
    throw new Error(
      "Для этого сообщения нет пары «реплика пользователя → ответ бота». Картинку можно создать только на ответе бота сразу после реплики user.",
    );
  }

  /** @type {ImageChatMessage[]} */
  const messages = [];

  // 1. Инструкция пресета — первая, с пометкой Administrator
  pushPresetInstructionMessage(messages, preset, context);

  // 2–3. Карточки персонажа и пользователя
  pushMessage(messages, "system", buildCharCardSection(context));
  pushMessage(messages, "system", buildUserCardSection(context));

  // 4. Записи лорбука — отдельное system-сообщение на каждую
  const lorebookMessages = await collectLorebookSystemMessages(lorebookScanText);
  for (const loreContent of lorebookMessages) {
    pushMessage(messages, "system", loreContent);
  }

  // 5–7. История: user (связка) → assistant (блок картинки), сколько задано в настройках
  for (let index = 0; index < historyPairs.length; index++) {
    const pair = historyPairs[index];
    pushMessage(
      messages,
      "user",
      formatPairUserContent(pair, { sceneLabel: `### Scene ${index + 1}` }),
    );
    pushMessage(messages, "assistant", formatPairAssistantContent(pair));
  }

  // 8. Текущая сцена — только user, без старого HTML (реген)
  pushMessage(
    messages,
    "user",
    formatPairUserContent(currentPair, {
      sceneLabel: "### Current scene (generate image for this)",
    }),
  );

  const hasUserTurn = messages.some((message) => message.role === "user");
  if (!hasUserTurn) {
    throw new Error("Недостаточно контекста чата для генерации блока картинки.");
  }

  return { messages, messageId: safeId };
}

export async function generateImageBlock(messageId) {
  if (!isImagesEnabled()) {
    throw new Error("Генерация картинок отключена в настройках.");
  }

  const context = getContext();
  const chatMetadataRef = context.chatMetadata;
  const preset = getActiveImagePreset();

  if (!preset) {
    throw new Error(
      "Нет активного пресета для картинок. Включите хотя бы один пресет в настройках Story Manager.",
    );
  }

  if (preset.enabled === false) {
    throw new Error(
      `Пресет «${preset.name || "без названия"}» выключен. Включите его в настройках картинок.`,
    );
  }

  const { messages, messageId: safeId } =
    await buildImageGenerationMessages(messageId, preset);

  const result = await withGenerationTimeout(
    generateQuietWithProfile({
      messages,
      responseLength: 2500,
    }).then((raw) => removeReasoningFromString(raw)),
    { errorMessage: GENERATION_TIMEOUT_ERROR_MESSAGE },
  );

  if (getContext().chatMetadata !== chatMetadataRef) {
    throw new Error("Чат сменился во время генерации картинки.");
  }

  const html = extractImageHtmlFromModelOutput(result);
  if (!html) {
    throw new Error("Модель не вернула текст для HTML-блока картинки.");
  }

  const message = getContext().chat[safeId];
  const setRes = setMessageImageHtml(message, html);
  await applyImageBlockToMessage(safeId);
  saveChat();

  if (setRes?.ok) {
    // На ручном регене всегда запускаем SillyImages.
    triggerSillyImagesForMessage(safeId, { forceClick: true });
    toastImageSuccess("Визуал в сообщении готов.");
    return setRes.safeHtml;
  }

  toastImageError("Не удалось добавить визуал в сообщение.", null);
  return setRes?.rawHtml || html;
}
