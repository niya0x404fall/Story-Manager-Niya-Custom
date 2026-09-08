import { getLoreCardBody } from "../lore-cards.js";
import { UI } from "../ui-text.js";
import { exportToLorebook } from "./lorebook.js";
import { renderEntityList } from "./card-list.js";

export function renderLocations() {
  renderEntityList({
    namespace: "storyManagerLocations",
    containerSelector: "#story-locations-container",
    entityType: "locations",
    emptyText: UI.settings.locations.emptyList,
    templateId: "story-manager-location-item-template",
    itemSelector: ".story-manager-location-item",
    idAttribute: "data-loc-id",
    titleSelector: ".story-location-name",
    bodySelector: ".story-location-description",
    checkboxSelector: ".story-location-toggle-checkbox",
    deleteSelector: ".story-location-delete-btn",
    expandSelector: ".story-location-toggle-expand",
    exportSelector: ".story-location-lorebook-btn",
    getTitle: (location) => location.name,
    getBody: (location) => getLoreCardBody(location),
    onExport: (id) => exportToLorebook("locations", id),
  });
}
