import { getContext } from "../../../../extensions.js";
import { normalizeImagenWrapper } from "./image-tag-normalize.js";
import { saveChat } from "./storage.js";

/** Валидация блока делается один раз при setMessageImageHtml. */

/** @deprecated — только миграция старых чатов */
const LEGACY_POCKET_KEY = "storyManagerImage";
const META_KEY = "storyManagerImageMeta";
const RAW_EXTBLOCKS_KEY = "storyManagerImageExtblocksRaw";
const ERROR_KEY = "storyManagerImageExtblocksError";

const IMAGE_GENERATION_ERROR_BOX_HTML = `
  <div class="story-manager-image-error">
    <div class="story-manager-image-error-icon">&#9888;</div>
    <div class="story-manager-image-error-title">Ошибка</div>
    <div class="story-manager-image-error-text">
      Модель не вернула HTML-блок &lt;imagen&gt;...&lt;/imagen&gt;.
    </div>
  </div>
`.trim();

export function isImageBlockHtml(html) {
  const text = (html || "").trim();
  if (!text) {
    return false;
  }

  return (
    /<imagen[\s\S]*?<\/imagen>/i.test(text) ||
    /\[IMG:GEN\]/i.test(text)
  );
}

export function getMesFingerprint(message) {
  return (message?.mes || "").trim();
}

function ensureMeta(message) {
  if (!message.extra[META_KEY]) {
    message.extra[META_KEY] = {};
  }
  return message.extra[META_KEY];
}

function extractFirstImagenBlock(rawHtml) {
  const raw = (rawHtml || "").trim();
  if (!raw) {
    return "";
  }

  const match = raw.match(/<imagen\b[\s\S]*?<\/imagen>/i);
  return (match ? match[0] : "").trim();
}

function extractAllImagenBlocks(rawHtml) {
  const raw = (rawHtml || "").trim();
  if (!raw) {
    return [];
  }

  const blocks = [];
  const re = /<imagen\b[\s\S]*?<\/imagen>/gi;
  let match = null;
  // eslint-disable-next-line no-cond-assign
  while ((match = re.exec(raw))) {
    blocks.push(String(match[0]).trim());
  }
  return blocks;
}

function getImageBlockInstruction(html) {
  const text = (html || "").trim();
  if (!text) {
    return "";
  }

  const doubleQuoted = text.match(/data-iig-instruction\s*=\s*"([^"]*)"/i);
  if (doubleQuoted) {
    return String(doubleQuoted[1]).trim();
  }

  const singleQuoted = text.match(/data-iig-instruction\s*=\s*'([^']*)'/i);
  return singleQuoted ? String(singleQuoted[1]).trim() : "";
}

/** В кармане уже есть готовая картинка (не плейсхолдер). */
export function hasCompletedImageInPocket(message) {
  const pocket = (message?.extra?.extblocks || "").trim();
  if (!pocket || pocket.includes("[IMG:GEN]")) {
    return false;
  }

  const block = extractFirstImagenBlock(pocket) || pocket;
  return isCompletedImageBlockHtml(block);
}

/**
 * Подтягивать HTML из DOM в карман только пока ждём SillyImages или карман пуст.
 * Иначе устаревший DOM затирает правки из редактора.
 */
export function shouldPullImageBlockFromDom(message) {
  if (!message?.extra) {
    return true;
  }

  if (hasMessageImageError(message)) {
    return true;
  }

  const pocket = (message.extra.extblocks || "").trim();
  if (!pocket) {
    return true;
  }

  if (pocket.includes("[IMG:GEN]")) {
    return true;
  }

  return !hasCompletedImageInPocket(message);
}

function isCompletedRenderedImageBlock(block) {
  const text = (block || "").trim();
  if (!text || text.includes("[IMG:GEN]")) {
    return false;
  }

  if (isCompletedImageBlockHtml(text)) {
    return true;
  }

  return /\ssrc\s*=\s*["']?(?:\/|https?:\/\/|data:image\/)[^"'\s>]+/i.test(text);
}

/** Берём самый свежий готовый блок из DOM. */
function extractBestCompletedBlockFromRendered(rawHtml, preferInstruction = "") {
  const blocks = extractAllImagenBlocks(rawHtml);
  if (!blocks.length) {
    return "";
  }

  const completed = blocks.filter((block) => isCompletedRenderedImageBlock(block));
  if (!completed.length) {
    return "";
  }

  if (preferInstruction) {
    const matched = completed.filter((block) => {
      const instruction = getImageBlockInstruction(block);
      return (
        instruction === preferInstruction ||
        instruction.includes(preferInstruction) ||
        preferInstruction.includes(instruction)
      );
    });
    if (matched.length) {
      return matched[matched.length - 1];
    }
    return "";
  }

  return completed[completed.length - 1];
}

function getDisplayImagenSuffix(display, mes) {
  const text = (display || "").trim();
  const prefix = (mes || "").trim();
  if (!text) {
    return "";
  }

  if (prefix && text.startsWith(prefix)) {
    return text.slice(prefix.length).trim();
  }

  return extractFirstImagenBlock(text);
}

function getHtmlTagNames(html) {
  const text = (html || "").trim();
  if (!text) {
    return [];
  }

  const names = [];
  const tagRe = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/gi;
  let m = null;
  // eslint-disable-next-line no-cond-assign
  while ((m = tagRe.exec(text))) {
    names.push(String(m[1]).toLowerCase());
  }
  return names;
}

function hasDangerousHtmlContent(html) {
  return (
    /<\s*(script|iframe|object|embed|link|style|meta|base)\b/i.test(html) ||
    /<\s*\/?\s*(script|iframe|object|embed|link|style|meta|base)\b/i.test(html) ||
    /on[a-z]+\s*=/i.test(html) ||
    /javascript\s*:/i.test(html) ||
    /data\s*:\s*text\/html/i.test(html) ||
    /srcdoc\s*=/i.test(html) ||
    /\shref\s*=/i.test(html) ||
    /\ssrcset\s*=/i.test(html)
  );
}

function getMediaSrcValues(html) {
  const srcMatches = [];
  const srcRe = /src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m = null;
  while ((m = srcRe.exec(html))) {
    srcMatches.push(String(m[1] ?? m[2] ?? m[3] ?? "").trim());
  }
  return srcMatches;
}

const IMG_GEN_SRC_RE =
  /src\s*=\s*(?:"\[IMG:GEN\]"|'\[IMG:GEN\]'|\[IMG:GEN\])/i;

/** Готовый `<imagen>` из display_text / DOM / кармана (для подстановки src). */
function extractCompletedBlockFromMessageSources(message, mesId, preferInstruction = "") {
  if (typeof document !== "undefined") {
    const safeId = Number.parseInt(mesId, 10);
    if (Number.isInteger(safeId)) {
      const mesEl = document.querySelector(
        `#chat .mes[mesid="${safeId}"] .mes_text`,
      );
      if (mesEl) {
        const fromDom = extractBestCompletedBlockFromRendered(
          mesEl.innerHTML || "",
          preferInstruction,
        );
        if (fromDom) {
          return fromDom;
        }
      }
    }
  }

  const fromDisplay = extractCompletedBlockFromDisplayText(message);
  if (fromDisplay) {
    return fromDisplay;
  }

  const pocket = (message?.extra?.extblocks || "").trim();
  if (pocket && !pocket.includes("[IMG:GEN]")) {
    const block = extractFirstImagenBlock(pocket);
    if (block && isCompletedRenderedImageBlock(block)) {
      return block;
    }
  }

  return "";
}

/**
 * Если в редакторе остался `[IMG:GEN]`, а в чате картинка уже с путём — подставить src из DOM/display.
 * Иначе любая правка alt/style сносит отображение (как в ExtBlocks: в storage лежит реальный путь).
 */
export function mergeImageBlockWithRenderedSrc(html, message, mesId) {
  const text = (html || "").trim();
  if (!text || !/\[IMG:GEN\]/i.test(text)) {
    return text;
  }

  const completed = extractCompletedBlockFromMessageSources(
    message,
    mesId,
    getImageBlockInstruction(text),
  );
  if (!completed) {
    return text;
  }

  const domSrc = getMediaSrcValues(completed).find(
    (src) => src && !/\[IMG:/i.test(src),
  );
  if (!domSrc) {
    return text;
  }

  const quote = text.includes("src='") ? "'" : '"';
  return text.replace(
    IMG_GEN_SRC_RE,
    `src=${quote}${domSrc.replaceAll(quote, "")}${quote}`,
  );
}

/** HTML для редактора: с реальным src, если SillyImages уже отрисовал картинку. */
export function getMessageImageHtmlForEditor(message, mesId) {
  if (!message?.extra) {
    return "";
  }

  promoteCompletedImageBlockToPocket(message);
  const pocketHtml = getMessageImageHtmlRaw(message);
  if (!pocketHtml) {
    return "";
  }

  return mergeImageBlockWithRenderedSrc(pocketHtml, message, mesId);
}

function hasOnlyAllowedTags(html, allowedTagNames) {
  const tagNames = getHtmlTagNames(html);
  if (!tagNames.length) {
    return false;
  }
  const allowed = new Set(allowedTagNames);
  return tagNames.every((name) => allowed.has(name));
}

/** Плейсхолдер до генерации SillyImages. */
function isPendingImageBlockHtml(html) {
  const text = (html || "").trim();
  if (!text || !/<imagen\b/i.test(text) || !/<img\b/i.test(text)) {
    return false;
  }

  if (hasDangerousHtmlContent(text)) {
    return false;
  }

  if (!hasOnlyAllowedTags(text, ["imagen", "img"])) {
    return false;
  }

  if (!/data-iig-instruction\s*=\s*/i.test(text)) {
    return false;
  }

  const srcMatches = getMediaSrcValues(text);
  if (!srcMatches.length) {
    return false;
  }

  return srcMatches.every((src) => src && src.includes("[IMG:GEN]"));
}

/** Готовый блок после замены [IMG:GEN] на src. */
function isCompletedImageBlockHtml(html) {
  const text = (html || "").trim();
  if (!text || !/<imagen\b/i.test(text)) {
    return false;
  }

  if (!/<img\b/i.test(text) && !/<video\b/i.test(text)) {
    return false;
  }

  if (hasDangerousHtmlContent(text)) {
    return false;
  }

  if (!hasOnlyAllowedTags(text, ["imagen", "img", "video"])) {
    return false;
  }

  const srcMatches = getMediaSrcValues(text);
  if (!srcMatches.length) {
    return false;
  }

  return srcMatches.every((src) => {
    if (!src || src.includes("[IMG:GEN]")) {
      return false;
    }
    if (/^\[IMG:/i.test(src)) {
      return false;
    }
    return (
      src.startsWith("/") ||
      /^https?:\/\//i.test(src) ||
      /^data:image\//i.test(src)
    );
  });
}

/** Валидация модельного HTML и выделение безопасного `<imagen>` блока. */
export function sanitizeImageBlockHtml(rawHtml) {
  const raw = (rawHtml || "").trim();
  if (!raw) {
    return { ok: false, safeHtml: "", rawHtml: "" };
  }

  const normalized = normalizeImagenWrapper(raw);
  const extracted = extractFirstImagenBlock(normalized);
  if (!extracted) {
    return { ok: false, safeHtml: "", rawHtml: raw };
  }

  if (isPendingImageBlockHtml(extracted) || isCompletedImageBlockHtml(extracted)) {
    return {
      ok: true,
      safeHtml: extracted,
      rawHtml: raw,
    };
  }

  return { ok: false, safeHtml: "", rawHtml: raw };
}

/** Готовый `<imagen>` из display_text без `[IMG:GEN]`. */
function extractCompletedBlockFromDisplayText(message) {
  const display = (message?.extra?.display_text || "").trim();
  if (!display) {
    return "";
  }

  const block = extractFirstImagenBlock(display);
  if (!block || block.includes("[IMG:GEN]")) {
    return "";
  }

  if (isCompletedImageBlockHtml(block)) {
    return block;
  }

  const hasGeneratedSrc = /\ssrc\s*=\s*["']?(?:\/|https?:\/\/|data:image\/)[^"'\s>]+/i.test(
    block,
  );
  return hasGeneratedSrc ? block : "";
}

/** Если DOM уже готов, переносим готовый блок в карман. */
export function promoteCompletedImageBlockToPocket(message) {
  if (!message?.extra || hasMessageImageError(message)) {
    return false;
  }

  const pocket = (message.extra.extblocks || "").trim();
  if (pocket && !pocket.includes("[IMG:GEN]")) {
    return false;
  }

  const fromDisplay = extractCompletedBlockFromDisplayText(message);
  if (!fromDisplay) {
    return false;
  }

  // На регене не подменяем новый pending-блок старым готовым.
  if (pocket.includes("[IMG:GEN]")) {
    const pocketInstruction = getImageBlockInstruction(pocket);
    const displayInstruction = getImageBlockInstruction(fromDisplay);
    if (
      pocketInstruction &&
      displayInstruction &&
      pocketInstruction !== displayInstruction
    ) {
      return false;
    }
  }

  message.extra.extblocks = fromDisplay;
  message.extra[RAW_EXTBLOCKS_KEY] = fromDisplay;
  delete message.extra[ERROR_KEY];
  return true;
}

/** Блок для отображения, без отката в pending-версию. */
function getEffectiveImageBlock(message) {
  if (!message?.extra || hasMessageImageError(message)) {
    return "";
  }

  promoteCompletedImageBlockToPocket(message);
  return (message.extra.extblocks || "").trim();
}

export function getMessageImageHtmlRaw(message) {
  if (!message?.extra) {
    return "";
  }

  promoteCompletedImageBlockToPocket(message);

  const raw = message.extra[RAW_EXTBLOCKS_KEY];
  if (typeof raw === "string") {
    return raw.trim();
  }

  // Для старых чатов без raw-ключа.
  return (message.extra.extblocks || "").trim();
}

export function hasMessageImageError(message) {
  return Boolean(message?.extra?.[ERROR_KEY]);
}

/** Есть ли у сообщения сохранённое состояние блока. */
export function hasStoredImageState(message) {
  if (!message?.extra) {
    return false;
  }
  return hasMessageImageError(message) || Boolean((message.extra.extblocks || "").trim());
}

/** Сообщение в режиме «ждём ответ модели» после свайпа. */
export function isSwipeGenerationPlaceholder(message, mesId) {
  const mes = (message?.mes || "").trim();
  if (mes === "...") {
    return true;
  }

  if (typeof document === "undefined" || mesId === undefined || mesId === null) {
    return false;
  }

  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId)) {
    return false;
  }

  const mesText = document.querySelector(`#chat .mes[mesid="${safeId}"] .mes_text`);
  if (!mesText) {
    return false;
  }

  const domMes = (mesText.textContent || "").trim();
  return domMes === "...";
}

function isImageBlockPresentInDom(mesId) {
  if (typeof document === "undefined") {
    return false;
  }

  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0) {
    return false;
  }

  const mesTextEl = document.querySelector(
    `#chat .mes[mesid="${safeId}"] .mes_text`,
  );
  if (!mesTextEl) {
    return false;
  }

  const html = mesTextEl.innerHTML || "";
  // Для восстановления важен сам факт наличия блока в DOM.
  return (
    /<imagen/i.test(html) ||
    /story-manager-image-error/i.test(html) ||
    /\[IMG:GEN\]/i.test(html)
  );
}

/** После ручной правки обновляем мета и сохраняем в свайп. */
export function syncImageMetaToCurrentMes(message) {
  if (!message?.extra || !hasStoredImageState(message)) {
    return;
  }

  const meta = ensureMeta(message);
  meta.mesAtSave = getMesFingerprint(message);
  if (typeof message.swipe_id === "number") {
    meta.swipeIdAtSave = message.swipe_id;
  }
  syncImagePocketToSwipe(message);
}

/** Карман валиден только для текущего свайпа и текста. */
export function isImageStateCurrentForMes(message) {
  if (!hasStoredImageState(message)) {
    return false;
  }

  const meta = message.extra[META_KEY] || {};
  const savedMes = (meta.mesAtSave || "").trim();
  const currentMes = getMesFingerprint(message);
  if (!savedMes || savedMes !== currentMes) {
    return false;
  }

  if (typeof message.swipe_id === "number" && typeof meta.swipeIdAtSave === "number") {
    return meta.swipeIdAtSave === message.swipe_id;
  }

  return true;
}

/** Сброс кармана перед генерацией нового свайпа. */
export function clearImagePocketForGeneration(message) {
  if (!message) {
    return;
  }

  if (!message.extra) {
    message.extra = {};
  }

  delete message.extra.extblocks;
  delete message.extra[RAW_EXTBLOCKS_KEY];
  delete message.extra[ERROR_KEY];
  delete message.extra[LEGACY_POCKET_KEY];
  delete message.extra[META_KEY];

  const display = message.extra.display_text;
  if (display && (/<imagen/i.test(display) || /story-manager-image-error/i.test(display))) {
    delete message.extra.display_text;
  }

  syncImagePocketToSwipe(message);
}

/** Сохранить `extra` текущего свайпа в `swipe_info`. */
export function syncImagePocketToSwipe(message) {
  if (!message || typeof message.swipe_id !== "number") {
    return;
  }

  if (!Array.isArray(message.swipe_info) || !Array.isArray(message.swipes)) {
    return;
  }

  const swipeId = message.swipe_id;
  if (typeof message.swipes[swipeId] !== "string" || !message.swipe_info[swipeId]) {
    return;
  }

  message.swipe_info[swipeId].extra = structuredClone(message.extra ?? {});
}

/** HTML блока из кармана без повторной валидации. */
export function getMessageImageHtml(message) {
  if (!message?.extra || hasMessageImageError(message)) {
    return "";
  }
  return (message.extra.extblocks || "").trim();
}

function migrateLegacyPocketToExtblocks(message) {
  if (!message?.extra) {
    return false;
  }

  const legacyHtml = (message.extra[LEGACY_POCKET_KEY]?.html || "").trim();
  if (!legacyHtml || !isImageBlockHtml(legacyHtml)) {
    return false;
  }

  if (!(message.extra.extblocks || "").trim()) {
    message.extra.extblocks = legacyHtml;
    delete message.extra[ERROR_KEY];
  }

  delete message.extra[LEGACY_POCKET_KEY];
  return true;
}

/** Собрать `display_text` как `mes + блок`. */
export function rebuildDisplayText(message) {
  if (!message?.extra) {
    return;
  }

  const block = getEffectiveImageBlock(message);
  const hasError = hasMessageImageError(message);
  const mes = message.mes || "";

  if (!block) {
    if (hasError) {
      const separator = mes.trim() ? "\n" : "";
      message.extra.display_text = `${mes}${separator}${IMAGE_GENERATION_ERROR_BOX_HTML}`;
      return;
    }

    const display = message.extra.display_text;
    if (display && /<imagen/i.test(display)) {
      delete message.extra.display_text;
    } else if (display && /story-manager-image-error/i.test(display)) {
      delete message.extra.display_text;
    } else if (display && mes && !display.startsWith(mes)) {
      delete message.extra.display_text;
    }
    return;
  }

  const separator = mes.trim() ? "\n" : "";
  message.extra.display_text = `${mes}${separator}${block}`;
}

/** Нужна ли пересборка `display_text` из кармана. */
export function isDisplayTextStale(message, mesId) {
  if (!message?.extra || !hasStoredImageState(message)) {
    return false;
  }

  if (isSwipeGenerationPlaceholder(message, mesId)) {
    return false;
  }

  const mes = (message.mes || "").trim();
  const display = (message.extra.display_text || "").trim();
  if (!display) {
    return true;
  }

  if (mes && !display.startsWith(mes)) {
    return true;
  }

  if (hasMessageImageError(message)) {
    return !/story-manager-image-error/i.test(display);
  }

  const pocketBlock = (message.extra.extblocks || "").trim();
  const displaySuffix = getDisplayImagenSuffix(display, mes);
  if (pocketBlock && displaySuffix) {
    const pocketPending = pocketBlock.includes("[IMG:GEN]");
    const displayPending = displaySuffix.includes("[IMG:GEN]");

    if (pocketPending && !displayPending) {
      return true;
    }

    if (pocketPending && displayPending) {
      const pocketInstruction = getImageBlockInstruction(pocketBlock);
      const displayInstruction = getImageBlockInstruction(displaySuffix);
      if (
        pocketInstruction &&
        displayInstruction &&
        pocketInstruction !== displayInstruction
      ) {
        return true;
      }
    }

    if (!pocketPending && isCompletedRenderedImageBlock(displaySuffix)) {
      const pocketInstruction = getImageBlockInstruction(pocketBlock);
      const displayInstruction = getImageBlockInstruction(displaySuffix);
      if (
        pocketInstruction &&
        displayInstruction &&
        pocketInstruction !== displayInstruction
      ) {
        return true;
      }
    }
  }

  return !/<imagen/i.test(display);
}

export function clearMessageImageBlock(message) {
  if (!message?.extra) {
    return;
  }

  delete message.extra.extblocks;
  delete message.extra[RAW_EXTBLOCKS_KEY];
  delete message.extra[ERROR_KEY];
  delete message.extra[META_KEY];
  delete message.extra[LEGACY_POCKET_KEY];
  rebuildDisplayText(message);
  syncImagePocketToSwipe(message);
}

export function setMessageImageHtml(message, html, options = {}) {
  if (!message) {
    return;
  }

  if (!message.extra) {
    message.extra = {};
  }

  const trimmed = (html || "").trim();
  if (!trimmed) {
    clearMessageImageBlock(message);
    return;
  }

  const { ok, safeHtml, rawHtml } = sanitizeImageBlockHtml(trimmed);

  if (!ok) {
    // В ошибке храним сырой ответ модели для редактора.
    message.extra[RAW_EXTBLOCKS_KEY] = rawHtml;
    delete message.extra.extblocks;
    message.extra[ERROR_KEY] = true;
  } else {
    // В успехе храним уже очищенный блок.
    message.extra[RAW_EXTBLOCKS_KEY] = safeHtml;
    message.extra.extblocks = safeHtml;
    delete message.extra[ERROR_KEY];
  }

  const meta = ensureMeta(message);
  const overrideMes = typeof options.mesAtSave === "string" ? options.mesAtSave : "";
  meta.mesAtSave = (overrideMes || getMesFingerprint(message)).trim();
  if (typeof message.swipe_id === "number") {
    meta.swipeIdAtSave = message.swipe_id;
  }
  rebuildDisplayText(message);
  syncImagePocketToSwipe(message);

  return { ok, safeHtml: message.extra.extblocks || "", rawHtml };
}

/** Синхронизировать `display_text` и попросить ST перерисовать сообщение. */
export async function applyImageBlockToMessage(mesId, options = {}) {
  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0) {
    return false;
  }

  const context = getContext();
  const message = context?.chat?.[safeId];
  if (!message || message.is_user) {
    return false;
  }

  migrateLegacyPocketToExtblocks(message);
  if (isDisplayTextStale(message, safeId)) {
    rebuildDisplayText(message);
  }

  if (typeof context.updateMessageBlock !== "function") {
    return hasStoredImageState(message);
  }

  // При "..." избегаем полной перерисовки, чтобы не вернуть старый mes.
  const rerenderMessage =
    options.rerenderMessage !== false && !isSwipeGenerationPlaceholder(message, safeId);

  await context.updateMessageBlock(safeId, message, { rerenderMessage });
  return true;
}

/** Восстановить `display_text` из кармана, если ST его затёр. */
export async function repairDisplayTextIfNeeded(mesId) {
  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0) {
    return;
  }

  const message = getContext()?.chat?.[safeId];
  if (!message || message.is_user || !hasStoredImageState(message)) {
    return;
  }

  // В режиме placeholder не восстанавливаем картинку.
  if (isSwipeGenerationPlaceholder(message, safeId)) {
    return;
  }

  promoteCompletedImageBlockToPocket(message);

  // Если DOM очищен, восстанавливаем даже при "не stale" display_text.
  const domHasBlock = isImageBlockPresentInDom(safeId);
  if (!domHasBlock && hasStoredImageState(message)) {
    rebuildDisplayText(message);
    syncImagePocketToSwipe(message);
    await applyImageBlockToMessage(safeId);
    saveChat();
    return;
  }

  if (!isDisplayTextStale(message, safeId)) {
    return;
  }

  rebuildDisplayText(message);
  syncImagePocketToSwipe(message);
  await applyImageBlockToMessage(safeId);
  saveChat();
}

/** Подтянуть готовый `<imagen>` из DOM в карман. */
export async function syncImageBlockFromRenderedDom(mesId) {
  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0 || typeof document === "undefined") {
    return false;
  }

  const message = getContext()?.chat?.[safeId];
  if (!message || message.is_user) {
    return false;
  }

  if (!shouldPullImageBlockFromDom(message)) {
    return false;
  }

  const mesEl = document.querySelector(`#chat .mes[mesid="${safeId}"] .mes_text`);
  if (!mesEl) {
    return false;
  }

  const renderedHtml = mesEl.innerHTML || "";
  const preferInstruction = getImageBlockInstruction(message.extra.extblocks || "");
  const block = extractBestCompletedBlockFromRendered(renderedHtml, preferInstruction);
  if (!block || block.includes("[IMG:GEN]")) {
    return false;
  }

  if (!isCompletedRenderedImageBlock(block)) {
    return false;
  }

  message.extra.extblocks = block;
  delete message.extra[ERROR_KEY];
  message.extra[RAW_EXTBLOCKS_KEY] = block;

  const meta = ensureMeta(message);
  meta.mesAtSave = getMesFingerprint(message);
  if (typeof message.swipe_id === "number") {
    meta.swipeIdAtSave = message.swipe_id;
  }

  const mes = message.mes || "";
  const separator = mes.trim() ? "\n" : "";
  message.extra.display_text = `${mes}${separator}${block}`;

  syncImagePocketToSwipe(message);
  await applyImageBlockToMessage(safeId);
  saveChat();
  return true;
}

export async function prepareImageBlockRegeneration(mesId) {
  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0) {
    return;
  }

  const message = getContext()?.chat?.[safeId];
  if (!message || message.is_user) {
    return;
  }

  clearMessageImageBlock(message);
  await applyImageBlockToMessage(safeId);
  saveChat();
}

let swipeImageSyncTimer = null;

export function scheduleSwipeImageSync(mesId) {
  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0) {
    return;
  }

  const message = getContext()?.chat?.[safeId];
  if (message && !message.is_user && isSwipeGenerationPlaceholder(message, safeId)) {
    clearImagePocketForGeneration(message);
    return;
  }

  clearTimeout(swipeImageSyncTimer);
  swipeImageSyncTimer = setTimeout(() => {
    swipeImageSyncTimer = null;
    void onMessageSwiped(safeId);
  }, 80);
}

export async function onMessageSwiped(mesId) {
  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0) {
    return;
  }

  const message = getContext()?.chat?.[safeId];
  if (!message || message.is_user) {
    return;
  }

  if (!message.extra) {
    message.extra = {};
  }

  // На новом свайпе/регене ST ставит "...", карман просто чистим.
  if (isSwipeGenerationPlaceholder(message, safeId)) {
    clearImagePocketForGeneration(message);
    return;
  }

  // На сохранённом свайпе extra уже восстановлен через syncSwipeToMes.
  if (!isDisplayTextStale(message, safeId)) {
    return;
  }

  rebuildDisplayText(message);
  syncImagePocketToSwipe(message);
  await applyImageBlockToMessage(safeId);
  saveChat();
}

export async function onMessageContentEdited(mesId) {
  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0) {
    return;
  }

  const message = getContext()?.chat?.[safeId];
  if (!message || message.is_user) {
    return;
  }

  if (!hasStoredImageState(message)) {
    return;
  }

  promoteCompletedImageBlockToPocket(message);

  if (hasCompletedImageInPocket(message)) {
    const meta = ensureMeta(message);
    meta.mesAtSave = getMesFingerprint(message);
    if (typeof message.swipe_id === "number") {
      meta.swipeIdAtSave = message.swipe_id;
    }
  }

  if (!isDisplayTextStale(message, safeId)) {
    syncImageMetaToCurrentMes(message);
    return;
  }

  rebuildDisplayText(message);
  syncImageMetaToCurrentMes(message);
  await applyImageBlockToMessage(safeId);
  saveChat();
}

/** На смене чата: миграция legacy и починка display_text. */
export async function refreshAllImageBlocks() {
  const context = getContext();
  if (!context?.chat) {
    return;
  }

  let shouldPersist = false;

  context.chat.forEach((message) => {
    if (message?.is_user) {
      return;
    }

    if (migrateLegacyPocketToExtblocks(message)) {
      shouldPersist = true;
    }

    if (!hasStoredImageState(message)) {
      return;
    }

    if (isDisplayTextStale(message, context.chat.indexOf(message))) {
      rebuildDisplayText(message);
      shouldPersist = true;
    }
  });

  if (shouldPersist) {
    saveChat();
  }
}

/** После вставки `[IMG:GEN]` программно запускаем реген SillyImages. */
export function triggerSillyImagesForMessage(mesId, options = {}) {
  const safeId = Number.parseInt(mesId, 10);
  if (!Number.isInteger(safeId) || safeId < 0) {
    return false;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const context = getContext();
  const message = context?.chat?.[safeId];
  if (!message || message.is_user) {
    return false;
  }

  const forceClick = options.forceClick === true;
  // Без forceClick триггерим только при `[IMG:GEN]`.
  const block = getMessageImageHtml(message);
  if (!forceClick && (!block || !block.includes("[IMG:GEN]"))) {
    return false;
  }

  const {
    delayMs = 120,
    maxAttempts = 8,
    syncDelayMs = 1500,
    syncAttempts = 30,
    syncIntervalMs = 500,
  } = options;
  let attempt = 0;

  const tryStart = () => {
    attempt++;

    const mesEl = document.querySelector(`#chat .mes[mesid="${safeId}"]`);
    if (!mesEl) {
      if (attempt < maxAttempts) {
        setTimeout(tryStart, delayMs);
      }
      return;
    }

    // Не жмём повторно, если генерация уже идёт.
    if (mesEl.querySelector(".iig-loading-placeholder")) {
      if (attempt < maxAttempts) {
        setTimeout(tryStart, delayMs);
      }
      return;
    }

    const regenBtn = mesEl.querySelector(".iig-regenerate-btn");
    if (regenBtn) {
      regenBtn.click();
      return;
    }

    if (attempt < maxAttempts) {
      setTimeout(tryStart, delayMs);
    }
  };

  tryStart();

  let syncAttempt = 0;
  const trySyncCompleted = () => {
    syncAttempt++;
    void syncImageBlockFromRenderedDom(safeId).then((synced) => {
      if (synced) {
        return;
      }
      if (syncAttempt >= syncAttempts) {
        return;
      }
      setTimeout(trySyncCompleted, syncIntervalMs);
    });
  };
  setTimeout(trySyncCompleted, syncDelayMs);

  return true;
}

/** Берём ответ модели как есть. */
export function extractImageHtmlFromModelOutput(text) {
  const raw = (text || "").trim();
  if (!raw) {
    return "";
  }

  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}
