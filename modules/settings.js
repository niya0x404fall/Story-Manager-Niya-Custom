import { saveSettingsDebounced } from "../../../../../script.js";
import { extension_settings } from "../../../../extensions.js";
import { createDefaultImagePreset } from "./image-defaults.js";
import { DEFAULT_SUMMARY_PROMPT, migrateSummaryPrompt } from "./summary-prompts.js";

export const extensionName = "story-manager";

/** Увеличивать при смене дефолтных промптов карточек (персонаж / локация). */
export const LORE_CARD_PROMPT_VERSION = 3;

const LEGACY_SUMMARY_COMPRESS_PROMPT = `[SCRIPT: summary compression]
Carefully review the current event summary and remove any non-essential information.
Consolidate multiple events occurring on the same day into fewer entries.

MAINTAIN the [dd.mm.yyyy] format for all entries.

Format example:
[15.03.2024] Character A did something important.
[15.03.2024, evening] Character B responded with major action.
[16.03.2024] Multiple events consolidated into key developments.

Rules:
- Keep the tone objective and use past tense.
- Ensure all character names and their key contributions are preserved.
- Merge repetitive or closely related events.
- Preserve chronological order.
- Write STRICTLY in English.`;

const DEFAULT_SUMMARY_COMPRESS_PROMPT = `[SCRIPT: careful roleplay summary compression]

Compress ONLY the supplied existing summary. Do not reinterpret the original roleplay and do not add any new information.

The goal is to reduce repetition and wording while preserving the complete continuity of the story.

You MUST preserve:
- all unique plot events and their chronological order;
- causes and consequences of actions;
- changes in relationships, trust, attraction, conflict, fear, or emotional state;
- promises, agreements, secrets, discoveries, lies, suspicions, and misunderstandings;
- injuries, illnesses, possessions, exchanged or hidden objects;
- changes of location, living arrangements, and important time gaps;
- decisions and facts that may affect future scenes;
- the names of all involved characters and who performed each action.

Compression rules:
- Merge only genuinely repetitive entries.
- Shorten wording instead of deleting unique facts.
- Do not merge separate events merely because they happened on the same day.
- Do not turn specific actions into vague statements.
- Do not remove relationship or character-development details as “minor”.
- Preserve existing date markers. Do not invent, reset, or alter dates.
- Keep the summary approximately 60–70% of its original length.
- Use objective past tense.
- Output only the compressed summary.
- Write STRICTLY in English.`;

const DEFAULT_CHARACTER_PROMPT = `Analyze the provided passage and extract information about ONE new character for a story lorebook card.

Return ONLY a single valid JSON object. No markdown, no code fences, no commentary before or after the JSON.

Required JSON shape:
{
  "name": "string",
  "keywords": "string",
  "sections": {
    "appearance": "string",
    "occupation": "string",
    "character": "string",
    "relationships": "string"
  }
}

Evidence rule (mandatory):
- Record only information explicitly stated or directly demonstrated in the passage.
- Never invent missing appearance, age, occupation, personality, history, motives, relationships, or other facts.
- Do not turn a plausible guess into a fact. If evidence is absent, use "" for that section.
- When evidence is ambiguous, describe only the observed behavior and preserve the uncertainty.

Field rules:

"name"
- Character's display name IN RUSSIAN.
- If the name is unknown, use a short neutral descriptive title based only on visible evidence (e.g. "Незнакомец").

"keywords"
- One comma-separated string (no array).
- Include only names, aliases, titles, and roles supported by the passage. Grammatical Russian declensions of an established term are allowed.
- Do not invent a profession or title merely to create more keywords.

"sections"
- "appearance": Only physical traits, clothing, voice, posture, or movement explicitly described. IN ENGLISH.
- "occupation": Only an explicitly stated role, rank, faction, job, or a skill directly demonstrated by an action. IN ENGLISH.
- "character": Observable behavior, stated values, speech habits, fears, or motives supported by the passage. IN ENGLISH.
- "relationships": Stated or directly demonstrated ties, attitudes, history, and power dynamics. IN ENGLISH.
- Use "" whenever the passage does not establish information for a section.

Scope:
- Describe only ONE new character introduced or focused in the passage.
- Do NOT write a full profile of {{char}} or {{user}} unless they are the new character being catalogued.
- Preserve contradictions or uncertainty instead of resolving them by guessing.

Output:
- Valid JSON only. Escape quotes and newlines inside strings correctly.
- Do not use keys other than "name", "keywords", and "sections" with the four section keys listed above.`;

const DEFAULT_LOCATION_PROMPT = `Analyze the provided passage and extract information about ONE place or location for a story lorebook card.

Return ONLY a single valid JSON object. No markdown, no code fences, no commentary before or after the JSON.

Required JSON shape:
{
  "name": "string",
  "keywords": "string",
  "sections": {
    "atmosphere": "string",
    "features": "string",
    "sensory": "string"
  }
}

Evidence rule (mandatory):
- Record only information explicitly stated or directly demonstrated in the passage.
- Never invent missing architecture, atmosphere, inhabitants, danger, smells, sounds, weather, or history.
- Do not convert a temporary scene detail into a permanent property of the location.
- If evidence is absent, use "" for that section.

Field rules:

"name"
- Location name IN RUSSIAN.
- If unnamed, use a neutral descriptive title based only on the passage (e.g. "Лесная поляна").

"keywords"
- One comma-separated string (no array).
- Include only established names and place types. Grammatical Russian declensions of an established term are allowed.

"sections"
- "atmosphere": Only mood, social tone, danger, comfort, or typical activity explicitly established as characteristic of the place. IN ENGLISH.
- "features": Layout, architecture, furniture, paths, landmarks, exits, objects, and interactive details explicitly present. IN ENGLISH.
- "sensory": Smells, sounds, temperature, textures, lighting, and ambient sensations explicitly described. IN ENGLISH.
- Use "" whenever the passage does not establish information for a section.

Scope:
- Focus on ONE primary place in the passage.
- Do not describe characters' inner lives here.
- Preserve uncertainty and distinguish a momentary condition from an enduring location trait.

Output:
- Valid JSON only. Escape quotes and newlines inside strings correctly.
- Do not use keys other than "name", "keywords", and "sections" with the three section keys listed above.`;

const LEGACY_DEFAULT_SUMMARY_PROMPT = `[SCRIPT: brief event summary]
Based on the provided roleplay snippet, create a concise chronological summary in the following format:
[dd.mm.yyyy] Event description
[dd.mm.yyyy] Event description

Date format rules:
- ALWAYS use [dd.mm.yyyy] format (e.g., [15.03.2024]).
- If no specific date is mentioned, start with [01.01.2024] and increment by days.
- If multiple events happen on the same day, add time: [15.03.2024, morning], [15.03.2024, evening].
- If you see an existing date in previous summary, continue from there.

Content rules:
- Each event must be exactly one sentence.
- Always include character names and their specific actions.
- Record only major plot points; omit minor details or flavor text.
- Use past tense.
- Do not include verbatim dialogue.
- Do not assume events outside of the provided snippet.
- Write STRICTLY in English.`;

const SHIPPED_040_SUMMARY_PROMPT = `[SCRIPT: evidence-based roleplay summary]
Create a concise chronological summary of the supplied roleplay messages.

Use one line per distinct development:
[established date or time] Event description
[date unknown] Event description

Evidence and chronology rules:
- Record only facts, actions, reactions, and developments supported by the supplied messages.
- Never invent a calendar date, time of day, elapsed time, motivation, relationship state, or causal link.
- Use an exact date or time marker only when it is explicitly established in the supplied messages or a user-provided start date.
- If no date is established, use [date unknown]. Do not substitute 01.01.2024 or any other artificial date.
- Do not continue an exact calendar sequence merely because an older summary contains one; older Story Manager versions may have invented it.
- Preserve explicit relative chronology such as "later", "the next morning", or "three days later" without converting it into a calendar date.
- Summarize only the messages supplied in this request. Do not infer omitted messages.

Continuity rules:
- Preserve important actions and their consequences.
- Preserve changes in relationships, trust, attraction, conflict, fear, injuries, possessions, secrets, promises, lies, suspicions, locations, and unresolved decisions.
- Include character names and make clear who performed each action.
- Keep uncertainty and contradictions when the messages do not resolve them.
- Do not repeat unchanged information from the existing summary merely to fill space.
- Paraphrase; do not copy dialogue verbatim.
- Use objective past tense and write STRICTLY in English.
- Output only the summary.`;

function migrateCharacterPromptToEvidenceOnly(prompt) {
  return String(prompt || DEFAULT_CHARACTER_PROMPT)
    .replace(
      '"sections" — each value is a non-empty string unless the passage truly offers nothing for that topic; then use "".',
      '"sections" — use "" whenever the passage does not establish information for that topic.',
    )
    .replace(
      "If the passage is sparse, infer a plausible look consistent with role and personality.",
      'Do not infer missing appearance; use "" when it is not described.',
    )
    .replace(
      "If unclear, infer the most likely role from context.",
      'If no role is stated or directly demonstrated, use "".',
    )
    .replace(
      "The card must be EXHAUSTIVE for this character as far as the passage and reasonable inference allow.",
      "The card must preserve all relevant facts explicitly supported by the passage.",
    )
    .replace(
      'Prefer filling all four sections over leaving them thin; only "relationships" may be "" when nothing relational exists.',
      'Accuracy is more important than filling every section; any section may be "".',
    )
    .replace(
      "Do not invent major plot facts unrelated to the passage; reasonable inference for appearance, occupation, and temperament is allowed.",
      "Do not invent or infer missing appearance, occupation, temperament, relationships, or plot facts.",
    );
}

function migrateLocationPromptToEvidenceOnly(prompt) {
  return String(prompt || DEFAULT_LOCATION_PROMPT)
    .replace(
      '"sections" — each value is a non-empty string unless the passage truly offers nothing for that topic; then use "".',
      '"sections" — use "" whenever the passage does not establish information for that topic.',
    )
    .replace(
      "The card must be EXHAUSTIVE for this location as far as the passage and reasonable inference allow.",
      "The card must preserve all relevant environmental facts explicitly supported by the passage.",
    )
    .replace(
      "Prefer filling all three sections over leaving them thin.",
      'Accuracy is more important than filling every section; any section may be "".',
    )
    .replace(
      "Do not invent major locations or events not supported by the passage; reasonable inference for atmosphere and sensory detail is allowed.",
      "Do not invent or infer missing atmosphere, sensory details, location history, or events.",
    );
}

export const defaultSettings = Object.freeze({
  enabled: true,
  cardPromptVersion: LORE_CARD_PROMPT_VERSION,
  /** Прямые API-запросы по выбранному профилю без переключения глобального connection profile. */
  useDirectProfileRequests: true,
  connectionProfileId: "",
  /** @deprecated хранится в chatMetadata; оставлено для миграции старых настроек */
  targetLorebook: "",

  notePrompt: `Analyze the message provided and create a structured story note.
Return the result STRICTLY in the following format:
Title: [emoji] [Short Title]
Body: [3-4 sentence summary]

Rules:
- Write in English, in the past tense.
- Record only specific facts, plot developments, or discoveries.
- Do not record dialogue or temporary observations.
- Be concise and clear.`,

  characterPrompt: DEFAULT_CHARACTER_PROMPT,

  locationPrompt: DEFAULT_LOCATION_PROMPT,

  characterMessageContext: "older",
  locationMessageContext: "older",

  /** Показывать активные карточки саммари модели. */
  summaryEnabled: false,
  /** Автоматически создавать новую карточку при достижении интервала. */
  summaryAutoEnabled: false,
  summaryInterval: 10,
  /** Отдельная позиция инъекции саммари; остальные сущности остаются в Main Prompt. */
  summaryInjectionPosition: "main_prompt",
  summaryInjectionDepth: 4,
  summaryInjectionRole: "system",

  summaryPrompt: DEFAULT_SUMMARY_PROMPT,

  summaryCompressPrompt: DEFAULT_SUMMARY_COMPRESS_PROMPT,

  imageGlobals: {
    imagesEnabled: false,
    sendCharCard: true,
    sendUserCard: true,
    sendLorebook: true,
  },
  imagePresets: [],
});

/**
 * Добивает отсутствующие поля imageGlobals на месте (без смены ссылки на объект).
 * Иначе UI пишет в старый объект, а extension_settings уже указывает на новый.
 */
export function mergeImageGlobals(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaultSettings.imageGlobals };
  }

  for (const [key, value] of Object.entries(defaultSettings.imageGlobals)) {
    if (raw[key] === undefined) {
      raw[key] = value;
    }
  }

  return raw;
}

function normalizeSettings(rawSettings = {}) {
  const settings = {
    ...defaultSettings,
    ...rawSettings,
  };

  // До 0.3.6 один переключатель одновременно управлял контекстом и автоматикой.
  // При первом обновлении сохраняем прежнее поведение, затем настройки независимы.
  if (!Object.prototype.hasOwnProperty.call(rawSettings, "summaryEnabled")) {
    settings.summaryEnabled = Boolean(rawSettings.summaryAutoEnabled);
  } else {
    settings.summaryEnabled = Boolean(settings.summaryEnabled);
  }
  settings.summaryAutoEnabled = Boolean(settings.summaryAutoEnabled);

  if (!settings.connectionProfileId && rawSettings.profileId) {
    settings.connectionProfileId = rawSettings.profileId;
  }

  if (settings.summaryCompressPrompt === LEGACY_SUMMARY_COMPRESS_PROMPT) {
    settings.summaryCompressPrompt = DEFAULT_SUMMARY_COMPRESS_PROMPT;
  }

  const previousSummaryPrompt = settings.summaryPrompt;
  settings.summaryPrompt = migrateSummaryPrompt(previousSummaryPrompt, [
    LEGACY_DEFAULT_SUMMARY_PROMPT, SHIPPED_040_SUMMARY_PROMPT,
  ]);
  if (settings.summaryPrompt !== previousSummaryPrompt && previousSummaryPrompt &&
      !settings.summaryPromptBeforeChronologyUpdate) {
    settings.summaryPromptBeforeChronologyUpdate = previousSummaryPrompt;
  }

  if (
    settings.characterMessageContext !== "older" &&
    settings.characterMessageContext !== "newer"
  ) {
    settings.characterMessageContext = defaultSettings.characterMessageContext;
  }

  if (
    settings.locationMessageContext !== "older" &&
    settings.locationMessageContext !== "newer"
  ) {
    settings.locationMessageContext = defaultSettings.locationMessageContext;
  }

  // Миграция 0.3.0: отдельное «После истории» — это IN_CHAT на depth 0.
  if (settings.summaryInjectionPosition === "post_history") {
    settings.summaryInjectionPosition = "chat_depth";
    settings.summaryInjectionDepth = 0;
  }

  const summaryInjectionPositions = new Set([
    "main_prompt",
    "before_prompt",
    "chat_depth",
  ]);
  if (!summaryInjectionPositions.has(settings.summaryInjectionPosition)) {
    settings.summaryInjectionPosition = defaultSettings.summaryInjectionPosition;
  }

  const parsedSummaryDepth = Number.parseInt(settings.summaryInjectionDepth, 10);
  settings.summaryInjectionDepth = Number.isInteger(parsedSummaryDepth)
    ? Math.min(10000, Math.max(0, parsedSummaryDepth))
    : defaultSettings.summaryInjectionDepth;

  const summaryInjectionRoles = new Set(["system", "user", "assistant"]);
  if (!summaryInjectionRoles.has(settings.summaryInjectionRole)) {
    settings.summaryInjectionRole = defaultSettings.summaryInjectionRole;
  }

  if (!settings.imageGlobals || typeof settings.imageGlobals !== "object") {
    settings.imageGlobals = { ...defaultSettings.imageGlobals };
  } else {
    mergeImageGlobals(settings.imageGlobals);
  }

  if (!Array.isArray(settings.imagePresets) || settings.imagePresets.length === 0) {
    settings.imagePresets = [createDefaultImagePreset()];
  }

  const promptVersion = Number(settings.cardPromptVersion) || 0;
  if (promptVersion < LORE_CARD_PROMPT_VERSION) {
    if (promptVersion < 2) {
      settings.characterPrompt = defaultSettings.characterPrompt;
      settings.locationPrompt = defaultSettings.locationPrompt;
    } else {
      // Пользовательский текст сохраняется; меняются только старые правила о додумывании.
      settings.characterPrompt = migrateCharacterPromptToEvidenceOnly(
        settings.characterPrompt,
      );
      settings.locationPrompt = migrateLocationPromptToEvidenceOnly(
        settings.locationPrompt,
      );
    }
    settings.cardPromptVersion = LORE_CARD_PROMPT_VERSION;
  }

  return settings;
}

export function initSettings() {
  const current = extension_settings[extensionName];

  if (!current || typeof current !== "object") {
    extension_settings[extensionName] = normalizeSettings({});
    return extension_settings[extensionName];
  }

  const normalized = normalizeSettings(current);
  const { imageGlobals: _normalizedGlobals, ...rest } = normalized;
  const existingGlobals = current.imageGlobals;

  Object.assign(current, rest);

  if (existingGlobals && typeof existingGlobals === "object" && !Array.isArray(existingGlobals)) {
    mergeImageGlobals(existingGlobals);
    current.imageGlobals = existingGlobals;
  } else {
    current.imageGlobals = normalized.imageGlobals;
  }

  return current;
}

export function saveSettings() {
  saveSettingsDebounced();
}

export function getSettings() {
  return initSettings();
}
