import { getContext } from "../../../../../extensions.js";
import { removeReasoningFromString } from "../../../../../reasoning.js";
import { getSettings } from "../settings.js";
import { generateQuietWithProfile } from "../profiles.js";
import { createEntity } from "../entities.js";
import {
  withGenerationTimeout,
  GENERATION_TIMEOUT_ERROR_MESSAGE,
} from "../generation-timeout.js";
import {
  MESSAGE_CONTEXT,
  NEWER_CONTEXT_EXTRA,
  OLDER_CONTEXT_EXTRA,
  normalizeMessageContext,
} from "../message-context.js";

export function buildChatExcerpt(messageId, contextDirection) {
  return buildChatExcerptFromChat(
    getContext().chat,
    messageId,
    contextDirection,
  );
}

/**
 * @param {Array} chat
 * @param {number} messageId
 * @param {'older'|'newer'} [contextDirection]
 */
export function buildChatExcerptFromChat(
  chat,
  messageId,
  contextDirection = MESSAGE_CONTEXT.OLDER,
) {
  if (!chat || chat.length === 0) {
    throw new Error("Chat is empty");
  }

  const safeMessageId = Math.max(
    0,
    Math.min(chat.length - 1, Number.parseInt(messageId, 10) || 0),
  );
  const direction = normalizeMessageContext(contextDirection);

  let startIndex;
  let endIndex;

  if (direction === MESSAGE_CONTEXT.NEWER) {
    startIndex = safeMessageId;
    endIndex = Math.min(chat.length - 1, safeMessageId + NEWER_CONTEXT_EXTRA);
  } else {
    startIndex = Math.max(0, safeMessageId - OLDER_CONTEXT_EXTRA);
    endIndex = safeMessageId;
  }

  return chat
    .slice(startIndex, endIndex + 1)
    .map((msg) => `${msg.name}: ${msg.mes}`)
    .join("\n\n");
}

export async function generateStructuredEntity({
  entityType,
  messageId,
  promptKey,
  contextDirection,
  responseLength = 500,
  parseResult,
  buildEntityData,
}) {
  const context = getContext();
  const chatMetadataRef = context.chatMetadata;
  const contextText = buildChatExcerptFromChat(
    context.chat,
    messageId,
    contextDirection,
  );
  const settings = getSettings();

  const result = await withGenerationTimeout(
    generateQuietWithProfile({
      prompt: contextText,
      systemPrompt: settings[promptKey],
      responseLength,
    }).then((rawResult) => removeReasoningFromString(rawResult)),
    { errorMessage: GENERATION_TIMEOUT_ERROR_MESSAGE },
  );

  const parsed = parseResult(result);

  if (getContext().chatMetadata !== chatMetadataRef) {
    throw new Error("Активный чат сменился во время генерации.");
  }

  return createEntity(entityType, buildEntityData(parsed, result));
}
