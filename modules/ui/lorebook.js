import {
  loadWorldInfo,
  createWorldInfoEntry,
  saveWorldInfo,
} from "../../../../../world-info.js";
import { getTargetLorebook } from "../chat-settings.js";
import { getEntities, updateEntity } from "../entities.js";
import { getLoreCardBody } from "../lore-cards.js";
import { fmt, UI } from "../ui-text.js";
import {
  toastEntityError,
  toastEntitySuccess,
  toastEntityWarning,
} from "./toasts.js";

export async function exportToLorebook(type, id) {
  const lorebookName = getTargetLorebook();
  if (!lorebookName) {
    toastEntityWarning(UI.lorebook.selectLorebookFirst);
    return false;
  }

  const entity = getEntities(type).find((e) => e.id === id);
  if (!entity) return false;

  try {
    const lorebookData = await loadWorldInfo(lorebookName);
    if (!lorebookData) throw new Error(UI.lorebook.loadFailed);

    const entry = createWorldInfoEntry(lorebookName, lorebookData);
    entry.comment = entity.name;
    entry.content = getLoreCardBody(entity);

    const keysArray = entity.keywords
      ? entity.keywords
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k !== "")
      : [entity.name];

    entry.key = keysArray;
    entry.selective = true;
    entry.addMemo = true;
    entry.position = 0;
    entry.order = 100;

    await saveWorldInfo(lorebookName, lorebookData, true);
    updateEntity(type, id, { enabled: false });

    toastEntitySuccess(fmt.lorebookExportSuccess(entity.name));
    return true;
  } catch (err) {
    console.error("Story Manager: Export failed", err);
    toastEntityError(UI.lorebook.exportFailed, err);
    return false;
  }
}
