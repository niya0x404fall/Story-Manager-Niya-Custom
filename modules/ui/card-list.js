import { deleteEntity, getEntities, toggleEntity } from "../entities.js";
import { injectAllEntities } from "../injection.js";
import { createFromTemplate } from "../templates.js";
import { getTokenCountAsync } from "../../../../../tokenizers.js";
import { fmt, UI } from "../ui-text.js";
import { applyEntityCardTemplateText } from "./apply-ui-text.js";

/** Обновить подпись «N токенов» под списком карточек. */
export async function updateTokenCountLabel(selector, getText) {
  const text = typeof getText === "function" ? await getText() : getText;
  const tokenCount = await getTokenCountAsync(text || "");
  $(selector).text(tokenCount ? fmt.tokenCount(tokenCount) : UI.common.tokenCountZero);
}

/** Клики по этим элементам в шапке карточки не сворачивают/разворачивают тело. */
export const CARD_LIST_EXPAND_IGNORE =
  ".story-note-actions, input[type='checkbox'], .story-manager-toggle-switch";

export function parseCardItemId($trigger, itemSelector, idAttribute) {
  return Number.parseInt($trigger.closest(itemSelector).attr(idAttribute), 10);
}

/**
 * Универсальный рендер списка карточек (заметки, персонажи, локации, саммари).
 *
 * @param {Object} config
 * @param {string} config.namespace — суффикс jQuery-событий (например storyManagerNotes)
 * @param {string} config.containerSelector
 * @param {() => Array} config.getItems
 * @param {string} config.emptyHtml
 * @param {string} config.templateId
 * @param {string} config.itemSelector
 * @param {string} config.idAttribute — data-* атрибут с id элемента
 * @param {string} [config.headerSelector]
 * @param {string} [config.titleSelector]
 * @param {string} [config.bodySelector]
 * @param {string} [config.checkboxSelector]
 * @param {string} [config.deleteSelector]
 * @param {string} [config.expandSelector]
 * @param {string} [config.expandIgnoreSelector]
 * @param {string} [config.disabledClass]
 * @param {string} [config.entityType] — для встроенных toggle/delete через entities.js
 * @param {(item: object) => string|number} [config.getItemId]
 * @param {(item: object) => string} [config.getTitle]
 * @param {(item: object) => string} [config.getBody]
 * @param {(item: object, id: number) => boolean|Promise<boolean>} [config.confirmDelete]
 * @param {($item: JQuery, item: object) => void} [config.decorateItem]
 * @param {boolean} [config.injectOnChange]
 * @param {() => void|Promise<void>} [config.onBeforeRender]
 * @param {() => void|Promise<void>} [config.onAfterRender]
 * @param {(id: number, enabled: boolean) => void|Promise<void>} [config.onAfterToggle]
 * @param {(id: number) => void|Promise<void>} [config.onAfterDelete]
 * @param {(id: number) => void|Promise<void>} [config.onDelete] — полностью заменяет удаление по entityType
 * @param {Array<{selector: string, handler: Function}>} [config.actions]
 * @param {string} [config.exportSelector]
 * @param {(id: number) => boolean|Promise<boolean>} [config.onExport]
 */
export async function renderCardList(config) {
  const {
    namespace,
    containerSelector,
    getItems,
    emptyHtml,
    templateId,
    itemSelector,
    idAttribute,
    headerSelector = ".story-note-header",
    titleSelector,
    bodySelector,
    checkboxSelector,
    deleteSelector,
    expandSelector,
    expandIgnoreSelector = CARD_LIST_EXPAND_IGNORE,
    disabledClass = "story-note-disabled",
    entityType,
    getItemId = (item) => item.id,
    getTitle,
    getBody,
    confirmDelete = (item) =>
      window.confirm(fmt.cardDeleteConfirm(getTitle && item ? getTitle(item) : "")),
    decorateItem,
    injectOnChange = true,
    onBeforeRender,
    onAfterRender,
    onAfterToggle,
    onAfterDelete,
    onDelete,
    actions = [],
    exportSelector,
    onExport,
  } = config;

  const reRender = () => renderCardList(config);
  const eventNamespace = `.${namespace}`;
  const container = $(containerSelector);

  if (onBeforeRender) {
    await onBeforeRender();
  }

  container.off(eventNamespace);

  const items = getItems();

  if (items.length === 0) {
    container.html(emptyHtml);
    if (injectOnChange) {
      injectAllEntities();
    }
    if (onAfterRender) {
      await onAfterRender();
    }
    return;
  }

  container.empty();

  for (const item of items) {
    const $item = createFromTemplate(templateId);
    const itemId = getItemId(item);
    $item.attr(idAttribute, itemId);

    if (titleSelector && getTitle) {
      $item.find(titleSelector).text(getTitle(item));
    }
    if (bodySelector && getBody) {
      $item.find(bodySelector).text(getBody(item));
    }
    if (checkboxSelector) {
      const enabled = item.enabled !== false;
      $item.find(checkboxSelector).prop("checked", enabled);
      if (!enabled) {
        $item.addClass(disabledClass);
      }
    }

    if (decorateItem) {
      decorateItem($item, item);
    }

    if (exportSelector) {
      applyEntityCardTemplateText($item, entityType);
    }

    container.append($item);
  }

  if (exportSelector && typeof onExport === "function") {
    container.on(`click${eventNamespace}`, exportSelector, async function (e) {
      e.stopPropagation();
      const id = parseCardItemId($(this), itemSelector, idAttribute);
      const success = await onExport(id);
      if (success) {
        await reRender();
      }
    });
  }

  if (checkboxSelector && entityType) {
    container.on(`click${eventNamespace}`, checkboxSelector, async function (e) {
      e.stopPropagation();
      const id = parseCardItemId($(this), itemSelector, idAttribute);
      const isEnabled = toggleEntity(entityType, id);
      $(this).closest(itemSelector).toggleClass(disabledClass, !isEnabled);
      if (injectOnChange) {
        injectAllEntities();
      }
      if (onAfterToggle) {
        await onAfterToggle(id, isEnabled);
      }
    });
  }

  if (deleteSelector) {
    container.on(`click${eventNamespace}`, deleteSelector, async function (e) {
      e.stopPropagation();
      const id = parseCardItemId($(this), itemSelector, idAttribute);
      if (!Number.isInteger(id)) {
        return;
      }

      const item = items.find((candidate) => getItemId(candidate) === id);
      if (!(await confirmDelete(item, id))) {
        return;
      }

      if (onDelete) {
        await onDelete(id, { reRender });
        return;
      }

      if (entityType) {
        deleteEntity(entityType, id);
      }

      if (onAfterDelete) {
        await onAfterDelete(id);
      }

      await reRender();
    });
  }

  for (const action of actions) {
    container.on(`click${eventNamespace}`, action.selector, async function (e) {
      e.stopPropagation();
      const id = parseCardItemId($(this), itemSelector, idAttribute);
      const $item = $(this).closest(itemSelector);
      await action.handler(e, { id, $item, reRender });
    });
  }

  if (bodySelector && expandSelector) {
    container.on(`click${eventNamespace}`, headerSelector, function (e) {
      if ($(e.target).closest(expandIgnoreSelector).length) {
        return;
      }

      $(this).closest(itemSelector).find(bodySelector).slideToggle(200);
      $(this)
        .find(expandSelector)
        .toggleClass("fa-circle-chevron-down fa-circle-chevron-up");
    });
  }

  if (injectOnChange) {
    injectAllEntities();
  }

  if (onAfterRender) {
    await onAfterRender();
  }
}

/** Обёртка для простых сущностей из entities.js (персонажи, локации). */
export function renderEntityList(options) {
  const {
    namespace,
    containerSelector,
    entityType,
    emptyText,
    templateId,
    itemSelector,
    idAttribute,
    titleSelector,
    bodySelector,
    checkboxSelector,
    deleteSelector,
    expandSelector,
    exportSelector,
    getTitle,
    getBody,
    onExport,
  } = options;

  return renderCardList({
    namespace,
    containerSelector,
    getItems: () => getEntities(entityType),
    emptyHtml: `<i>${emptyText}</i>`,
    templateId,
    itemSelector,
    idAttribute,
    titleSelector,
    bodySelector,
    checkboxSelector,
    deleteSelector,
    expandSelector,
    entityType,
    getTitle,
    getBody,
    exportSelector,
    onExport,
  });
}
