/** Общие правила хронологии. Формат статуса персонажа не привязан к одному шаблону. */
export const SUMMARY_CHRONOLOGY_RULES = `Chronology rules:
- Read in-world dates and times anywhere in the supplied message text: narration, dialogue, scene headers, status panels, HTML, custom tags such as [[THOUGHTS|...]], or other structured blocks. A date does not have to be at the beginning of a message.
- Use the date/time of the event being summarized. Distinguish the current scene from dates mentioned in memories, plans, birthdays, quotations, examples, or instructions.
- Carry the last established story date from the Existing Summary into the next Messages section until the story explicitly changes it. Do not repeat the previous events. Explicit dates in the current scene take precedence over conflicting older markers.
- When the story explicitly advances by a known amount (for example, the next morning or three days later), advance the established calendar date by that amount. If there is no calendar anchor, preserve the relative marker instead.
- Preserve the available precision. When a full day, month, and year are established, use [dd.mm.yyyy] and include the stated time when useful. When only a clock time is known, use [HH:MM]; when only a partial date or relative time is known, preserve it without filling in missing parts.
- Do not infer a day change merely because a clock goes backwards. Keep unresolved chronology ambiguous rather than inventing a transition or silently correcting the story.
- Never use real message timestamps (send_date, generation times), current real-world time, filenames, image URLs, or dates inside image-generation instructions as the story calendar. Do not copy illustrative dates from prompts into the story.
- A user-provided story start date is optional. Use it only as a supplied anchor; no start-date field is required when the story already establishes dates or times.
- If no date or time is established, write the event without a time prefix. Never insert [date unknown], [unknown], a made-up initial date, or any other placeholder.`;

export const DEFAULT_SUMMARY_PROMPT = `[SCRIPT: evidence-based roleplay summary with story chronology]
Create a concise chronological summary of the supplied roleplay messages.
Use one line per distinct development, with an established date/time in brackets when available, followed by the event description.

${SUMMARY_CHRONOLOGY_RULES}

Evidence and continuity rules:
- Record only facts, actions, reactions, and developments supported by the supplied Messages section. Do not infer omitted messages or treat omission as proof that an earlier event never happened.
- Never invent a motivation, relationship state, causal link, or event.
- Preserve important actions and their consequences, relationship changes, trust, attraction, conflict, fear, injuries, possessions, secrets, promises, lies, suspicions, locations, and unresolved decisions.
- Include character names and make clear who performed each action.
- Keep uncertainty and contradictions when the messages do not resolve them.
- Paraphrase; do not copy dialogue verbatim.
- Use objective past tense and write STRICTLY in English.
- Output only the summary.`;

const OLD_CHRONOLOGY_LINES = [
  "- ALWAYS use [dd.mm.yyyy] format (e.g., [15.03.2024]).",
  "- If no specific date is mentioned, start with [01.01.2024] and increment by days.",
  "- If no specific date is established, use [date unknown]. Never invent a calendar date.",
  "- Use an exact date or time marker only when it is explicitly established in the supplied messages or a user-provided start date.",
  "- If no date is established, use [date unknown]. Do not substitute 01.01.2024 or any other artificial date.",
  "- Do not continue an exact calendar sequence merely because an older summary contains one; older Story Manager versions may have invented it.",
  '- Preserve explicit relative chronology such as "later", "the next morning", or "three days later" without converting it into a calendar date.',
  "[date unknown] Event description",
];

/** Меняем только целый прежний дефолт или известные ошибочные строки из него. */
export function migrateSummaryPrompt(prompt, shippedDefaults = []) {
  if (!String(prompt || "").trim()) return DEFAULT_SUMMARY_PROMPT;
  const original = String(prompt);
  const canonical = (text) => text.replace(
    "- Treat hidden or absent messages as events that did not occur.",
    "- Summarize only the messages supplied in this request. Do not infer omitted messages.",
  ).replaceAll("\r\n", "\n").trim();
  if (shippedDefaults.some((value) => canonical(value) === canonical(original))) {
    return DEFAULT_SUMMARY_PROMPT;
  }
  let migrated = original;
  let chronologyChanged = false;
  for (const line of OLD_CHRONOLOGY_LINES) {
    if (migrated.includes(line)) {
      migrated = migrated.replaceAll(line, "");
      chronologyChanged = true;
    }
  }
  migrated = migrated.replace(
    "- Treat hidden or absent messages as events that did not occur.",
    "- Summarize only the messages supplied in this request. Do not infer omitted messages.",
  );
  if (chronologyChanged && !migrated.includes(SUMMARY_CHRONOLOGY_RULES)) {
    migrated = `${migrated.trim()}\n\n${SUMMARY_CHRONOLOGY_RULES}`;
  }
  return migrated;
}
