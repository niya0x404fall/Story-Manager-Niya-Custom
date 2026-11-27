import {
  setExtensionPrompt,
  extension_prompt_roles,
  extension_prompt_types,
} from "../../../../../script.js";
import { getEntities } from "./entities.js";
import { getLoreCardBody } from "./lore-cards.js";
import { getCombinedChunkText, getSortedSummaryChunks } from "./summary-chunks.js";
import { getSettings } from "./settings.js";

export const SUMMARY_MACRO_NAME = "story_manager_summary";
let summaryMacroRegistered = false;

/** Один и тот же текст для штатной вставки и макроса; состояние читается заново. */
export function buildSummaryInjectionText() {
  if (!getSettings().summaryEnabled) return "";

  const chunks = getSortedSummaryChunks().filter((chunk) => chunk.enabled !== false);
  const text = getCombinedChunkText(chunks);
  return text ? `### Story Summary\n\n${text}\n\n` : "";
}

export function isSummaryMacroAvailable() {
  return summaryMacroRegistered;
}

export function getSummaryMacroText() {
  // Пресет можно оставить подключённым при возврате к обычной вставке:
  // макрос становится пустым и не дублирует память.
  if (getSettings().summaryInjectionPosition !== "preset_macro") return "";
  return buildSummaryInjectionText();
}

export function registerSummaryMacro(context = globalThis.SillyTavern?.getContext?.()) {
  if (summaryMacroRegistered) return true;

  const description = "Актуальное саммари Story Manager. Работает в режиме «Через макрос в пресете».";
  try {
    if (typeof context?.registerMacro === "function") {
      // Штатный совместимый API обслуживает старый движок и перенаправляет
      // регистрацию в новый, когда тот включён. Не импортируем новые ST-модули:
      // их может не быть в старой установке.
      context.registerMacro(SUMMARY_MACRO_NAME, getSummaryMacroText, description);
    } else if (typeof context?.macros?.register === "function") {
      context.macros.register(SUMMARY_MACRO_NAME, {
        description,
        handler: getSummaryMacroText,
      });
    } else if (typeof context?.macros?.registry?.registerMacro === "function") {
      context.macros.registry.registerMacro(SUMMARY_MACRO_NAME, {
        description,
        handler: getSummaryMacroText,
      });
    } else {
      return false;
    }
    summaryMacroRegistered = true;
  } catch (error) {
    console.warn("Story Manager: не удалось зарегистрировать макрос саммари", error);
  }
  return summaryMacroRegistered;
}

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
  const useMacro = settings.summaryInjectionPosition === "preset_macro"
    && isSummaryMacroAvailable();
  // Пустая строка очищает уже установленную обычную вставку при смене режима.
  // При недоступном API сохраняем память в Main Prompt (об этом сообщает UI).
  const summaryPromptText = useMacro ? "" : buildSummaryInjectionText();

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
