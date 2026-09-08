import { template_files, templates_path } from "../src/core/constants.js";

const templatesCache = {};
let templatesLoaded = false;

const LEGACY_TEMPLATE_FILE = "templates";
const REQUIRED_TEMPLATE_ID = "story-manager-settings-template";
const IMAGE_PRESET_POPUP_TEMPLATE_ID = "story-manager-image-preset-popup-template";
const POPUPS_TEMPLATE_FILE = "templates/popups";

function cacheTemplates(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");

  doc.querySelectorAll("template").forEach((template) => {
    templatesCache[template.id] = template.innerHTML;
  });
}

async function loadTemplateHtmlFromRenderer(templateName) {
  const { renderExtensionTemplateAsync } = SillyTavern.getContext();
  if (typeof renderExtensionTemplateAsync !== "function") {
    return null;
  }

  return renderExtensionTemplateAsync(templates_path, templateName);
}

async function loadTemplateHtmlFromFetch(templateName) {
  const templateUrl = new URL(`../${templateName}.html`, import.meta.url);
  const response = await fetch(templateUrl);

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status} for ${templateName}`);
  }

  return response.text();
}

async function loadTemplateFile(templateName) {
  try {
    const htmlFromRenderer = await loadTemplateHtmlFromRenderer(templateName);
    if (htmlFromRenderer) {
      return htmlFromRenderer;
    }
  } catch (err) {
    console.warn(
      `Story Manager: renderExtensionTemplateAsync failed for "${templateName}"`,
      err,
    );
  }

  return loadTemplateHtmlFromFetch(templateName);
}

async function loadTemplateFiles(templateNames) {
  for (const templateName of templateNames) {
    const htmlText = await loadTemplateFile(templateName);
    cacheTemplates(htmlText);
  }
}

async function loadTemplatesFromRenderer() {
  const { renderExtensionTemplateAsync } = SillyTavern.getContext();
  if (typeof renderExtensionTemplateAsync !== "function") {
    return false;
  }

  try {
    await loadTemplateFiles(template_files);
    return templatesCache[REQUIRED_TEMPLATE_ID];
  } catch (err) {
    console.warn("Story Manager: Failed to load split templates via renderer", err);
    return false;
  }
}

async function loadTemplatesFromRelativeUrl() {
  await loadTemplateFiles(template_files);
  return Boolean(templatesCache[REQUIRED_TEMPLATE_ID]);
}

async function loadLegacyTemplatesFromRenderer() {
  const htmlText = await loadTemplateHtmlFromRenderer(LEGACY_TEMPLATE_FILE);
  if (!htmlText) {
    return false;
  }

  cacheTemplates(htmlText);
  return Boolean(templatesCache[REQUIRED_TEMPLATE_ID]);
}

async function loadLegacyTemplatesFromRelativeUrl() {
  const templateUrl = new URL(`../${LEGACY_TEMPLATE_FILE}.html`, import.meta.url);
  const response = await fetch(templateUrl);

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  cacheTemplates(await response.text());
  return Boolean(templatesCache[REQUIRED_TEMPLATE_ID]);
}

/**
 * Загружает HTML-шаблоны из templates/ и кэширует содержимое.
 */
export async function loadTemplates() {
  if (templatesLoaded) {
    return true;
  }

  try {
    const loadedFromRenderer = await loadTemplatesFromRenderer();
    if (loadedFromRenderer) {
      templatesLoaded = true;
      return true;
    }
  } catch (err) {
    console.warn(
      "Story Manager: Failed to load templates via renderExtensionTemplateAsync",
      err,
    );
  }

  try {
    const loadedFromFetch = await loadTemplatesFromRelativeUrl();
    if (loadedFromFetch) {
      templatesLoaded = true;
      return true;
    }
  } catch (err) {
    console.warn("Story Manager: Failed to load split templates via fetch", err);
  }

  try {
    const loadedLegacyRenderer = await loadLegacyTemplatesFromRenderer();
    if (loadedLegacyRenderer) {
      templatesLoaded = true;
      console.warn(
        "Story Manager: Loaded legacy templates.html via renderer (consider updating deployment)",
      );
      return true;
    }
  } catch (err) {
    console.warn("Story Manager: Legacy template load via renderer failed", err);
  }

  try {
    const loadedLegacyFetch = await loadLegacyTemplatesFromRelativeUrl();
    if (loadedLegacyFetch) {
      templatesLoaded = true;
      console.warn(
        "Story Manager: Loaded legacy templates.html via fetch (consider updating deployment)",
      );
      return true;
    }
  } catch (err) {
    console.error("Story Manager: Failed to load legacy templates", err);
  }

  console.error("Story Manager: Failed to load templates");
  return false;
}

/**
 * Получить HTML шаблона по ID
 * @param {string} id - ID шаблона (например, "story-manager-note-item")
 */
export function getTemplate(id) {
  const fullId = id.endsWith("-template") ? id : `${id}-template`;

  if (!templatesCache[fullId]) {
    console.warn(`Story Manager: Template "${fullId}" not found`);
    return "";
  }
  return templatesCache[fullId];
}

/**
 * Создать jQuery-элемент из шаблона
 * @param {string} id - ID шаблона
 */
export function createFromTemplate(id) {
  const html = getTemplate(id);
  return $(html);
}

/** Актуален ли кэш попапа пресета картинок (после обновления расширения без F5). */
export function isImagePresetPopupTemplateCurrent() {
  return (templatesCache[IMAGE_PRESET_POPUP_TEMPLATE_ID] || "").includes(
    "story_image_preset_instruction",
  );
}

/** Перечитать templates/popups.html в кэш. */
export async function reloadPopupsTemplates() {
  try {
    const htmlText = await loadTemplateFile(POPUPS_TEMPLATE_FILE);
    cacheTemplates(htmlText);
    return isImagePresetPopupTemplateCurrent();
  } catch (err) {
    console.warn("Story Manager: не удалось обновить templates/popups", err);
    return false;
  }
}
