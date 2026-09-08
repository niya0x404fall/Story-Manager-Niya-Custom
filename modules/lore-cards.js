import { cleanKeywords } from "./utils.js";

export const LORE_CARD_TYPES = Object.freeze({
  CHARACTER: "character",
  LOCATION: "location",
});

/** @type {readonly string[]} */
export const CHARACTER_SECTION_KEYS = Object.freeze([
  "appearance",
  "occupation",
  "character",
  "relationships",
]);

/** @type {readonly string[]} */
export const LOCATION_SECTION_KEYS = Object.freeze([
  "atmosphere",
  "features",
  "sensory",
]);

const CHARACTER_SECTION_LABELS = Object.freeze({
  appearance: "Appearance",
  occupation: "Occupation",
  character: "Character",
  relationships: "Relationships",
});

const LOCATION_SECTION_LABELS = Object.freeze({
  atmosphere: "Atmosphere",
  features: "Features",
  sensory: "Sensory",
});

const LEGACY_LABEL_TO_KEY = Object.freeze({
  appearance: "appearance",
  occupation: "occupation",
  character: "character",
  relationships: "relationships",
  atmosphere: "atmosphere",
  features: "features",
  sensory: "sensory",
});

const LEGACY_FLAT_CHARACTER = Object.freeze({
  NAME: "name",
  KEYWORDS: "keywords",
  APPEARANCE: "appearance",
  OCCUPATION: "occupation",
  CHARACTER: "character",
  RELATIONSHIPS: "relationships",
});

const LEGACY_FLAT_LOCATION = Object.freeze({
  NAME: "name",
  KEYWORDS: "keywords",
  ATMOSPHERE: "atmosphere",
  FEATURES: "features",
  SENSORY: "sensory",
});

/**
 * @param {'characters'|'locations'} entityType
 * @returns {'character'|'location'}
 */
export function getLoreCardKind(entityType) {
  return entityType === "locations"
    ? LORE_CARD_TYPES.LOCATION
    : LORE_CARD_TYPES.CHARACTER;
}

/**
 * @param {'character'|'location'} cardKind
 * @returns {readonly string[]}
 */
export function getSectionKeysForKind(cardKind) {
  return cardKind === LORE_CARD_TYPES.LOCATION
    ? LOCATION_SECTION_KEYS
    : CHARACTER_SECTION_KEYS;
}

/**
 * @param {'character'|'location'} cardKind
 * @param {string} key
 */
function getDefaultLabel(cardKind, key) {
  const labels =
    cardKind === LORE_CARD_TYPES.LOCATION
      ? LOCATION_SECTION_LABELS
      : CHARACTER_SECTION_LABELS;
  return labels[key] || key;
}

/**
 * @param {Array<{ key: string, label: string, content: string }>} sections
 */
export function serializeCardBody(sections) {
  if (!Array.isArray(sections)) {
    return "";
  }

  return sections
    .filter((section) => String(section?.content ?? "").trim())
    .map(
      (section) =>
        `**${section.label || section.key}:** ${String(section.content).trim()}`,
    )
    .join("\n");
}

/**
 * @param {object} entity
 */
export function getLoreCardBody(entity) {
  if (Array.isArray(entity?.sections) && entity.sections.length > 0) {
    return serializeCardBody(entity.sections);
  }

  return String(entity?.description ?? "").trim();
}

/**
 * @param {string} text
 * @returns {object|null}
 */
function tryParseJson(text) {
  const candidate = String(text ?? "").trim();
  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @returns {string|null}
 */
function extractJsonSubstring(text) {
  const fenced = String(text ?? "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * @param {string} rawText
 * @returns {object|null}
 */
export function parseJsonFromModelText(rawText) {
  const direct = tryParseJson(rawText);
  if (direct) {
    return direct;
  }

  const substring = extractJsonSubstring(rawText);
  if (!substring) {
    return null;
  }

  return tryParseJson(substring);
}

/**
 * @param {string} label
 */
function labelToSectionKey(label) {
  const normalized = String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return LEGACY_LABEL_TO_KEY[normalized] || normalized.replace(/\s+/g, "_");
}

/**
 * @param {string} description
 * @param {'character'|'location'} cardKind
 * @returns {Array<{ key: string, label: string, content: string }>}
 */
export function parseSectionsFromDescription(description, cardKind) {
  const text = String(description ?? "").trim();
  if (!text) {
    return [];
  }

  const headerRegex = /^\*\*(.+?):\*\*\s*(.*)$/;
  const lines = text.split("\n");
  /** @type {Array<{ key: string, label: string, content: string }>} */
  const sections = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(headerRegex);
    if (match) {
      if (current) {
        sections.push(current);
      }
      const label = match[1].trim();
      current = {
        key: labelToSectionKey(label),
        label,
        content: match[2].trim(),
      };
      continue;
    }

    if (current) {
      current.content = current.content
        ? `${current.content}\n${line}`
        : line.trim();
    }
  }

  if (current) {
    sections.push({
      ...current,
      content: current.content.trim(),
    });
  }

  if (sections.length > 0) {
    return sections;
  }

  const keys = getSectionKeysForKind(cardKind);
  return [
    {
      key: keys[0],
      label: getDefaultLabel(cardKind, keys[0]),
      content: text,
    },
  ];
}

/**
 * @param {Record<string, string>} sectionsObj
 * @param {'character'|'location'} cardKind
 */
function sectionsObjectToArray(sectionsObj, cardKind) {
  const keys = getSectionKeysForKind(cardKind);
  /** @type {Array<{ key: string, label: string, content: string }>} */
  const sections = [];

  for (const key of keys) {
    const content = String(sectionsObj?.[key] ?? "").trim();
    if (!content) {
      continue;
    }
    sections.push({
      key,
      label: getDefaultLabel(cardKind, key),
      content,
    });
  }

  for (const [rawKey, rawValue] of Object.entries(sectionsObj || {})) {
    if (keys.includes(rawKey)) {
      continue;
    }
    const content = String(rawValue ?? "").trim();
    if (!content) {
      continue;
    }
    sections.push({
      key: rawKey,
      label: getDefaultLabel(cardKind, rawKey),
      content,
    });
  }

  return sections;
}

/**
 * @param {object} raw
 * @param {'character'|'location'} cardKind
 */
function normalizeLegacyFlatPayload(raw, cardKind) {
  const legacyMap =
    cardKind === LORE_CARD_TYPES.LOCATION
      ? LEGACY_FLAT_LOCATION
      : LEGACY_FLAT_CHARACTER;

  const name = String(raw.NAME ?? raw.name ?? "").trim();
  const keywords = String(raw.KEYWORDS ?? raw.keywords ?? "").trim();
  /** @type {Record<string, string>} */
  const sectionsObj = {};

  for (const [legacyKey, sectionKey] of Object.entries(legacyMap)) {
    if (legacyKey === "NAME" || legacyKey === "KEYWORDS") {
      continue;
    }
    const value = raw[legacyKey];
    if (value != null && String(value).trim()) {
      sectionsObj[sectionKey] = String(value).trim();
    }
  }

  if (cardKind === LORE_CARD_TYPES.LOCATION && raw.DESCRIPTION?.trim()) {
    sectionsObj.features =
      sectionsObj.features || String(raw.DESCRIPTION).trim();
  }

  return { name, keywords, sections: sectionsObjectToArray(sectionsObj, cardKind) };
}

/**
 * @param {object|null} raw
 * @param {'character'|'location'} cardKind
 */
export function normalizeCardPayload(raw, cardKind) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  if (raw.NAME != null || raw.APPEARANCE != null || raw.ATMOSPHERE != null) {
    return normalizeLegacyFlatPayload(raw, cardKind);
  }

  const name = String(raw.name ?? "").trim();
  const keywords = String(raw.keywords ?? "").trim();
  let sections = [];

  if (raw.sections && typeof raw.sections === "object" && !Array.isArray(raw.sections)) {
    sections = sectionsObjectToArray(raw.sections, cardKind);
  } else if (Array.isArray(raw.sections)) {
    sections = raw.sections
      .map((section) => ({
        key: String(section?.key ?? "").trim(),
        label: String(section?.label ?? section?.key ?? "").trim(),
        content: String(section?.content ?? "").trim(),
      }))
      .filter((section) => section.key && section.content);
  }

  if (!name && !keywords && sections.length === 0) {
    return null;
  }

  return {
    name: name || (cardKind === LORE_CARD_TYPES.CHARACTER ? "Unknown Character" : "Unknown Location"),
    keywords,
    sections,
  };
}

/**
 * @param {string} rawText
 * @param {'character'|'location'} cardKind
 */
export function parseCardModelResponse(rawText, cardKind) {
  const json = parseJsonFromModelText(rawText);
  const normalized = normalizeCardPayload(json, cardKind);

  if (normalized) {
    return normalized;
  }

  console.warn(
    `Story Manager: не удалось разобрать JSON карточки (${cardKind}), используется черновик.`,
  );

  const keys = getSectionKeysForKind(cardKind);
  const fallbackName =
    cardKind === LORE_CARD_TYPES.CHARACTER ? "Unknown Character" : "Unknown Location";

  return {
    name: fallbackName,
    keywords: "",
    sections: [
      {
        key: keys[0],
        label: getDefaultLabel(cardKind, keys[0]),
        content: String(rawText ?? "").trim(),
      },
    ],
  };
}

/**
 * @param {{ name: string, keywords: string, sections: Array }} parsed
 * @param {'character'|'location'} cardKind
 */
export function buildLoreCardEntityData(parsed, cardKind) {
  const name = String(parsed?.name ?? "").trim();
  const keywords = cleanKeywords(parsed?.keywords);
  const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
  const description = serializeCardBody(sections);

  return {
    name:
      name ||
      (cardKind === LORE_CARD_TYPES.CHARACTER
        ? "Unknown Character"
        : "Unknown Location"),
    keywords,
    sections,
    description,
  };
}

/**
 * @param {object} entity
 * @param {'characters'|'locations'} entityType
 */
export function normalizeLoreCardEntity(entity, entityType) {
  if (!entity || typeof entity !== "object") {
    return entity;
  }

  const cardKind = getLoreCardKind(entityType);

  if (Array.isArray(entity.sections) && entity.sections.length > 0) {
    const description = serializeCardBody(entity.sections);
    if (entity.description !== description) {
      return { ...entity, description };
    }
    return entity;
  }

  if (entity.description?.trim()) {
    const sections = parseSectionsFromDescription(entity.description, cardKind);
    return {
      ...entity,
      sections,
      description: serializeCardBody(sections),
    };
  }

  return entity;
}

/**
 * @param {Array} entities
 * @param {'characters'|'locations'} entityType
 */
export function normalizeLoreCardEntities(entities, entityType) {
  if (!Array.isArray(entities)) {
    return [];
  }

  return entities.map((entity) => normalizeLoreCardEntity(entity, entityType));
}

/**
 * @param {string} rawText
 */
export function parseCharacterCardResponse(rawText) {
  return parseCardModelResponse(rawText, LORE_CARD_TYPES.CHARACTER);
}

/**
 * @param {string} rawText
 */
export function parseLocationCardResponse(rawText) {
  return parseCardModelResponse(rawText, LORE_CARD_TYPES.LOCATION);
}

/**
 * @param {{ name: string, keywords: string, sections: Array }} parsed
 */
export function buildCharacterEntityData(parsed) {
  return buildLoreCardEntityData(parsed, LORE_CARD_TYPES.CHARACTER);
}

/**
 * @param {{ name: string, keywords: string, sections: Array }} parsed
 */
export function buildLocationEntityData(parsed) {
  return buildLoreCardEntityData(parsed, LORE_CARD_TYPES.LOCATION);
}
