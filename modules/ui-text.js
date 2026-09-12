/**
 * Пользовательские строки Story Manager (RU).
 * Редактируйте формулировки здесь; в коде — импорт UI / fmt.
 */

export const UI = Object.freeze({
  appName: "Story Manager",

  common: Object.freeze({
    error: "Ошибка",
    chatNoMessages: "В чате нет сообщений",
    chatNoMessagesForSummary: "В чате нет сообщений для саммари",
    operationAborted: "Операция прервана.",
    formReloadHint: "Обновите страницу (Ctrl+F5).",
    close: "Закрыть",
    cancel: "❌ Отмена",
    save: "💾 Сохранить",
    reset: "Сбросить",
    confirmNo: "❌ Не делать",
    lorebookAction: "В лорбук",
    tokenCountZero: "0 токенов",
  }),

  toast: Object.freeze({
    titles: Object.freeze({
      default: "Story Manager",
      entity: "Story Manager · Сущности",
      summary: "Story Manager · Саммари",
      image: "Story Manager · Визуал",
    }),
    imageStart: Object.freeze([
      "Добавляю визуал в сообщение…",
      "Навожу красоту…",
      "Ищу вдохновение…",
      "Размышляю об атмосфере сцены…",
      "Бужу нейрохудожника…",
      "Отправляю эскиз нейросети…",
      "Проявляю пленку…",
      "Сейчас будет красиво (надеюсь)…",
      "Не отвлекайте, идёт оформление…",
      "Ещё чуть-чуть — и в чате будет картинка…",
    ]),
    errorHints: Object.freeze({
      default: "Проверьте подключение к сети и повторите попытку.",
      timeout:
        "Сервер долго не отвечает. Проверьте интернет и повторите позже.",
      network: "Проблема с сетью. Проверьте интернет или VPN.",
      emptyResponse: "Провайдер не вернул ответ. Повторите попытку.",
      chatSwitched:
        "Похоже, чат переключился во время запроса. Запустите снова.",
      imagePreset: "Проверьте настройки пресетов картинок.",
      apiAuth: "Проверьте API-ключ и доступ к провайдеру.",
      fallback:
        "Проверьте интернет или доступность провайдера, затем попробуйте снова.",
    }),
  }),

  generation: Object.freeze({
    busy: "Подождите, уже идёт генерация Story Manager…",
    fallbackTypeLabel: "Story Manager",
    typeLabels: Object.freeze({
      note: "заметки",
      character: "персонажа",
      location: "локации",
      imageManual: "визуала",
      imageAuto: "визуала",
      summary: "саммари",
      summaryRebuild: "саммари",
      summaryFillGaps: "саммари",
    }),
  }),

  lorebook: Object.freeze({
    selectLorebookFirst:
      "Сначала выберите лорбук в настройках Story Manager!",
    loadFailed: "Не удалось загрузить лорбук",
    exportFailed: "Ошибка при экспорте",
  }),

  timeout: Object.freeze({
    generation:
      "Генерация занимает слишком много времени. Попробуйте ещё раз.",
  }),

  messageButtons: Object.freeze({
    note: "Создать заметку",
    imageAdd: "Добавить визуал в сообщение",
    imageRegenerate: "Перегенерировать визуал в сообщении",
    summaryCountdownPlaceholder: "до саммари осталось ? сообщений",
  }),

  messageContext: Object.freeze({
    characterCard: "персонажа",
    locationCard: "локации",
  }),

  buttons: Object.freeze({
    messageNotFound: "Не найдено сообщение в чате.",
    messageIdUnknown:
      "Не удалось определить номер сообщения. Перезагрузите чат (F5) и попробуйте снова.",
    operationFailed: "Операция не выполнена.",
    imagesDisabled:
      "Генерация картинок отключена в настройках Story Manager",
    imageBotOnly: "Кнопка картинки работает только на ответах бота.",
    imageAttachFailed:
      "Не удалось привязать кнопку к сообщению. Обновите страницу (F5) или переключите чат.",
    imageAddFailed: "Не удалось добавить визуал в сообщение.",
    note: Object.freeze({
      start: "Создаю заметку…",
      success: "Заметка готова.",
      error: "Заметка не создана.",
    }),
    character: Object.freeze({
      start: "Извлекаю персонажа…",
      success: "Персонаж готов.",
      error: "Персонаж не извлекся.",
    }),
    location: Object.freeze({
      start: "Создаю локацию…",
      success: "Локация готова.",
      error: "Локация не создана.",
    }),
    summary: Object.freeze({
      unavailableOutsideChat: "Саммари недоступно вне чата",
      start: "Создаю саммари…",
      noNewMessages: "Новых сообщений для саммари пока нет.",
      success: "Саммари готово.",
      error: "Саммари не создано.",
      readyToUpdate: "саммари готово к обновлению",
      upToDate: "саммари актуально",
    }),
  }),

  settings: Object.freeze({
    profileDefaultOption: "Использовать текущий профиль",
    lorebookNotSelected: "Не выбран",
    general: Object.freeze({
      heading: "⚙️ Общие настройки",
      profileLabel: "Профиль для генерации:",
      lorebookLabel: "Лорбук для экспорта:",
      openPrompts: "⚙️ Менеджер системных промптов",
      exportData: "💾 Экспорт данных",
      importData: "📂 Импорт данных",
      dataTransferHint:
        "Резервная копия записей текущего чата и переносимых настроек расширения.",
      injectionPositionLabel: "Место вставки саммари:",
      injectionPositions: Object.freeze([
        "Main Prompt",
        "Перед Main Prompt",
        "В историю чата (Depth)",
      ]),
      injectionDepth: "Глубина:",
      injectionRole: "Роль:",
      injectionHint:
        "Настройка влияет только на саммари. Заметки, персонажи и локации остаются в Main Prompt.",
      depthHint:
        "Depth 0 — после всей истории; 1 — перед последним сообщением; 4 — перед четырьмя последними сообщениями.",
      duplicateInstallWarning:
        "⚠️ Найдено несколько копий Story Manager. Оставьте в папке third-party только одну, а резервные версии перенесите в другое место — иначе настройки и автосаммари могут срабатывать дважды.",
    }),
    notes: Object.freeze({
      sectionTitle: "📝 Заметки из сообщений",
      addButton: "➕ Добавить заметку",
      addTitle: "Создать заметку вручную",
      listHeading: "Ваши заметки:",
      empty: "Здесь будут заметки...",
    }),
    characters: Object.freeze({
      sectionTitle: "👤 Персонажи",
      contextLabel: "Контекст для генерации:",
      contextOlder: "Брать более старые сообщения",
      contextNewer: "Брать более новые сообщения",
      listHeading: "Карточки персонажей:",
      empty: "Здесь будут персонажи...",
      emptyList: "Здесь будут появляться карточки персонажей...",
    }),
    locations: Object.freeze({
      sectionTitle: "📍 Локации",
      contextLabel: "Контекст для генерации:",
      contextOlder: "Брать более старые сообщения",
      contextNewer: "Брать более новые сообщения",
      listHeading: "Список локаций:",
      empty: "Здесь будут локации...",
      emptyList: "Здесь будут появляться описания локаций...",
    }),
    summary: Object.freeze({
      sectionTitle: "📖 Саммари (Пересказ)",
      contextEnable: "💗 Использовать саммари в контексте",
      autoEnable: "🤖 Создавать саммари автоматически",
      intervalLabel: "Периодичность автосаммари (видимых сообщений):",
      autoHint:
        "Считаются только новые видимые сообщения. Последнее видимое сообщение остаётся защитным хвостом; проверка запускается после следующего сообщения от вас или бота.",
      manualTitle: "✨ Создать по диапазону",
      manualStart: "Начало (mesid)",
      manualEnd: "Конец (mesid)",
      manualCreate: "✨ Создать",
      manualInProgress: "✨ Создаю...",
      manualHint:
        "Номера совпадают с mesid в SillyTavern; границы включаются в саммари.",
      chunksHeading: "Карточки саммари:",
      selectionHint:
        "Первая галочка включает карточку в контекст; вторая отмечает её для сокращения.",
      staleHint:
        "⚠️ Красная карточка устарела: сообщения в её диапазоне отредактировали, заменили свайпом или удалили. Обычное hide/unhide на неё не влияет. Она не передаётся модели, пока вы не исправите её вручную или не пересоздадите. Сохранение через ✎ не вызывает запрос к модели.",
      empty: "Здесь будет ваше саммари",
      compress: "🗜️ Сократить саммари",
      compressTitle: "Сократить только отмеченные карточки",
      compressInProgress: "🗜️ Сокращаю...",
      rebuild: "📖 Сделать саммари с нуля",
      rebuildTitle: "Пересоздать все карточки по всей истории чата",
      importBuiltin: "📥 Подтянуть из Саммари",
      importBuiltinTitle: "Импортировать текст из встроенного Summarize",
      fillGaps: "🧩 Заполнить пробелы",
      fillGapsTitle: "Создать карточки для всех непокрытых участков истории",
      rollback: "↩️ Отменить сокращение",
      rollbackTitle: "Вернуть карточки до последнего сокращения",
    }),
    images: Object.freeze({
      sectionTitle: "🖼️ Внешние картинки",
      enable: "Включить генерацию картинок",
      hintAuto:
        "При включении после каждого нового ответа бота автоматически создаётся HTML-блок картинки (кнопка 🖼️ на сообщении — для ручного перезапуска).",
      hintSillyImages:
        'Для генерации по блоку нужно расширение <a href="https://github.com/0xl0cal/sillyimages" target="_blank" rel="noopener">SillyImages</a> (Inline Image Generation): включите «Работа с внешними блоками».',
      sendChar: "Отправлять карточку char",
      sendUser: "Отправлять карточку user",
      sendLorebook: "Отправлять лорбук по ключам",
      createPreset: "➕ Создать пресет",
      importExtBlocks: "📥 Импорт ExtBlocks",
      importExtBlocksTitle: "Импорт из ExtBlocks (односторонний)",
      noPresets: "Нет пресетов",
    }),
  }),

  dataTransfer: Object.freeze({
    exportSuccess: "Резервная копия Story Manager скачана.",
    exportFailed: "Не удалось экспортировать данные.",
    importFailed: "Не удалось импортировать данные.",
    invalidFile: "Не удалось прочитать резервную копию.",
    fileTooLarge: "Файл слишком большой (максимум 25 МБ).",
    reloadSettingsHint:
      "Промпты и общие настройки восстановлены. Перезагрузите страницу, чтобы обновить все поля панели.",
    popup: Object.freeze({
      title: "📂 Импорт Story Manager",
      modeQuestion: "Что сделать с текущими записями?",
      mergeTitle: "Объединить",
      mergeHint: "Текущие записи сохранятся, отсутствующие добавятся.",
      replaceTitle: "Полностью заменить",
      replaceHint:
        "Все данные Story Manager в текущем чате будут удалены и заменены файлом.",
      restoreSettings: "Также восстановить промпты и общие настройки",
      localSettingsHint:
        "Профиль подключения и лорбук не переносятся: они могут называться иначе на другом устройстве.",
      confirm: "✅ Импортировать",
    }),
  }),

  notes: Object.freeze({
    formLoadFailed: "Не удалось загрузить форму заметки.",
    fillTitleAndBody: "Укажите название и текст заметки",
    added: "Заметка добавлена",
    emptyList: "Здесь будут появляться созданные заметки...",
    addForm: Object.freeze({
      titleLabel: "Название:",
      titlePlaceholder: "Название заметки",
      bodyLabel: "Текст заметки:",
      bodyPlaceholder: "Содержание заметки",
    }),
    editForm: Object.freeze({
      bodyLabel: "Текст заметки:",
    }),
  }),

  summary: Object.freeze({
    aborted: "Саммари прервано",
    stopButton: "Остановить",
    stoppingButton: "Останавливаю…",
    progressPreparing: "Подготовка…",
    autoProgressTitle: "Автоматическое саммари",
    autoSuccess: "Автоматическое саммари готово.",
    autoStopped: "Автоматическое саммари остановлено. Старые карточки сохранены.",
    autoError: "Автоматическое саммари не создано.",
    noGaps: "Пробелов нет — вся история уже покрыта карточками",
    builtinNotFound:
      "Встроенное саммари не найдено. Откройте Summarize в этом чате и сохраните или сгенерируйте пересказ.",
    intervalConfirmIntro:
      "Интервал меньше, чем уже накоплено новых видимых сообщений.",
    intervalConfirmGenerate: "Сделать саммари сейчас по всем накопленным видимым сообщениям?",
    nothingToCompress: "Отметьте карточки, которые нужно сократить",
    compressStart: "Сжимаю саммари…",
    compressSuccess: "Саммари сжато.",
    compressError: "Саммари не сжато.",
    rollbackConfirm:
      "Отменить последнее сокращение и вернуть исходные выбранные карточки? Карточки, созданные позже, сохранятся.",
    rollbackSuccess: "Сокращение отменено",
    rebuildBatchTitle: "Саммари с нуля",
    rebuildError: "Пересборка саммари не завершена.",
    fillGapsBatchTitle: "Заполнить пробелы",
    fillGapsError: "Заполнение пробелов не завершено.",
    cardDeleted: "Карточка саммари удалена",
    regenerateStart: "Перегенерирую карточку…",
    regenerateSuccess: "Карточка саммари готова.",
    regenerateError: "Карточка саммари не обновлена.",
    manualStart: "Создаю саммари по выбранному диапазону…",
    manualSuccess: "Саммари по диапазону готово.",
    manualError: "Саммари по диапазону не создано.",
    editBodyLabel: "Текст саммари:",
    compressedTitlePrefix: "🗜️ Сжатое саммари",
    compressedShortTitlePrefix: "🗜️ Сжатое",
    chunkStaleTitle:
      "Исходные сообщения изменены — карточка исключена из контекста до редактирования или перегенерации",
    chunkStaleHelp:
      "Красная карточка не передаётся модели: исходные сообщения отредактировали, заменили свайпом или удалили. Hide/unhide не делает карточку устаревшей. Нажмите ↻ для пересоздания либо ✎ для локального сохранения без запроса к модели.",
    staleExcluded:
      "Исходные сообщения изменились. Устаревшие карточки исключены из контекста — перегенерируйте или исправьте их.",
    chunkUncoveredTitle: "Эти сообщения не покрыты саммари",
    compressedBadgeTitle: "Сжатое саммари",
    regenerateTitle: "Выбрать исходники и пересобрать",
    deleteTitle: "Удалить карточку",
    selectForCompressionTitle: "Выбрать эту карточку для сокращения",
    popup: Object.freeze({
      rebuild: Object.freeze({
        title: "📖 Саммари с нуля",
        text:
          "Все текущие карточки будут удалены. История чата будет пересказана заново по вашему интервалу.",
        dateHint:
          "Дата и время берутся из текста ролевой. Начальную дату ниже можно указать дополнительно, если её нет в истории.",
        dateGroupLabel: "Дата начала событий",
        day: "день",
        month: "месяц",
        year: "год",
        confirm: "✅ Сделать",
      }),
      fillGaps: Object.freeze({
        title: "🧩 Заполнить пробелы",
        text:
          "Будут созданы карточки только для участков истории без саммари. Существующие карточки останутся без изменений.",
        confirm: "✅ Заполнить",
      }),
      importBuiltin: Object.freeze({
        title: "📥 Подтянуть из Саммари",
        confirmReplace: "✅ Заменить",
        confirmImport: "✅ Подтянуть",
      }),
    }),
  }),

  images: Object.freeze({
    presetSaved: "Пресет сохранён",
    presetImported: "Импортирован пресет",
    importFailedPrefix: "Импорт:",
    deletePresetConfirm: "Удалить пресет",
    presetPopupTitle: "Пресет картинок",
    nameLabel: "Название",
    contextPairsLabel: "Пар контекста (user+bot)",
    instructionLabel: "Инструкция",
    imagenHint: "Весь HTML-блок оберните в теги <imagen>...</imagen>.",
    presetInstructionEmpty: "Инструкция пустая — добавьте текст для модели.",
    insertDefaultTemplate: "📋 Подставить полный шаблон",
    insertDefaultTemplateTitle: "Подставить полную инструкцию по умолчанию",
    messageEditHtmlLabel: "HTML картинки",
    presetCard: Object.freeze({
      toggleTitle: "Включён / выключен",
      activeTitle: "Сделать активным для этой ролевой",
      editTitle: "Редактировать",
      exportTitle: "Экспорт JSON",
      deleteTitle: "Удалить",
    }),
  }),

  prompts: Object.freeze({
    title: "Менеджер системных промптов",
    resetOne: "Промпт сброшен",
    resetAll: "Все промпты сброшены",
    resetAllButton: "🔄 Сбросить все промпты",
    blocks: Object.freeze({
      note: Object.freeze({
        label: "Промпт для заметок",
        placeholder: "Промпт для заметок",
      }),
      character: Object.freeze({
        label: "Промпт для персонажей",
        placeholder: "Промпт для персонажей",
      }),
      location: Object.freeze({
        label: "Промпт для локаций",
        placeholder: "Промпт для локаций",
      }),
      summary: Object.freeze({
        label: "Промпт для создания саммари",
        placeholder: "Промпт для создания саммари",
      }),
      summaryCompress: Object.freeze({
        label: "Промпт для сжатия саммари",
        placeholder: "Промпт для сжатия саммари",
      }),
    }),
  }),
});

/** Строки с подстановкой параметров */
export const fmt = Object.freeze({
  generationBusyTooltip(label) {
    return `идёт генерация ${label}…`;
  },
  summaryUntil(count, pending) {
    return `до саммари осталось ${count} видимых сообщений (накоплено: ${pending})`;
  },
  summaryCountdown(count) {
    return `До саммари: ${count} сообщ.`;
  },
  lorebookExportSuccess(entityName) {
    return `Успешно! "${entityName}" добавлен в лорбук.`;
  },
  generationTimeoutWait(seconds) {
    return `Превышено время ожидания ответа (${seconds} с).`;
  },
  tokenCount(count) {
    return `${count} токенов`;
  },
  cardDeleteConfirm(title) {
    const label = String(title || "").trim();
    return label ? `Удалить карточку «${label}»?` : "Удалить эту карточку?";
  },
  errorWithMessage(message) {
    return `${UI.common.error}: ${message}`;
  },
  messageContextTooltip(direction, cardLabel) {
    if (direction === "newer") {
      return `До 10 новых сообщений → карточка ${cardLabel}`;
    }
    return `До 10 старых сообщений → карточка ${cardLabel}`;
  },
  summaryIntervalConfirmBody(pending, newInterval) {
    return (
      `${UI.summary.intervalConfirmIntro}\n\n` +
      `Накоплено видимых сообщений: ${pending}. Новый интервал: ${newInterval}.\n\n` +
      UI.summary.intervalConfirmGenerate
    );
  },
  summaryRangeOverlapConfirm(ranges) {
    return (
      "Выбранный диапазон пересекается с существующими карточками: " +
      `${ranges}.\n\nПовторённые события могут дважды попасть в контекст. ` +
      "Всё равно создать новую карточку?"
    );
  },
  summaryPrecedingGapConfirm(rangeList) {
    return (
      `Перед выбранным диапазоном остались непокрытые видимые сообщения: ${rangeList}. ` +
      "Карточка будет создана без их саммари-контекста. Автоматика позднее заполнит эти участки отдельными карточками.\n\n" +
      "Всё равно создать карточку сейчас?"
    );
  },
  dataImportStats(stats) {
    const legacy = stats.hasLegacySummary ? ", старое саммари: есть" : "";
    return (
      `В файле: заметки — ${stats.notes}, персонажи — ${stats.characters}, ` +
      `локации — ${stats.locations}, карточки саммари — ${stats.summaryChunks}${legacy}.`
    );
  },
  dataImportSuccess(stats) {
    return (
      `Импорт завершён: заметки — ${stats.notes}, персонажи — ${stats.characters}, ` +
      `локации — ${stats.locations}, карточки саммари — ${stats.summaryChunks}.`
    );
  },
  summaryProgressTitle(done, total) {
    return `Прогресс — ${done}/${total}`;
  },
  summaryProgressAttempt(attempt, maxAttempts, countdown) {
    return `Попытка связи ${attempt}/${maxAttempts} · осталось ${countdown}`;
  },
  summaryStoppedPreserved(count) {
    return count > 0
      ? `Генерация остановлена. Готовые карточки сохранены: ${count}.`
      : "Генерация остановлена до создания новых карточек.";
  },
  summaryRebuildRequestInfo(requestCount, requestWord, interval, chatLength) {
    return (
      `Будет сделано <b>${requestCount}</b> ${requestWord} к нейросети.<br>` +
      `Интервал: ${interval} сообщений · в чате: ${chatLength}.`
    );
  },
  summaryFillGapsRequestInfo(gapCount, gapWord, requestCount, requestWord, interval) {
    return (
      `Найдено <b>${gapCount}</b> ${gapWord} · ` +
      `<b>${requestCount}</b> ${requestWord} к нейросети.<br>` +
      `Интервал: ${interval} сообщений.`
    );
  },
  summaryFillGapsRanges(parts) {
    return `Сообщения: ${parts.join(", ")}`;
  },
  summaryFillGapsRangesMore(hiddenCount) {
    return `… ещё ${hiddenCount}`;
  },
  summaryRebuildSuccessOne() {
    return "Саммари пересобрано с нуля (1 карточка)";
  },
  summaryRebuildSuccessMany(count) {
    return `Саммари пересобрано с нуля (${count} карточек)`;
  },
  summaryFillGapsSuccess(count, cardWord) {
    return `Добавлено ${count} ${cardWord} саммари.`;
  },
  summaryImportBuiltinUpdate(rangeLabel) {
    return `Карточка ${rangeLabel} обновлена из Summarize`;
  },
  summaryImportBuiltinCreate(rangeLabel) {
    return `Карточка ${rangeLabel} создана из Summarize`;
  },
  summaryImportBuiltinReplaceDesc(rangeLabel) {
    return (
      `Карточка ${rangeLabel} уже есть. ` +
      "Её текст будет заменён из встроенного Summarize."
    );
  },
  summaryImportBuiltinCreateWithExistingDesc(rangeLabel) {
    return (
      `Будет создана карточка ${rangeLabel} из встроенного Summarize. ` +
      "Существующие карточки останутся без изменений."
    );
  },
  summaryImportBuiltinCreateDesc(rangeLabel) {
    return `Будет создана карточка ${rangeLabel} из встроенного Summarize.`;
  },
  imagePresetImported(name) {
    return `Импортирован пресет «${name}»`;
  },
  imagePresetDeleteConfirm(name) {
    return `Удалить пресет «${name}»?`;
  },
  pluralRu(count, one, few, many) {
    const n = Math.abs(Number(count)) || 0;
    const mod10 = n % 10;
    const mod100 = n % 100;

    if (mod10 === 1 && mod100 !== 11) {
      return one;
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
      return few;
    }
    return many;
  },
  requestCountWord(count) {
    return fmt.pluralRu(count, "запрос", "запроса", "запросов");
  },
  gapCountWord(count) {
    return fmt.pluralRu(count, "пробел", "пробела", "пробелов");
  },
  cardCountWord(count) {
    return fmt.pluralRu(count, "карточка", "карточки", "карточек");
  },
});
