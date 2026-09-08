const MODAL_ROOT_ID = "story-manager-modal-root";

/** Корень модалок на <html>, вне панелей ST (transform не ломает position:fixed). */
export function getStoryManagerModalRoot() {
  let $root = $(`#${MODAL_ROOT_ID}`);

  if (!$root.length || !document.documentElement.contains($root[0])) {
    $root = $(`<div id="${MODAL_ROOT_ID}"></div>`);
    document.documentElement.appendChild($root[0]);
  }

  return $root;
}

export function mountStoryManagerModal($popup) {
  if (!$popup?.length) {
    return;
  }

  getStoryManagerModalRoot().append($popup);
}
