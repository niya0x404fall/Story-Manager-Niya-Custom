import test from "node:test";
import assert from "node:assert/strict";

import {
  applyImportedChatData,
  buildStoryManagerBackup,
  parseStoryManagerBackup,
} from "../modules/data-transfer-format.js";

test("backup не переносит chat-specific targetLorebook", () => {
  const backup = buildStoryManagerBackup({
    chatMetadata: {
      "story-manager-chat-settings": {
        targetLorebook: "Локальный лорбук",
        anotherSetting: true,
      },
      "story-manager-notes": [],
    },
    settings: {
      targetLorebook: "Старый глобальный лорбук",
      connectionProfileId: "local-profile",
      summaryEnabled: true,
    },
  });

  assert.deepEqual(backup.chatData["story-manager-chat-settings"], {
    anotherSetting: true,
  });
  assert.equal("targetLorebook" in backup.settings, false);
  assert.equal("connectionProfileId" in backup.settings, false);
  assert.equal(backup.settings.summaryEnabled, true);
});

test("отключение интерфейса картинок не удаляет их данные из backup", () => {
  const imageState = { pockets: { 12: { html: "<imagen>saved</imagen>" } } };
  const imageGlobals = { imagesEnabled: true, sendChar: false };
  const imagePresets = [{ id: "old-preset", name: "Старый пресет" }];
  const backup = buildStoryManagerBackup({
    chatMetadata: { "story-manager-image-state": imageState },
    settings: { imageGlobals, imagePresets },
  });

  assert.deepEqual(backup.chatData["story-manager-image-state"], imageState);
  assert.deepEqual(backup.settings.imageGlobals, imageGlobals);
  assert.deepEqual(backup.settings.imagePresets, imagePresets);
});

test("импорт старого backup также отбрасывает targetLorebook", () => {
  const parsed = parseStoryManagerBackup({
    format: "story-manager-backup",
    version: 1,
    chatData: {
      "story-manager-chat-settings": {
        targetLorebook: "Чужой лорбук",
        anotherSetting: "safe",
      },
    },
    settings: {},
  });

  assert.deepEqual(parsed.chatData["story-manager-chat-settings"], {
    anotherSetting: "safe",
  });
});

test("replace сохраняет локальный лорбук текущего чата", () => {
  const current = {
    "story-manager-chat-settings": { targetLorebook: "Мой лорбук" },
    "story-manager-notes": [{ id: 1, title: "old" }],
  };

  applyImportedChatData(
    current,
    {
      "story-manager-chat-settings": { targetLorebook: "Чужой лорбук" },
      "story-manager-notes": [{ id: 2, title: "new" }],
    },
    "replace",
  );

  assert.equal(
    current["story-manager-chat-settings"].targetLorebook,
    "Мой лорбук",
  );
  assert.equal(current["story-manager-notes"][0].title, "new");
});
