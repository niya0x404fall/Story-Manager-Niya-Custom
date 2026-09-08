import {
  setExtensionPrompt,
  extension_prompt_roles,
  extension_prompt_types,
} from "../../../../../script.js";
import { getEntities } from "./entities.js";
import { getLoreCardBody } from "./lore-cards.js";
import { getCombinedChunkText, getSortedSummaryChunks } from "./summary-chunks.js";
import { getSettings } from "./settings.js";

/** Текст заметок в том же виде, как уходит в промпт (только включённые). */
export function buildNotesInjectionText(notes = getEntities("notes")) {
  const enabled = notes.filter((n) => n.enabled);
  if (enabled.length === 0) {
    return "";
  }

  let text = "### Story Notes\n\n";
  enabled.forEach((note) => {
    text += `**${note.title}**\n${note.body}\n\n`;
  });
  return text;
}

/**
 * Собрать и вставить все активные сущности в промпт
 */
export function injectAllEntities() {
  let promptText = "";

  // === ЗАМЕТКИ ===
  const notesText = buildNotesInjectionText();
  if (notesText) {
    promptText += notesText;
  }

  const notes = getEntities("notes").filter((n) => n.enabled);

  // === ПЕРСОНАЖИ ===
  const characters = getEntities("characters").filter((c) => c.enabled);
  if (characters.length > 0) {
    promptText += "### Characters\n\n";
    characters.forEach((char) => {
      promptText += `**${char.name}**\n${getLoreCardBody(char)}\n\n`;
    });
  }

  // === ЛОКАЦИИ ===
  const locations = getEntities("locations").filter((l) => l.enabled);
  if (locations.length > 0) {
    promptText += "### Locations\n\n";
    locations.forEach((loc) => {
      promptText += `**${loc.name}**\n${getLoreCardBody(loc)}\n\n`;
    });
  }

  // Остальные сущности всегда используют прежний ключ и прежнюю позицию.
  setExtensionPrompt(
    "story-manager",
    promptText,
    extension_prompt_types.IN_PROMPT,
    0,
  );

  // === САММАРИ (отдельная настраиваемая инъекция) ===
  const settings = getSettings();
  const summaryChunks = settings.summaryEnabled
    ? getSortedSummaryChunks().filter((chunk) => chunk.enabled !== false)
    : [];
  const summaryText = getCombinedChunkText(summaryChunks);
  let summaryPromptText = "";
  if (summaryText) {
    summaryPromptText = `### Story Summary\n\n${summaryText}\n\n`;
  }

  const roleMap = {
    system: extension_prompt_roles.SYSTEM,
    user: extension_prompt_roles.USER,
    assistant: extension_prompt_roles.ASSISTANT,
  };
  const positionMap = {
    main_prompt: extension_prompt_types.IN_PROMPT,
    before_prompt: extension_prompt_types.BEFORE_PROMPT,
    chat_depth: extension_prompt_types.IN_CHAT,
  };
  const position = positionMap[settings.summaryInjectionPosition]
    ?? extension_prompt_types.IN_PROMPT;
  const depth = settings.summaryInjectionDepth;

  setExtensionPrompt(
    "story-manager-summary",
    summaryPromptText,
    position,
    depth,
    false,
    roleMap[settings.summaryInjectionRole] ?? extension_prompt_roles.SYSTEM,
  );
}
