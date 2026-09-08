export const STORY_MANAGER_BACKUP_FORMAT = "story-manager-backup";
export const STORY_MANAGER_BACKUP_VERSION = 1;
export const STORY_MANAGER_METADATA_PREFIX = "story-manager-";

const ARRAY_METADATA_KEYS = new Set([
  "story-manager-notes",
  "story-manager-characters",
  "story-manager-locations",
  "story-manager-summary-chunks",
]);

const OBJECT_METADATA_KEYS = new Set([
  "story-manager-summary",
  "story-manager-summary-state",
  "story-manager-chat-settings",
  "story-manager-image-state",
]);

const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sanitizeObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!BLOCKED_OBJECT_KEYS.has(key)) {
      result[key] = sanitizeObject(item);
    }
  }
  return result;
}

function sanitizePortableChatMetadataEntry(key, value) {
  const portable = sanitizeObject(cloneJson(value));

  if (
    key === "story-manager-chat-settings" &&
    isPlainObject(portable)
  ) {
    // Имя лорбука локально для установки ST и не должно приезжать на другое устройство.
    delete portable.targetLorebook;
  }

  return portable;
}

export function collectStoryManagerMetadata(chatMetadata = {}) {
  const result = {};
  if (!isPlainObject(chatMetadata)) {
    return result;
  }

  for (const [key, value] of Object.entries(chatMetadata)) {
    if (key.startsWith(STORY_MANAGER_METADATA_PREFIX)) {
      result[key] = sanitizePortableChatMetadataEntry(key, value);
    }
  }
  return result;
}

export function sanitizePortableSettings(settings = {}) {
  if (!isPlainObject(settings)) {
    return {};
  }

  const portable = sanitizeObject(cloneJson(settings));
  // ID профиля и старый global-лорбук локальны для конкретной установки ST.
  delete portable.connectionProfileId;
  delete portable.profileId;
  delete portable.targetLorebook;
  return portable;
}

export function buildStoryManagerBackup({
  chatMetadata,
  settings,
  extensionVersion = "unknown",
  exportedAt = new Date().toISOString(),
} = {}) {
  return {
    format: STORY_MANAGER_BACKUP_FORMAT,
    version: STORY_MANAGER_BACKUP_VERSION,
    exportedAt,
    sourceExtensionVersion: extensionVersion,
    chatData: collectStoryManagerMetadata(chatMetadata),
    settings: sanitizePortableSettings(settings),
  };
}

function normalizeChatData(raw) {
  if (!isPlainObject(raw)) {
    throw new Error("В файле нет данных Story Manager.");
  }

  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith(STORY_MANAGER_METADATA_PREFIX)) {
      continue;
    }
    if (ARRAY_METADATA_KEYS.has(key) && !Array.isArray(value)) {
      throw new Error(`Поле ${key} должно быть списком.`);
    }
    if (OBJECT_METADATA_KEYS.has(key) && value !== null && !isPlainObject(value)) {
      throw new Error(`Поле ${key} имеет неверный формат.`);
    }
    result[key] = sanitizePortableChatMetadataEntry(key, value);
  }

  if (!Object.keys(result).length) {
    throw new Error("В файле не найдено записей Story Manager.");
  }
  return result;
}

/** Поддерживает новый backup-envelope и сырой объект chatMetadata для ручных резервных копий. */
export function parseStoryManagerBackup(raw) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isPlainObject(parsed)) {
    throw new Error("Файл должен содержать JSON-объект.");
  }

  if (parsed.format === STORY_MANAGER_BACKUP_FORMAT) {
    const version = Number(parsed.version);
    if (!Number.isInteger(version) || version < 1 || version > STORY_MANAGER_BACKUP_VERSION) {
      throw new Error(`Версия резервной копии ${parsed.version} пока не поддерживается.`);
    }
    return {
      format: parsed.format,
      version,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
      sourceExtensionVersion:
        typeof parsed.sourceExtensionVersion === "string"
          ? parsed.sourceExtensionVersion
          : "unknown",
      chatData: normalizeChatData(parsed.chatData),
      settings: isPlainObject(parsed.settings)
        ? sanitizePortableSettings(parsed.settings)
        : {},
    };
  }

  return {
    format: "story-manager-raw-metadata",
    version: 0,
    exportedAt: "",
    sourceExtensionVersion: "unknown",
    chatData: normalizeChatData(parsed.chatData || parsed),
    settings: isPlainObject(parsed.settings)
      ? sanitizePortableSettings(parsed.settings)
      : {},
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([key]) => !["id", "createdAt", "updatedAt"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function createUniqueId(usedIds) {
  let candidate = Date.now();
  while (usedIds.has(String(candidate))) {
    candidate += 1;
  }
  return candidate;
}

function mergeEntityLists(currentValue, importedValue) {
  const current = Array.isArray(currentValue) ? cloneJson(currentValue) : [];
  const imported = Array.isArray(importedValue) ? importedValue : [];
  const signatures = new Set(current.map((item) => stableStringify(item)));
  const usedIds = new Set(
    current
      .filter((item) => isPlainObject(item) && item.id !== undefined)
      .map((item) => String(item.id)),
  );

  for (const sourceItem of imported) {
    const signature = stableStringify(sourceItem);
    if (signatures.has(signature)) {
      continue;
    }

    const item = cloneJson(sourceItem);
    if (isPlainObject(item) && item.id !== undefined && usedIds.has(String(item.id))) {
      item.id = createUniqueId(usedIds);
    }
    if (isPlainObject(item) && item.id !== undefined) {
      usedIds.add(String(item.id));
    }
    current.push(item);
    signatures.add(signature);
  }
  return current;
}

function mergeObject(currentValue, importedValue) {
  if (!isPlainObject(currentValue)) {
    return cloneJson(importedValue);
  }
  if (!isPlainObject(importedValue)) {
    return cloneJson(currentValue);
  }
  return { ...cloneJson(importedValue), ...cloneJson(currentValue) };
}

export function applyImportedChatData(currentMetadata, importedChatData, mode = "merge") {
  if (!isPlainObject(currentMetadata)) {
    throw new Error("Не открыт чат, в который можно импортировать данные.");
  }
  const imported = normalizeChatData(importedChatData);

  if (mode === "replace") {
    const currentTargetLorebook = String(
      currentMetadata["story-manager-chat-settings"]?.targetLorebook || "",
    );
    for (const key of Object.keys(currentMetadata)) {
      if (key.startsWith(STORY_MANAGER_METADATA_PREFIX)) {
        delete currentMetadata[key];
      }
    }
    Object.assign(currentMetadata, cloneJson(imported));
    if (currentTargetLorebook) {
      currentMetadata["story-manager-chat-settings"] = {
        ...(currentMetadata["story-manager-chat-settings"] || {}),
        targetLorebook: currentTargetLorebook,
      };
    }
    return currentMetadata;
  }
  if (mode !== "merge") {
    throw new Error(`Неизвестный режим импорта: ${mode}`);
  }

  const currentChunks = currentMetadata["story-manager-summary-chunks"];
  const currentHasRealSummary =
    (Array.isArray(currentChunks) &&
      currentChunks.some((chunk) => chunk?.type !== "placeholder" && String(chunk?.text || "").trim())) ||
    Boolean(String(currentMetadata["story-manager-summary"]?.text || "").trim());
  const importedChunks = imported["story-manager-summary-chunks"];
  const importedHasRealSummary =
    (Array.isArray(importedChunks) &&
      importedChunks.some((chunk) => chunk?.type !== "placeholder" && String(chunk?.text || "").trim())) ||
    Boolean(String(imported["story-manager-summary"]?.text || "").trim());

  for (const [key, value] of Object.entries(imported)) {
    if (ARRAY_METADATA_KEYS.has(key)) {
      if (
        key === "story-manager-summary-chunks" &&
        importedHasRealSummary &&
        !currentHasRealSummary
      ) {
        // Новый кастом сам создаёт пустую placeholder-карточку. Она не должна
        // мешать переносу настоящих карточек из оригинального расширения.
        currentMetadata[key] = cloneJson(value);
      } else {
        currentMetadata[key] = mergeEntityLists(currentMetadata[key], value);
      }
    } else if (
      key === "story-manager-summary-state" &&
      importedHasRealSummary &&
      !currentHasRealSummary
    ) {
      currentMetadata[key] = cloneJson(value);
    } else if (currentMetadata[key] === undefined || currentMetadata[key] === null) {
      currentMetadata[key] = cloneJson(value);
    } else if (key === "story-manager-chat-settings") {
      currentMetadata[key] = mergeObject(currentMetadata[key], value);
    }
    // Состояние/откат и старое одиночное саммари не перезаписываем при merge:
    // они относятся к уже открытому чату. В пустом чате они импортируются выше.
  }

  return currentMetadata;
}

export function getBackupStats(backup) {
  const chatData = backup?.chatData || {};
  const length = (key) => (Array.isArray(chatData[key]) ? chatData[key].length : 0);
  return {
    notes: length("story-manager-notes"),
    characters: length("story-manager-characters"),
    locations: length("story-manager-locations"),
    summaryChunks: length("story-manager-summary-chunks"),
    hasLegacySummary: Boolean(chatData["story-manager-summary"]),
    hasSettings: Boolean(backup?.settings && Object.keys(backup.settings).length),
  };
}
