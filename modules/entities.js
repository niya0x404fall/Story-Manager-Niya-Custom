import { getContext } from "../../../../extensions.js";
import { normalizeLoreCardEntity } from "./lore-cards.js";
import { saveChatMetadata } from "./storage.js";

const LORE_CARD_ENTITY_TYPES = new Set(["characters", "locations"]);

const ENTITY_KEYS = {
  notes: "story-manager-notes",
  characters: "story-manager-characters",
  locations: "story-manager-locations",
  summary: "story-manager-summary",
  summaryChunks: "story-manager-summary-chunks",
};

export function setEntities(type, data) {
  saveEntities(type, data);
}

export function getEntities(type) {
  const context = getContext();
  if (!context.chatMetadata) return type === "summary" ? null : [];

  const key = ENTITY_KEYS[type];
  if (!key) {
    console.warn(`Story Manager: Unknown entity type "${type}"`);
    return type === "summary" ? null : [];
  }

  const data = context.chatMetadata[key];

  if (type === "summary") {
    return data || null;
  }

  const list = data || [];

  if (!LORE_CARD_ENTITY_TYPES.has(type)) {
    return list;
  }

  let dirty = false;
  const normalized = list.map((entity) => {
    const next = normalizeLoreCardEntity(entity, type);
    if (next !== entity) {
      dirty = true;
    }
    return next;
  });

  if (dirty) {
    saveEntities(type, normalized);
  }

  return normalized;
}

function saveEntities(type, data) {
  const context = getContext();
  if (!context.chatMetadata) return;

  const key = ENTITY_KEYS[type];
  if (!key) {
    console.warn(`Story Manager: Unknown entity type "${type}"`);
    return;
  }

  context.chatMetadata[key] = data;
  saveChatMetadata();
}

export function getNextEntityId(type) {
  const used = new Set(getEntities(type).map((entity) => entity.id));
  let id = Date.now();
  while (used.has(id)) id++;
  return id;
}

export function createEntity(type, data) {
  const entities = getEntities(type);

  if (type === "summary") {
    const newSummary = {
      ...data,
      updatedAt: Date.now(),
    };
    saveEntities(type, newSummary);
    return newSummary;
  }

  const newEntity = {
    id: getNextEntityId(type),
    enabled: true,
    createdAt: Date.now(),
    ...data,
  };

  entities.push(newEntity);
  saveEntities(type, entities);
  return newEntity;
}

export function updateEntity(type, id, updates) {
  if (type === "summary") {
    const current = getEntities(type) || {};
    const updated = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
    };
    saveEntities(type, updated);
    return true;
  }

  const entities = getEntities(type);
  const entity = entities.find((e) => e.id === id);

  if (entity) {
    Object.assign(entity, updates);
    entity.updatedAt = Date.now();
    saveEntities(type, entities);
    return true;
  }

  return false;
}

export function deleteEntity(type, id) {
  if (type === "summary") {
    saveEntities(type, null);
    return true;
  }

  const entities = getEntities(type);
  const index = entities.findIndex((e) => e.id === id);

  if (index !== -1) {
    entities.splice(index, 1);
    saveEntities(type, entities);
    return true;
  }

  return false;
}

export function toggleEntity(type, id) {
  if (type === "summary") {
    const summary = getEntities(type);
    if (summary) {
      summary.enabled = !summary.enabled;
      saveEntities(type, summary);
      return summary.enabled;
    }
    return false;
  }

  const entities = getEntities(type);
  const entity = entities.find((e) => e.id === id);

  if (entity) {
    entity.enabled = !entity.enabled;
    saveEntities(type, entities);
    return entity.enabled;
  }

  return false;
}
