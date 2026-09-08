import test from "node:test";
import assert from "node:assert/strict";

import {
  captureSummarySourceMessageStates,
  createSummaryMessageSnapshot,
  diffSummaryMessageSnapshots,
  findSummaryRangeOverlaps,
  getChunkCoverageRanges,
  getSummaryPlaceholderEndAfterResize,
  isSummaryChunkContextUsable,
  isSummarySourceStateCurrent,
  reindexSummaryBoundaryAfterDeletions,
  reindexSummaryChunkAfterDeletions,
  summaryChunkCoversMessage,
} from "../modules/summary-integrity.js";

test("заглушка старой истории не поглощает новые сообщения", () => {
  assert.equal(getSummaryPlaceholderEndAfterResize(49, 51), 49);
  assert.equal(getSummaryPlaceholderEndAfterResize(49, 40), 39);
});

test("недействительная карточка не пригодна для контекста", () => {
  assert.equal(isSummaryChunkContextUsable({ text: "ok", contextValid: true }), true);
  assert.equal(isSummaryChunkContextUsable({ text: "stale", contextValid: false }), false);
  assert.equal(isSummaryChunkContextUsable({ text: "missing", sourceUnavailable: true }), false);
  assert.equal(isSummaryChunkContextUsable({ text: "", contextValid: true }), false);
});

test("сжатая карточка покрывает только sourceRanges", () => {
  const chunk = {
    type: "compressed",
    startMes: 0,
    endMes: 29,
    sourceRanges: [
      { start: 0, end: 9 },
      { start: 20, end: 29 },
    ],
  };

  assert.deepEqual(getChunkCoverageRanges(chunk), chunk.sourceRanges);
  assert.equal(summaryChunkCoversMessage(chunk, 5), true);
  assert.equal(summaryChunkCoversMessage(chunk, 15), false);
});

test("предупреждение о пересечении игнорирует протухшие карточки", () => {
  const chunks = [
    { id: 1, startMes: 0, endMes: 9, contextValid: true },
    { id: 2, startMes: 10, endMes: 19, contextValid: false },
    { id: 3, type: "placeholder", startMes: 20, endMes: 29 },
  ];

  assert.deepEqual(findSummaryRangeOverlaps(chunks, 5, 12).map((item) => item.id), [1]);
});

test("снимок сообщает hide отдельно и инвалидирует только редактирование", () => {
  const first = { name: "A", mes: "one", is_user: false, is_system: false };
  const second = { name: "B", mes: "two", is_user: true, is_system: false };
  const before = createSummaryMessageSnapshot([first, second]);

  first.is_system = true;
  second.mes = "edited";
  const diff = diffSummaryMessageSnapshots(
    before,
    createSummaryMessageSnapshot([first, second]),
  );

  assert.deepEqual(diff.visibilityChangedMessageIds, [0]);
  assert.deepEqual(diff.contentChangedMessageIds, [1]);
  assert.deepEqual(diff.changedMessageIds, [1]);
});

test("сохранённый отпечаток игнорирует hide/unhide и замечает правку текста", () => {
  const chat = [
    { name: "A", mes: "one", is_user: false, is_system: false },
    { name: "B", mes: "two", is_user: true, is_system: true },
  ];
  const chunk = {
    sourceMessageStates: captureSummarySourceMessageStates(chat, [
      { start: 0, end: 1 },
    ]),
  };

  assert.equal("hidden" in chunk.sourceMessageStates[0], false);
  assert.equal(isSummarySourceStateCurrent(chunk, chat), true);
  chat[1].is_system = false;
  assert.equal(isSummarySourceStateCurrent(chunk, chat), true);
  chat[1].is_system = true;
  chat[0].mes = "edited";
  assert.equal(isSummarySourceStateCurrent(chunk, chat), false);
});

test("старое поле hidden в отпечатке 0.4.2 больше не влияет на карточку", () => {
  const chat = [{ name: "A", mes: "one", is_user: false, is_system: true }];
  const chunk = {
    sourceMessageStates: [
      {
        messageId: 0,
        hidden: false,
        fingerprint: captureSummarySourceMessageStates(chat, [
          { start: 0, end: 0 },
        ])[0].fingerprint,
      },
    ],
  };

  assert.equal(isSummarySourceStateCurrent(chunk, chat), true);
});

test("снимок находит настоящий mesid удалённого сообщения", () => {
  const chat = [0, 1, 2, 3].map((id) => ({
    name: `N${id}`,
    mes: `M${id}`,
    send_date: id + 100,
  }));
  const before = createSummaryMessageSnapshot(chat);
  chat.splice(1, 1);
  const diff = diffSummaryMessageSnapshots(before, createSummaryMessageSnapshot(chat));

  assert.deepEqual(diff.deletedMessageIds, [1]);
  assert.deepEqual(diff.changedMessageIds, []);
});

test("удаление сдвигает последующие диапазоны и инвалидирует затронутый", () => {
  const before = { type: "chunk", startMes: 10, endMes: 19, contextValid: true };
  const shifted = reindexSummaryChunkAfterDeletions(before, [4]);
  assert.deepEqual(
    { start: shifted.chunk.startMes, end: shifted.chunk.endMes, valid: shifted.chunk.contextValid },
    { start: 9, end: 18, valid: true },
  );

  const touched = reindexSummaryChunkAfterDeletions(before, [12]);
  assert.deepEqual(
    { start: touched.chunk.startMes, end: touched.chunk.endMes, valid: touched.chunk.contextValid },
    { start: 10, end: 18, valid: false },
  );
});

test("несколько соседних удалений правильно сдвигают якорь", () => {
  assert.equal(reindexSummaryBoundaryAfterDeletions(5, [3, 4]), 3);
  assert.equal(reindexSummaryBoundaryAfterDeletions(5, [4, 5]), 4);
});

test("удаление корректно меняет несмежные sourceRanges", () => {
  const before = {
    type: "compressed",
    startMes: 0,
    endMes: 29,
    contextValid: true,
    sourceRanges: [
      { start: 0, end: 9 },
      { start: 20, end: 29 },
    ],
  };
  const result = reindexSummaryChunkAfterDeletions(before, [5, 15]);

  assert.deepEqual(result.chunk.sourceRanges, [
    { start: 0, end: 8 },
    { start: 18, end: 27 },
  ]);
  assert.equal(result.chunk.contextValid, false);
});

test("удаление перенумеровывает сохранённые отпечатки", () => {
  const chat = [0, 1, 2].map((id) => ({ name: "N", mes: String(id) }));
  const chunk = {
    type: "chunk",
    startMes: 1,
    endMes: 2,
    contextValid: true,
    sourceMessageStates: captureSummarySourceMessageStates(chat, [
      { start: 1, end: 2 },
    ]),
  };
  const result = reindexSummaryChunkAfterDeletions(chunk, [0]);

  assert.deepEqual(
    result.chunk.sourceMessageStates.map((state) => state.messageId),
    [0, 1],
  );
  assert.equal(result.chunk.contextValid, true);
});
