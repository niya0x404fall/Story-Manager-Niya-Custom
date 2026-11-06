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
  // Settings and history have their own navigation now; remove only redundant headings.
  $general.find(".story-manager-subsection").first().children(".inline-drawer-header").hide();
  $general.find(".story-manager-subsection").first().children(".inline-drawer-content").show();
  $history.find(".story-summary-home").children(".inline-drawer-header").hide();
  $history.find(".story-summary-home").children(".inline-drawer-content").show();
  function select(key) {
    for (const [name, $items] of Object.entries(panels)) $items.toggle(name === key);
    $hint.toggle(key === "details");
    $nav.find("button").each(function () {
      $(this).attr("aria-pressed", String($(this).attr("data-story-view") === key));
    });
  }
  select("history");
}
