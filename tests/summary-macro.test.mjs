import test from "node:test";
import assert from "node:assert/strict";
import { createExtensionHarness, messages } from "./helpers/extension-harness.mjs";

const card = (text, extra = {}) => ({
  id: 1, type: "chunk", startMes: 0, endMes: 1, createdAt: 1,
  text, enabled: true, contextValid: true, ...extra,
});

async function setup(position = "main_prompt", chunks = [card("CHAT_A_MEMORY")]) {
  const h = createExtensionHarness({
    chat: messages(4), chunks,
    settings: { summaryEnabled: true, summaryInjectionPosition: position },
  });
  h.injection = await h.load("modules/injection.js");
  h.settings = (await h.load("modules/settings.js")).getSettings();
  h.handlers = new Map();
  h.context.registerMacro = (name, handler) => h.handlers.set(name, handler);
  h.resolve = () => h.handlers.get("story_manager_summary")();
  return h;
}

test("переход к макросу очищает прежнюю вставку, возврат к Depth не дублирует память", async () => {
  const h = await setup();
  assert.equal(h.injection.registerSummaryMacro(), true);
  h.injection.injectAllEntities();
  const expected = h.extensionPrompts.get("story-manager-summary");
  assert.match(expected, /CHAT_A_MEMORY/);
  assert.equal(h.resolve(), "");

  h.settings.summaryInjectionPosition = "preset_macro";
  h.injection.injectAllEntities();
  assert.equal(h.extensionPrompts.get("story-manager-summary"), "");
  assert.equal(h.resolve(), expected);

  h.settings.summaryInjectionPosition = "chat_depth";
  h.settings.summaryInjectionDepth = 4;
  h.settings.summaryInjectionRole = "user";
  h.injection.injectAllEntities();
  assert.equal(h.resolve(), "");
  assert.equal(h.extensionPrompts.get("story-manager-summary"), expected);
  assert.deepEqual(h.promptCalls.at(-1).slice(2), [1, 4, false, 1]);
  assert.equal(h.calls.length, 0);
});

test("макрос читает правки и текущий чат без кэша и без сохранения данных", async () => {
  const h = await setup("preset_macro");
  h.injection.registerSummaryMacro();
  assert.match(h.resolve(), /CHAT_A_MEMORY/);
  h.context.chatMetadata["story-manager-summary-chunks"][0].text = "EDITED_MEMORY";
  assert.match(h.resolve(), /EDITED_MEMORY/);
  assert.doesNotMatch(h.resolve(), /CHAT_A_MEMORY/);
  h.context = { chat: messages(2), chatMetadata: {
    "story-manager-summary-chunks": [card("CHAT_B_MEMORY")],
  } };
  assert.match(h.resolve(), /CHAT_B_MEMORY/);
  assert.doesNotMatch(h.resolve(), /EDITED_MEMORY|CHAT_A_MEMORY/);
  h.context.chatMetadata = {};
  assert.equal(h.resolve(), "");
  h.context.chatMetadata = null;
  assert.equal(h.resolve(), "");
  assert.equal(h.saves, 0);
  assert.equal(h.calls.length, 0);
});

test("макрос и обычная вставка одинаково исключают отключённые, красные и пустые карточки", async () => {
  const h = await setup("preset_macro", [
    card("LATER", { startMes: 3, endMes: 4 }),
    card("DISABLED", { enabled: false }),
    card("STALE", { contextValid: false }),
    card("MISSING", { sourceUnavailable: true }),
    card("PLACEHOLDER", { type: "placeholder" }),
    card("   "),
    card("EARLIER"),
    card("COMPRESSED", { type: "compressed", startMes: 5, endMes: 9 }),
  ]);
  h.injection.registerSummaryMacro();
  const text = h.resolve();
  assert.doesNotMatch(text, /DISABLED|STALE|MISSING|PLACEHOLDER/);
  assert.ok(text.indexOf("EARLIER") < text.indexOf("LATER"));
  assert.match(text, /COMPRESSED/);
  h.settings.summaryInjectionPosition = "before_prompt";
  h.injection.injectAllEntities();
  assert.equal(h.extensionPrompts.get("story-manager-summary"), text);
  assert.equal(h.promptCalls.at(-1)[2], 2);
});

test("выключение памяти обнуляет макрос; заметки, NPC и локации продолжают отправляться", async () => {
  const h = await setup("preset_macro");
  h.injection.registerSummaryMacro();
  h.context.chatMetadata["story-manager-notes"] = [{ enabled: true, title: "Note", body: "NOTE_BODY" }];
  h.context.chatMetadata["story-manager-characters"] = [{ enabled: true, name: "NPC", body: "NPC_BODY" }];
  h.context.chatMetadata["story-manager-locations"] = [{ enabled: true, name: "Place", body: "PLACE_BODY" }];
  h.injection.injectAllEntities();
  assert.match(h.extensionPrompts.get("story-manager"), /NOTE_BODY[\s\S]*NPC_BODY[\s\S]*PLACE_BODY/);
  h.settings.summaryEnabled = false;
  assert.equal(h.resolve(), "");
  h.injection.injectAllEntities();
  assert.equal(h.extensionPrompts.get("story-manager-summary"), "");
  assert.match(h.extensionPrompts.get("story-manager"), /NOTE_BODY/);
});

for (const api of ["legacy", "modern", "registry"]) {
  test(`регистрация через ${api}: обработчик синхронный, регистрация однократная`, async () => {
    const h = await setup("preset_macro");
    let registrations = 0;
    let handler;
    const capture = (name, value) => {
      registrations++;
      assert.equal(name, "story_manager_summary");
      handler = typeof value === "function" ? value : value.handler;
    };
    const context = api === "legacy" ? { registerMacro: capture }
      : api === "modern" ? { macros: { register: capture } }
      : { macros: { registry: { registerMacro: capture } } };
    assert.equal(h.injection.registerSummaryMacro(context), true);
    assert.equal(h.injection.registerSummaryMacro(context), true);
    assert.equal(registrations, 1);
    assert.equal(typeof handler(), "string");
    assert.match(handler(), /CHAT_A_MEMORY/);
  });
}

test("без API макроса сохранённый режим оставляет рабочую обычную вставку", async () => {
  const h = await setup("preset_macro");
  assert.equal(h.injection.registerSummaryMacro({}), false);
  assert.equal(h.injection.isSummaryMacroAvailable(), false);
  h.injection.injectAllEntities();
  assert.match(h.extensionPrompts.get("story-manager-summary"), /CHAT_A_MEMORY/);
  assert.equal(h.promptCalls.at(-1)[2], 0);
  // Если API появился позже, повторная попытка регистрации допустима.
  assert.equal(h.injection.registerSummaryMacro(), true);
  h.injection.injectAllEntities();
  assert.equal(h.extensionPrompts.get("story-manager-summary"), "");
});

test("новая настройка сохраняется нормализацией; прежний режим остаётся дефолтным", async () => {
  const h = await setup("preset_macro");
  assert.equal(h.settings.summaryInjectionPosition, "preset_macro");
  const original = createExtensionHarness();
  const settings = await original.load("modules/settings.js");
  assert.equal(settings.getSettings().summaryInjectionPosition, "main_prompt");
});
