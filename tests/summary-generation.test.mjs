import test from "node:test";
import assert from "node:assert/strict";
import { createExtensionHarness, messages, plain, deferred } from "./helpers/extension-harness.mjs";
import { captureSelectedSummarySources, selectSummarySources, captureEditedSummarySources, getSummarySourceChoices, getVisibleExcludedSummarySourceIds } from "../modules/summary-sources.js";
import { hasExactSummarySources, isSummarySourceStateCurrent } from "../modules/summary-integrity.js";
import { DEFAULT_SUMMARY_PROMPT, migrateSummaryPrompt } from "../modules/summary-prompts.js";

async function setup(count = 5, settings = {}) {
  const h = createExtensionHarness({ chat: messages(count), settings });
  h.generator = await h.load("modules/generators/summary.js");
  h.history = await h.load("modules/summary-history.js");
  h.chunks = await h.load("modules/summary-chunks.js");
  h.entities = await h.load("modules/entities.js");
  return h;
}

function markSummaryTrackingStarted(h, anchor = 0) {
  h.context.chatMetadata["story-manager-summary-state"] = {
    compressionBackup: null,
    lastKnownChatLength: h.context.chat.length,
    summaryAnchorMes: anchor,
    summaryFrontierVersion: 1,
    summaryChatInitialized: true,
  };
}

test("автоматика берёт ровно interval видимых сообщений и оставляет safety tail", async () => {
  const h = await setup(5, { summaryInterval: 3 });
  markSummaryTrackingStarted(h);
  h.context.chat[1].is_system = true;
  h.context.chat[4].is_user = false;

  const plan = h.chunks.getNextAutomaticSummaryPlan(3, h.context.chat);
  assert.deepEqual(plain(plan), {
    start: 0,
    end: 3,
    sourceMessageIds: [0, 2, 3],
  });

  const selectedMessages = plan.sourceMessageIds.map((messageId) => ({
    messageId,
    message: h.context.chat[messageId],
  }));
  await h.generator.generateSummaryChunk({
    range: { start: plan.start, end: plan.end },
    selectedMessages,
  });

  assert.equal(h.calls.length, 1);
  assert.doesNotMatch(h.calls[0].prompt, /EVENT_1/);
  // Последнее видимое сообщение остаётся защитным хвостом независимо от автора.
  assert.doesNotMatch(h.calls[0].prompt, /EVENT_4/);
  assert.deepEqual(
    plain(h.cards()[0].sourceMessageStates.map((state) => state.messageId)),
    [0, 2, 3],
  );
});

test("автоматика не растягивает карточку до следующего пользовательского хода", async () => {
  const h = await setup(5);
  markSummaryTrackingStarted(h);
  h.context.chat[0].is_user = true;
  h.context.chat[4].is_user = true;

  const plan = h.chunks.getNextAutomaticSummaryPlan(2, h.context.chat);
  assert.deepEqual(plain(plan), {
    start: 0,
    end: 1,
    sourceMessageIds: [0, 1],
  });
});

test("роль автора не запрещает пользовательскому сообщению завершить карточку", async () => {
  const h = await setup(4);
  markSummaryTrackingStarted(h);
  h.context.chat[1].is_user = true;

  const plan = h.chunks.getNextAutomaticSummaryPlan(2, h.context.chat);
  assert.deepEqual(plain(plan), {
    start: 0,
    end: 1,
    sourceMessageIds: [0, 1],
  });
});

test("скрытые сообщения не приближают порог автосаммари", async () => {
  const h = await setup(6);
  markSummaryTrackingStarted(h);
  h.context.chat[0].is_user = true;
  h.context.chat[1].is_system = true;
  h.context.chat[2].is_system = true;
  h.context.chat[3].is_system = true;
  h.context.chat[5].is_user = false;

  assert.equal(h.chunks.getPendingVisibleMessageCount(h.context.chat), 3);
  assert.equal(h.chunks.getNextAutomaticSummaryPlan(3, h.context.chat), null);
  assert.equal(h.calls.length, 0);
});

test("следующее автосаммари не повторяет уже записанные mesid", async () => {
  const h = await setup(7, { summaryInterval: 2 });
  markSummaryTrackingStarted(h);
  h.context.chat[0].is_user = true;
  h.context.chat[1].is_user = true;
  h.context.chat[4].is_user = true;

  const first = h.chunks.getNextAutomaticSummaryPlan(2, h.context.chat);
  const firstSelection = first.sourceMessageIds.map((messageId) => ({
    messageId,
    message: h.context.chat[messageId],
  }));
  await h.generator.generateSummaryChunk({
    range: { start: first.start, end: first.end },
    selectedMessages: firstSelection,
  });

  const second = h.chunks.getNextAutomaticSummaryPlan(2, h.context.chat);
  assert.deepEqual(plain(second), {
    start: 2,
    end: 3,
    sourceMessageIds: [2, 3],
  });
  assert.equal(second.sourceMessageIds.some((id) => first.sourceMessageIds.includes(id)), false);
});

test("ручной остров не перескакивает дыру: сначала partial, затем продолжение", async () => {
  const h = await setup(159, { summaryInterval: 20 });
  markSummaryTrackingStarted(h, 120);

  await h.generator.generateSummaryChunkForRange({ start: 130, end: 137 });

  const gapPlan = h.chunks.getNextAutomaticSummaryPlan(20, h.context.chat);
  assert.deepEqual(plain(gapPlan), {
    start: 120,
    end: 129,
    sourceMessageIds: Array.from({ length: 10 }, (_, index) => 120 + index),
  });

  await h.generator.generateSummaryChunk({
    range: { start: gapPlan.start, end: gapPlan.end },
    selectedMessages: gapPlan.sourceMessageIds.map((messageId) => ({
      messageId,
      message: h.context.chat[messageId],
    })),
  });

  const nextPlan = h.chunks.getNextAutomaticSummaryPlan(20, h.context.chat);
  assert.deepEqual(plain(nextPlan), {
    start: 138,
    end: 157,
    sourceMessageIds: Array.from({ length: 20 }, (_, index) => 138 + index),
  });
});

test("ручной диапазон после дыры получает точное предупреждение", async () => {
  const h = await setup(140);
  markSummaryTrackingStarted(h, 120);
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 119 });

  assert.deepEqual(
    plain(h.chunks.getUncoveredVisibleRangeBefore(130, h.context.chat)),
    { start: 120, end: 129 },
  );

  await h.generator.generateSummaryChunkForRange({ start: 120, end: 129 });
  assert.equal(h.chunks.getUncoveredVisibleRangeBefore(130, h.context.chat), null);
});

test("предупреждение перед ручным островом находит дыру даже за временно ушедшим frontier", async () => {
  const h = await setup(13);
  markSummaryTrackingStarted(h, 12);

  await h.generator.generateSummaryChunkForRange({ start: 0, end: 9 });
  h.context.chat[11].is_system = true;

  assert.deepEqual(
    plain(h.chunks.getUncoveredVisibleRangeBefore(12, h.context.chat)),
    { start: 10, end: 10 },
  );
});

test("ручной генератор не отправляет запрос через непокрытую историю без явного разрешения", async () => {
  const h = await setup(13);
  markSummaryTrackingStarted(h, 12);

  await h.generator.generateSummaryChunkForRange({ start: 0, end: 9 });
  h.context.chat[11].is_system = true;
  const actions = await h.load("modules/summary-actions.js");

  await assert.rejects(
    () => actions.runManualSummaryRange(12, 12),
    /непокрытые видимые сообщения 10–10/,
  );
  assert.equal(h.calls.length, 1);
});

test("hide или unhide в полёте меняет автоматический план до commit", async () => {
  const h = await setup(4, { summaryInterval: 2 });
  markSummaryTrackingStarted(h);

  const beforeHide = h.chunks.getNextAutomaticSummaryPlan(2, h.context.chat);
  h.context.chat[0].is_system = true;
  const afterHide = h.chunks.getNextAutomaticSummaryPlan(2, h.context.chat);
  assert.equal(h.chunks.areAutomaticSummaryPlansEqual(beforeHide, afterHide), false);

  h.context.chat[0].is_system = false;
  assert.equal(
    h.chunks.areAutomaticSummaryPlansEqual(
      beforeHide,
      h.chunks.getNextAutomaticSummaryPlan(2, h.context.chat),
    ),
    true,
  );
});

test("создание исключает скрытую ветку, хранит ровно отправленные mesid", async () => {
  const h = await setup();
  h.context.chat[2].is_system = true;
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 4 });
  assert.equal(h.calls.length, 1);
  assert.doesNotMatch(h.calls[0].prompt, /EVENT_2/);
  assert.deepEqual(plain(h.cards()[0].sourceMessageStates.map((s) => s.messageId)), [0, 1, 3, 4]);
  assert.equal(hasExactSummarySources(h.cards()[0]), true);
  h.context.chat[2].mes = "discarded branch edited";
  h.history.reconcileSummaryHistory();
  h.chunks.syncSummaryStateWithChat(5, { auditSources: true });
  assert.equal(h.cards()[0].contextValid, true);
});

test("сценарий Нии: скрытие 0–60 после саммари 0–80 сохраняет контекст и исходники", async () => {
  const h = await setup(100);
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 80 });
  const before = h.chunks.getCombinedChunkText();
  for (let id = 0; id <= 60; id++) h.context.chat[id].is_system = true;
  h.history.reconcileSummaryHistory();
  h.chunks.syncSummaryStateWithChat(100, { auditSources: true });
  assert.equal(h.chunks.getCombinedChunkText(), before);
  assert.equal(h.calls.length, 1);
  const card = h.cards()[0];
  assert.equal(card.sourceMessageStates.length, 81);
  await h.generator.regenerateSummaryChunk(card.id, { sourceMode: "original" });
  const payloadIds = [...h.calls[1].prompt.matchAll(/^\[(\d+)\] Character:/gm)].map((m) => +m[1]);
  assert.deepEqual(payloadIds, Array.from({ length: 81 }, (_, id) => id));
  assert.equal(h.cards()[0].contextValid, true);
});

test("открытая исключённая ветка даёт подсказку и пробел, не выключая саммари", async () => {
  const h = await setup(3);
  h.context.chat[1].is_system = true;
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 2 });
  assert.deepEqual(plain(h.chunks.getUncoveredSummaryGaps()), []);
  h.context.chat[1].is_system = false;
  h.history.reconcileSummaryHistory();
  const card = h.cards()[0];
  assert.equal(card.contextValid, true);
  assert.deepEqual(getVisibleExcludedSummarySourceIds(h.context.chat, card), [1]);
  assert.deepEqual(plain(h.chunks.getUncoveredSummaryGaps()), [{ start: 1, end: 1 }]);
  await h.generator.regenerateSummaryChunk(card.id, { sourceMode: "original" });
  assert.doesNotMatch(h.calls[1].prompt, /EVENT_1/);
  await h.generator.regenerateSummaryChunk(card.id, { sourceMode: "visible" });
  assert.match(h.calls[2].prompt, /EVENT_1/);
  assert.deepEqual(getVisibleExcludedSummarySourceIds(h.context.chat, card), []);
});

test("↻ только видимые теперь исключает скрытые после создания сообщения", async () => {
  const h = await setup(3);
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 2 });
  h.context.chat[0].is_system = true;
  await h.generator.regenerateSummaryChunk(h.cards()[0].id, { sourceMode: "visible" });
  assert.doesNotMatch(h.calls[1].prompt, /EVENT_0/);
  assert.deepEqual(plain(h.cards()[0].sourceMessageStates.map((s) => s.messageId)), [1, 2]);
});

test("карандаш бесплатно подтверждает текст, не добавляя исключённые исходники", async () => {
  const h = await setup(3);
  h.context.chat[1].is_system = true;
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 2 });
  const card = h.cards()[0];
  h.context.chat[0].mes = "Edited source";
  h.history.reconcileSummaryHistory();
  assert.equal(h.cards()[0].contextValid, false);
  const current = h.cards()[0];
  h.entities.updateEntity("summaryChunks", card.id, {
    text: current.text, contextValid: true, sourceUnavailable: false,
    ...captureEditedSummarySources(h.context.chat, current),
  });
  h.chunks.syncSummaryStateWithChat(3, { auditSources: true });
  assert.equal(h.cards()[0].contextValid, true);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(plain(h.cards()[0].sourceMessageStates.map((s) => s.messageId)), [0, 2]);
});

test("старые карточки не получают выдуманную точную историю исходников", async () => {
  const h = await setup(3);
  h.context.chat[1].is_system = true;
  const old = { id: 10, type: "chunk", startMes: 0, endMes: 2, text: "Old correct text", contextValid: true };
  Object.assign(old, captureEditedSummarySources(h.context.chat, old));
  h.entities.setEntities("summaryChunks", [old]);
  assert.equal(hasExactSummarySources(old), false);
  assert.deepEqual(getSummarySourceChoices(h.context.chat, old).choices.map((c) => c.mode), ["visible", "all"]);
  await assert.rejects(h.generator.regenerateSummaryChunk(10, { sourceMode: "original" }), /не сохранён/);
  await assert.rejects(h.generator.regenerateSummaryChunk(10), /Выберите/);
  assert.equal(h.calls.length, 0);
  assert.equal(old.text, "Old correct text");
  await h.generator.regenerateSummaryChunk(10, { sourceMode: "all" });
  assert.match(h.calls[0].prompt, /EVENT_1/);
  assert.equal(hasExactSummarySources(h.cards()[0]), true);
});

test("пустой видимый набор не тратит запрос и сохраняет старую карточку", async () => {
  const h = await setup(2);
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 1 });
  for (const message of h.context.chat) message.is_system = true;
  const before = plain(h.cards());
  await assert.rejects(h.generator.regenerateSummaryChunk(before[0].id, { sourceMode: "visible" }), /нет сообщений/);
  assert.equal(await h.generator.generateSummaryChunkForRange({ start: 0, end: 1 }), null);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(plain(h.cards()), before);
});

test("изменение видимости во время запроса не меняет зафиксированный состав", async () => {
  const h = await setup(3);
  h.context.chat[1].is_system = true;
  const pending = deferred(); h.reply = () => pending.promise;
  const generation = h.generator.generateSummaryChunkForRange({ start: 0, end: 2 });
  h.context.chat[0].is_system = true;
  h.context.chat[1].is_system = false;
  pending.resolve("Canonical summary");
  await generation;
  assert.deepEqual(plain(h.cards()[0].sourceMessageStates.map((s) => s.messageId)), [0, 2]);
  assert.equal(h.cards()[0].contextValid, true);
});

test("правка исходника в полёте запрещает сохранить поздний ответ", async () => {
  const h = await setup(3);
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 2 });
  const card = h.cards()[0]; const oldText = card.text;
  const pending = deferred(); h.reply = () => pending.promise;
  const generation = h.generator.regenerateSummaryChunk(card.id, { sourceMode: "original" });
  h.context.chat[0].mes = "Different event";
  pending.resolve("Outdated result");
  await assert.rejects(generation, /Исходники изменились/);
  assert.equal(h.cards()[0].text, oldText);
});

test("удаление исключённой ветки только сдвигает mesid; удаление источника инвалидирует", async () => {
  const h = await setup(4);
  h.context.chat[1].is_system = true;
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 3 });
  h.context.chat.splice(1, 1);
  h.history.reconcileSummaryHistory();
  assert.equal(h.cards()[0].contextValid, true);
  assert.deepEqual(plain(h.cards()[0].sourceMessageStates.map((s) => s.messageId)), [0, 1, 2]);
  assert.equal(isSummarySourceStateCurrent(h.cards()[0], h.context.chat), true);
  h.context.chat.splice(1, 1);
  h.history.reconcileSummaryHistory();
  assert.equal(h.cards()[0].contextValid, false);
  assert.equal(h.chunks.getCombinedChunkText(), "");
});

test("перезапуск сохраняет точный состав: hide допустим, свайп источника замечается", async () => {
  const h = await setup(3);
  h.context.chat[1].is_system = true;
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 2 });
  const next = createExtensionHarness({ chat: plain(h.context.chat), chunks: plain(h.cards()) });
  const chunks = await next.load("modules/summary-chunks.js");
  next.context.chat[0].is_system = true;
  next.context.chat[1].mes = "Excluded edit after restart";
  chunks.syncSummaryStateWithChat(3, { auditSources: true });
  assert.equal(next.cards()[0].contextValid, true);
  next.context.chat[2].swipe_id = 1;
  chunks.syncSummaryStateWithChat(3, { auditSources: true });
  assert.equal(next.cards()[0].contextValid, false);
});

test("сжатие и откат сохраняют состав источников, выключенные и более поздние карточки", async () => {
  const h = await setup(10);
  h.context.chat[1].is_system = true;
  const card = (id, start, end, enabled = true) => ({
    id, type: "chunk", startMes: start, endMes: end, text: `SUMMARY_${id}`, enabled, contextValid: true,
    ...captureSelectedSummarySources(selectSummarySources(h.context.chat, { startMes: start, endMes: end }, "visible")),
  });
  const initial = [card(10, 0, 2, false), card(20, 3, 4), card(30, 5, 6)];
  h.entities.setEntities("summaryChunks", initial);
  await h.generator.compressSummary([10, 30]);
  assert.match(h.calls[0].prompt, /SUMMARY_10/);
  assert.doesNotMatch(h.calls[0].prompt, /SUMMARY_20/);
  const compressed = h.cards().find((c) => c.type === "compressed");
  assert.deepEqual(plain(compressed.sourceMessageStates.map((s) => s.messageId)), [0, 2, 5, 6]);
  h.entities.createEntity("summaryChunks", card(40, 7, 9));
  h.generator.rollbackCompression();
  assert.deepEqual(plain(h.cards().map((c) => c.id).sort((a,b) => a-b)), [10, 20, 30, 40]);
  assert.equal(h.cards().find((c) => c.id === 10).enabled, false);
  assert.deepEqual(plain(h.cards().find((c) => c.id === 10).sourceMessageStates.map((s) => s.messageId)), [0, 2]);
});

test("календарный запрос сохраняет статусы в тексте и продолжение предыдущего саммари", async () => {
  const h = await setup(3);
  h.context.chat[0].mes = '<section class="status">Дата: 15.03.2042; время: 23:50</section> EVENT_0';
  h.context.chat[1].mes = "The next morning. [[THOUGHTS|Hero|calm|10:24|Thought]] EVENT_1";
  h.reply = async () => "[15.03.2042, 23:50] An established event.";
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 0 });
  await h.generator.generateSummaryChunkForRange({ start: 1, end: 2 });
  assert.match(h.calls[0].prompt, /<section class="status">Дата: 15\.03\.2042; время: 23:50/);
  assert.match(h.calls[1].prompt, /Existing Summary[\s\S]*15\.03\.2042, 23:50/);
  assert.match(h.calls[1].prompt, /\[\[THOUGHTS\|Hero\|calm\|10:24\|Thought\]\]/);
  assert.doesNotMatch(h.calls[1].prompt, /REAL_TIMESTAMP|Дата начала событий/);
  assert.equal(h.calls[1].systemPrompt, DEFAULT_SUMMARY_PROMPT);
});

test("миграция исправляет прежний дефолт и сохраняет пользовательские дополнения", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../modules/settings.js", import.meta.url), "utf8");
  const shipped = source.match(/const SHIPPED_040_SUMMARY_PROMPT = `([\s\S]*?)`;/)[1];
  const h = await setup(1, { summaryPrompt: shipped });
  const settingsModule = await h.load("modules/settings.js");
  const settings = settingsModule.getSettings();
  assert.equal(settings.summaryPrompt, DEFAULT_SUMMARY_PROMPT);
  assert.equal(settings.summaryPromptBeforeChronologyUpdate, shipped);
  assert.equal(settingsModule.getSettings().summaryPrompt, DEFAULT_SUMMARY_PROMPT);
  const custom = `${shipped}\nMY CUSTOM RULE: Write in Russian. Preserve every object.`;
  const migrated = migrateSummaryPrompt(custom, [shipped]);
  assert.match(migrated, /MY CUSTOM RULE: Write in Russian\. Preserve every object\./);
  assert.doesNotMatch(migrated, /If no date is established, use \[date unknown\]/);
  assert.match(migrated, /Carry the last established story date/);
  assert.equal(migrateSummaryPrompt(migrated, [shipped]), migrated);
  assert.equal(migrateSummaryPrompt("Custom: time is 01.01.2024 in this universe."), "Custom: time is 01.01.2024 in this universe.");
});

test("удалённая во время запроса карточка не появляется снова", async () => {
  const h = await setup(2);
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 1 });
  const id = h.cards()[0].id;
  const pending = deferred(); h.reply = () => pending.promise;
  const generation = h.generator.regenerateSummaryChunk(id, { sourceMode: "original" });
  h.entities.deleteEntity("summaryChunks", id);
  pending.resolve("Late result");
  await assert.rejects(generation, /Карточка изменилась или удалена/);
  assert.equal(h.cards().length, 0);
});

test("смена чата во время запроса не записывает ответ в другой чат", async () => {
  const h = await setup(2);
  const oldMetadata = h.context.chatMetadata;
  const pending = deferred(); h.reply = () => pending.promise;
  const generation = h.generator.generateSummaryChunkForRange({ start: 0, end: 1 });
  h.context = { chat: messages(2), chatMetadata: { "story-manager-summary-chunks": [] } };
  pending.resolve("Late result");
  await assert.rejects(generation, /Активный чат сменился/);
  assert.equal(h.cards().length, 0);
  assert.equal(oldMetadata["story-manager-summary-chunks"].filter(c => c.type !== "placeholder").length, 0);
});

test("источники используют текущую редакцию и имя при сохранённой идентичности сообщения", async () => {
  const h = await setup(2);
  await h.generator.generateSummaryChunkForRange({ start: 0, end: 1 });
  h.context.chat[0].mes = "Corrected event";
  h.context.chat[0].name = "Renamed character";
  await h.generator.regenerateSummaryChunk(h.cards()[0].id, { sourceMode: "original" });
  assert.match(h.calls[1].prompt, /Renamed character: Corrected event/);
  assert.equal(h.cards()[0].contextValid, true);
});

test("быстро созданные карточки и заглушка имеют разные ID", async () => {
  const h = await setup(1);
  h.chunks.syncSummaryStateWithChat(1);
  for (let index = 0; index < 50; index++) h.entities.createEntity("summaryChunks", {
    type: "chunk", startMes: 0, endMes: 0, text: "A local card",
  });
  const ids = h.entities.getEntities("summaryChunks").map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});
