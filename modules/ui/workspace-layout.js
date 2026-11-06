// Navigation only: no chat data or injection settings are changed here.
export function initWorkspaceLayout($panel) {
  const $root = $panel.find("#story_manager_settings").addBack("#story_manager_settings");
  const $body = $root.children(".inline-drawer-content");
  const $general = $body.children(".story-manager-section").first();
  const $sections = $body.children(".story-manager-subsections").children(".story-manager-section");
  const $history = $sections.has(".story-summary-home");
  const $details = $sections.not($history);
  const $nav = $('<nav class="story-workspace-nav" aria-label="Разделы Story Manager"></nav>');
  const $profile = $('<p class="story-workspace-profile">Профиль подключения: <span class="story-profile-label"></span></p>');
  const $hint = $('<p class="story-workspace-hint">Здесь пока ваши прежние заметки, персонажи и локации. Записи и их работа не изменены.</p>');
  $details.first().before($hint);
  $body.prepend($profile, $nav);
  const panels = { history: $history, details: $details, settings: $general };
  for (const [key, title] of Object.entries({ history: "История", details: "Детали", settings: "Настройки" })) {
    $("<button>", { type: "button", text: title, "aria-pressed": "false" })
      .attr("data-story-view", key).on("click", () => select(key)).appendTo($nav);
  }
  // These two panels are tabs, not drawers. Keeping drawer wrappers allows
  // Tavern/theme collapse rules to hide content after our initial .show().
  for (const [$section, selector] of [
    [$general, ".story-manager-subsection"],
    [$history, ".story-summary-home"],
  ]) {
    const $drawer = $section.find(selector).first();
    const $content = $drawer.children(".inline-drawer-content");
    if (!$content.length) continue;
    const $plain = $('<div class="story-workspace-panel"></div>');
    $plain.append($content.contents());
    $drawer.replaceWith($plain);
  }
  arrangeSummaryActions($history);
  function select(key) {
    for (const [name, $items] of Object.entries(panels)) $items.toggle(name === key);
    $hint.toggle(key === "details");
    $nav.find("button").each(function () {
      $(this).attr("aria-pressed", String($(this).attr("data-story-view") === key));
    });
  }
  select("history");
}

function arrangeSummaryActions($history) {
  const $panel = $history.children(".story-workspace-panel");
  const $form = $panel.find(".story-summary-manual-range");
  const $toolbar = $('<div class="story-summary-toolbar" role="group" aria-label="Действия с саммари"></div>');
  const actions = [
    ["story-summary-mode-manual", "Добавить вручную"],
    ["story-summary-mode-generate", "Сгенерировать"],
    ["story-summary-compress-btn", "Сократить"],
    ["story-summary-fill-gaps-btn", "Заполнить пробелы"],
    ["story-summary-import-builtin-btn", "Импортировать"],
    ["story-summary-rebuild-btn", "Пересоздать"],
  ];
  for (const [id, label] of actions) {
    $panel.find(`#${id}`).text(label).appendTo($toolbar);
  }
  $panel.prepend($toolbar);
  $form.insertAfter($toolbar).addClass("story-summary-inline-form");
  $form.children("summary").hide();
  $form.find(".story-summary-mode-switch").remove();
  $toolbar.find("[data-summary-mode]").attr("aria-controls", "story-summary-creation-form")
    .on("click", () => $form.prop("open", true));
  $form.attr("id", "story-summary-creation-form");
  $('<button type="button" class="menu_button story-summary-form-close">Закрыть форму</button>')
    .on("click", () => $form.prop("open", false))
    .appendTo($form.find(".story-summary-manual-range-panel"));

  // Automatic summary belongs to History, alongside manual creation.
  const $automatic = $('<div class="story-summary-automatic"></div>');
  $automatic.append(
    $panel.find(".story-summary-auto-enable-row"),
    $panel.find(".story-summary-auto-interval"),
  ).insertAfter($form);
  $automatic.find(".story-summary-auto-enable-label b").text("Автосаммари");
  const $heading = $('<div class="story-summary-list-heading"></div>');
  $panel.find(".story-summary-chunks-heading").before($heading).appendTo($heading);
  $panel.find(".story-summary-enable-row").appendTo($heading);
  $heading.find("b").text("В контексте");
  $heading.find("label").attr("title", "Использовать сохранённые саммари в контексте модели");
  $panel.find(".story-summary-selection-hint").hide();
  $panel.find("#story-summary-rollback-btn").insertAfter($panel.find("#story-summary-token-count"));
  $panel.find(".story-summary-maintenance").remove();
}
