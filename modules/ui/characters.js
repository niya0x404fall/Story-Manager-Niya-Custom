import { getLoreCardBody } from "../lore-cards.js";
import { UI } from "../ui-text.js";
import { exportToLorebook } from "./lorebook.js";
import { renderEntityList } from "./card-list.js";

export function renderCharacters() {
  renderEntityList({
    namespace: "storyManagerCharacters",
    containerSelector: "#story-characters-container",
    entityType: "characters",
    emptyText: UI.settings.characters.emptyList,
    templateId: "story-manager-character-item-template",
    itemSelector: ".story-character-item",
    idAttribute: "data-char-id",
    titleSelector: ".story-character-name",
    bodySelector: ".story-character-description",
    checkboxSelector: ".story-character-toggle-checkbox",
    deleteSelector: ".story-character-delete-btn",
    expandSelector: ".story-character-toggle-expand",
    exportSelector: ".story-character-lorebook-btn",
    getTitle: (character) => character.name,
    getBody: (character) => getLoreCardBody(character),
    onExport: (id) => exportToLorebook("characters", id),
  });
}
