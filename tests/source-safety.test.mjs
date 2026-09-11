import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_SUMMARY_PROMPT } from "../modules/summary-prompts.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Не найден маркер ${startMarker}`);
  assert.notEqual(end, -1, `Не найден маркер ${endMarker}`);
  return source.slice(start, end);
}

test("новые дефолтные промпты не выдумывают факты и дату", async () => {
  const source = await read("modules/settings.js");
  const character = between(
    source,
    "const DEFAULT_CHARACTER_PROMPT",
    "const DEFAULT_LOCATION_PROMPT",
  );
  const location = between(
    source,
    "const DEFAULT_LOCATION_PROMPT",
    "const LEGACY_DEFAULT_SUMMARY_PROMPT",
  );

  assert.match(character, /Never invent missing appearance/);
  assert.doesNotMatch(character, /infer a plausible look/);
  assert.match(location, /Never invent missing architecture/);
  assert.doesNotMatch(location, /reasonable inference/);
  assert.match(DEFAULT_SUMMARY_PROMPT, /Never insert \[date unknown\], \[unknown\]/);
  assert.doesNotMatch(DEFAULT_SUMMARY_PROMPT, /start with \[01\.01\.2024\]/);
});

test("остановка Story Manager не вызывает глобальный stopGeneration", async () => {
  const cancellation = await read("modules/summary-cancellation.js");
  const timeout = await read("modules/generation-timeout.js");

  assert.doesNotMatch(cancellation, /\bstopGeneration\b/);
  assert.doesNotMatch(timeout, /\bstopGeneration\b/);
});

test("сверка истории выполняется до сборки extension prompt", async () => {
  const events = await read("events/chat-events.js");

  assert.match(events, /eventTypes\.GENERATION_AFTER_COMMANDS/);
  assert.doesNotMatch(events, /eventTypes\.GENERATE_BEFORE_COMBINE_PROMPTS/);
});

test("hide управляет сырым контекстом, но не инвалидирует готовое саммари", async () => {
  const integrity = await read("modules/summary-integrity.js");
  const chunks = await read("modules/summary-chunks.js");
  const events = await read("events/chat-events.js");

  assert.match(integrity, /result\.changedMessageIds = \[\.\.\.result\.contentChangedMessageIds\]/);
  assert.doesNotMatch(integrity, /Boolean\(message\.is_system\) === Boolean\(state\.hidden\)/);
  assert.doesNotMatch(chunks, /legacyChunkCoversHiddenMessage/);
  assert.doesNotMatch(events, /MutationObserver/);
});

test("кнопка Stop автосаммари появляется после создания AbortController", async () => {
  const actions = await read("modules/summary-actions.js");
  const start = actions.indexOf("export async function runSummaryChunkGeneration");
  const end = actions.indexOf("export async function runManualSummaryRange", start);
  const body = actions.slice(start, end);

  assert.ok(body.indexOf("beginSummaryBatchCancellation()") >= 0);
  assert.ok(body.indexOf("onProgress?.(0, 1)") >= 0);
  assert.ok(
    body.indexOf("beginSummaryBatchCancellation()") <
      body.indexOf("onProgress?.(0, 1)"),
  );
});

test("выключенная автоматика блокирует запуск и сохранение готового ответа", async () => {
  const auto = await read("app/summary-auto.js");
  const actions = await read("modules/summary-actions.js");
  const generator = await read("modules/generators/summary.js");

  assert.match(auto, /if \(!isAutomaticSummaryEnabled\(\)\)/);
  assert.match(auto, /shouldCommit: \(\) =>/);
  assert.match(auto, /areAutomaticSummaryPlansEqual\(plan, currentPlan\)/);
  assert.match(auto, /stopAutomaticSummaryGeneration/);
  assert.match(auto, /toggles\.every\(\(toggle\) => toggle\.checked\)/);
  assert.match(actions, /shouldCommit/);
  assert.match(generator, /typeof shouldCommit === "function" && !shouldCommit\(\)/);
});

test("автосаммари проверяется после любого сообщения без привязки к автору", async () => {
  const events = await read("events/summary-events.js");
  const auto = await read("app/summary-auto.js");
  const uiText = await read("modules/ui-text.js");

  assert.match(events, /eventTypes\.USER_MESSAGE_RENDERED/);
  assert.match(events, /eventTypes\.CHARACTER_MESSAGE_RENDERED/);
  assert.match(events, /maybeGenerateSummary\(messageId\)/);
  assert.match(auto, /getNextAutomaticSummaryPlan/);
  assert.match(auto, /selectedMessages/);
  assert.match(uiText, /сообщения от вас или бота/);
  assert.doesNotMatch(uiText, /запускается с вашим следующим сообщением/);
});

test("панель повторно читает настройки после EXTENSION_SETTINGS_LOADED", async () => {
  const ui = await read("modules/ui.js");
  const settingsUi = await read("modules/ui/summary-settings.js");

  assert.match(ui, /event_types\.EXTENSION_SETTINGS_LOADED/);
  assert.match(ui, /refreshSummarySettingsUI\(\$settingsPanel\)/);
  assert.match(settingsUi, /export function refreshSummarySettingsUI/);
  assert.match(settingsUi, /#story_summary_auto_enabled/);
});

test("мобильные иконки имеют отдельную сенсорную площадку, а красный статус объяснён", async () => {
  const css = await read("style.css");
  const template = await read("templates/settings.html");

  assert.match(css, /\.story-note-actions > span[\s\S]*?width: 34px/);
  assert.match(css, /\.story-note-actions > \.fa-trash[\s\S]*?width: 42px/);
  assert.match(template, /story-summary-stale-hint/);
  assert.match(template, /Она не передаётся модели/);
  assert.match(template, /hide\/unhide на неё не влияет/);
});

test("служебная placeholder-заглушка не показывается как пустая карточка", async () => {
  const summaryList = await read("modules/ui/summary-list.js");

  assert.match(
    summaryList,
    /getItems: \(\) =>[\s\S]*?filter\(\(chunk\) => !isSummaryPlaceholderChunk\(chunk\)\)/,
  );
});

test("удаление карточек требует подтверждения до изменения данных", async () => {
  const cardList = await read("modules/ui/card-list.js");
  const uiText = await read("modules/ui-text.js");
  const summaryList = await read("modules/ui/summary-list.js");
  const handler = between(
    cardList,
    "if (deleteSelector)",
    "for (const action of actions)",
  );

  assert.match(uiText, /cardDeleteConfirm\(title\)/);
  assert.match(cardList, /window\.confirm\(fmt\.cardDeleteConfirm/);
  assert.ok(handler.indexOf("await confirmDelete") >= 0);
  assert.ok(handler.indexOf("await confirmDelete") < handler.indexOf("onDelete"));
  assert.ok(handler.indexOf("await confirmDelete") < handler.indexOf("deleteEntity"));
  assert.match(summaryList, /getTitle: \(chunk\) => formatChunkTitle/);
});

test("внешние картинки не имеют интерфейса или активных обработчиков", async () => {
  const settingsTemplate = await read("templates/settings.html");
  const messageButtons = await read("templates/message-buttons.html");
  const events = await read("events/register-events.js");
  const ui = await read("modules/ui.js");
  const refresh = await read("app/chat-refresh.js");
  const buttons = await read("modules/buttons.js");

  assert.doesNotMatch(settingsTemplate, /story_image_section/);
  assert.doesNotMatch(messageButtons, /story-manager-image-button-template/);
  assert.doesNotMatch(events, /bindImageEvents/);
  assert.doesNotMatch(ui, /initImagesUI|initImageMessageEditor|refreshImagesChatUI/);
  assert.doesNotMatch(refresh, /refreshAllImageBlocks|refreshImageButtons/);
  assert.doesNotMatch(buttons, /story-manager-image-btn|generateImageBlock/);
});
