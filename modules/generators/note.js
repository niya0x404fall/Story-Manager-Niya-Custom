import { getContext } from "../../../../../extensions.js";
import { removeReasoningFromString } from "../../../../../reasoning.js";
import { getSettings } from "../settings.js";
import { generateQuietWithProfile } from "../profiles.js";
import { createEntity } from "../entities.js";
import { cleanMarkdown } from "../utils.js";
import {
  withGenerationTimeout,
  GENERATION_TIMEOUT_ERROR_MESSAGE,
} from "../generation-timeout.js";

export async function generateNote(messageId) {
  const context = getContext();
  const chatMetadataRef = context.chatMetadata;
  const messageText = context.chat[messageId]?.mes || "";

  if (!messageText) throw new Error("Message text is empty");

  const instruction = getSettings().notePrompt;

  const result = await withGenerationTimeout(
    generateQuietWithProfile({
      prompt: messageText,
      systemPrompt: instruction,
      responseLength: 300,
    }).then((rawResult) => removeReasoningFromString(rawResult)),
    { errorMessage: GENERATION_TIMEOUT_ERROR_MESSAGE },
  );

  const titleMatch = result.match(/(?:Title|Название):\s*(.+?)(?=\n|$)/i);
  const bodyMatch = result.match(/(?:Body|Тело):\s*([\s\S]+)/i);

  let title = titleMatch ? titleMatch[1].trim() : "📝 Заметка";
  let body = bodyMatch ? bodyMatch[1].trim() : result.trim();

  title = cleanMarkdown(title);
  body = cleanMarkdown(body);

  if (getContext().chatMetadata !== chatMetadataRef) {
    throw new Error("Активный чат сменился во время генерации.");
  }

  return createEntity("notes", { title, body });
}
