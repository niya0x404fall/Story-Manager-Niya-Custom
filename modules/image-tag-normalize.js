/**
 * Приведение обёрток HTML-блоков картинок к тегу `<imagen>` (контракт Story Manager / SillyImages).
 *
 * Ручная проверка в консоли браузера или Node:
 *   import { normalizeImagenWrapper } from './modules/image-tag-normalize.js';
 *   normalizeImagenWrapper('<image><img data-iig-instruction="x" src="[IMG:GEN]"></image>');
 */

export const IMAGEN_CANONICAL_TAG = "imagen";

/** Известные алиасы обёртки из ExtBlocks и типичных пресетов. */
export const IMAGEN_WRAPPER_ALIASES = Object.freeze([
  "image",
  "picture",
  "illustration",
  "imgen",
  "imgblock",
  "scene",
  "visual",
  "pic",
  "art",
  "render",
  "iig",
  "iigblock",
  "comix",
]);

const SKIP_WRAPPER_TAGS = new Set([
  "img",
  "video",
  "audio",
  "source",
  "br",
  "hr",
  "input",
  "meta",
  "link",
  "style",
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "div",
  "span",
  "p",
  "a",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "ul",
  "ol",
  "li",
  "table",
  "tr",
  "td",
  "th",
  "tbody",
  "thead",
  "body",
  "html",
  "head",
  "label",
  "form",
  "button",
]);

const BLOCK_MARKER_RE = /data-iig-instruction|\[IMG:GEN\]/i;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasBlockMarker(html) {
  return BLOCK_MARKER_RE.test(html || "");
}

function renameWrapperTag(fragment, fromTag, toTag = IMAGEN_CANONICAL_TAG) {
  const from = String(fromTag || "").trim();
  const to = String(toTag || IMAGEN_CANONICAL_TAG).trim();
  if (!from || from.toLowerCase() === to.toLowerCase()) {
    return fragment;
  }

  const name = escapeRegExp(from);
  return fragment
    .replace(new RegExp(`<${name}\\b`, "gi"), `<${to}`)
    .replace(new RegExp(`</${name}\\s*>`, "gi"), `</${to}>`);
}

function buildWrappedBlockRegex(tagName) {
  const name = escapeRegExp(tagName);
  return new RegExp(
    `<${name}\\b[\\s\\S]*?(?:data-iig-instruction|\\[IMG:GEN\\])[\\s\\S]*?</${name}\\s*>`,
    "i",
  );
}

function findAliasWrappedBlock(html) {
  const text = (html || "").trim();
  if (!text) {
    return null;
  }

  for (const alias of IMAGEN_WRAPPER_ALIASES) {
    const match = text.match(buildWrappedBlockRegex(alias));
    if (match) {
      return { tag: alias, block: match[0] };
    }
  }

  return null;
}

/**
 * Имя внешнего тега-обёртки вокруг `data-iig-instruction` / `[IMG:GEN]`, если есть.
 * @returns {string} lowercase tag name or ""
 */
export function detectWrapperTagName(html) {
  const text = (html || "").trim();
  if (!text || !hasBlockMarker(text)) {
    return "";
  }

  const markerIndex = text.search(BLOCK_MARKER_RE);
  if (markerIndex < 0) {
    return "";
  }

  const beforeMarker = text.slice(0, markerIndex);
  const openMatches = [...beforeMarker.matchAll(/<([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*>/gi)];
  if (!openMatches.length) {
    return "";
  }

  const afterMarker = text.slice(markerIndex);

  for (let i = openMatches.length - 1; i >= 0; i--) {
    const tag = String(openMatches[i][1]).toLowerCase();
    if (SKIP_WRAPPER_TAGS.has(tag)) {
      continue;
    }

    const closeRe = new RegExp(`</${escapeRegExp(tag)}\\s*>`, "i");
    const closeMatch = afterMarker.match(closeRe);
    if (!closeMatch || closeMatch.index === undefined) {
      continue;
    }

    const blockStart = openMatches[i].index;
    const blockEnd = markerIndex + closeMatch.index + closeMatch[0].length;
    const block = text.slice(blockStart, blockEnd);

    if (hasBlockMarker(block)) {
      return tag;
    }
  }

  return "";
}

function replaceFirstBlock(html, block, replacement) {
  const index = html.indexOf(block);
  if (index < 0) {
    return html;
  }

  return `${html.slice(0, index)}${replacement}${html.slice(index + block.length)}`;
}

function normalizeDetectedWrapperBlock(html) {
  const wrapper = detectWrapperTagName(html);
  if (!wrapper || wrapper === IMAGEN_CANONICAL_TAG) {
    return html;
  }

  const match = html.match(buildWrappedBlockRegex(wrapper));
  if (!match) {
    return html;
  }

  return replaceFirstBlock(html, match[0], renameWrapperTag(match[0], wrapper));
}

/**
 * Оборачивает одиночный `<img … data-iig-instruction …>` / `[IMG:GEN]` в `<imagen>`, если обёртки ещё нет.
 */
export function wrapInImagenIfNeeded(html) {
  const text = (html || "").trim();
  if (!text) {
    return "";
  }

  if (
    new RegExp(
      `<${IMAGEN_CANONICAL_TAG}\\b[\\s\\S]*?(?:data-iig-instruction|\\[IMG:GEN\\])[\\s\\S]*?</${IMAGEN_CANONICAL_TAG}\\s*>`,
      "i",
    ).test(text)
  ) {
    return text;
  }

  const imgMatch = text.match(
    /<img\b[\s\S]*?(?:data-iig-instruction|\[IMG:GEN\])[\s\S]*?\/?>/i,
  );
  if (!imgMatch) {
    return text;
  }

  const wrapped = `<${IMAGEN_CANONICAL_TAG}>\n${imgMatch[0]}\n</${IMAGEN_CANONICAL_TAG}>`;
  return replaceFirstBlock(text, imgMatch[0], wrapped);
}

/**
 * Приводит HTML-блок (шаблон пресета, ответ модели, импорт ExtBlocks) к `<imagen>`.
 */
export function normalizeImagenWrapper(html) {
  let text = (html || "").trim();
  if (!text) {
    return "";
  }

  if (
    /<imagen\b/i.test(text) &&
    hasBlockMarker(text) &&
    !findAliasWrappedBlock(text)
  ) {
    return wrapInImagenIfNeeded(text);
  }

  const aliasBlock = findAliasWrappedBlock(text);
  if (aliasBlock) {
    text = replaceFirstBlock(
      text,
      aliasBlock.block,
      renameWrapperTag(aliasBlock.block, aliasBlock.tag),
    );
    return wrapInImagenIfNeeded(text);
  }

  text = normalizeDetectedWrapperBlock(text);
  return wrapInImagenIfNeeded(text);
}
