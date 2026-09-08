import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Реальные модули расширения; ST и единственная граница AI заменены локально. */
export function createExtensionHarness({ chat = [], chunks = [], settings = {} } = {}) {
  const state = {
    context: { chat, chatMetadata: { "story-manager-summary-chunks": chunks } },
    calls: [], saves: 0,
    reply: async () => "[10:24] A test event occurred.",
    extensionSettings: { "story-manager": settings },
  };
  const sandbox = vm.createContext({
    console, AbortController, DOMException, setTimeout, clearTimeout,
    // Тест не имеет доступа к сети даже при случайно неверном импорте.
    fetch: () => { throw new Error("Network forbidden in tests"); },
  });
  const mocks = new Map([
    ["modules/profiles.js", { generateQuietWithProfile: async (options) => {
      state.calls.push(options);
      return state.reply(options);
    } }],
    ["modules/storage.js", { saveChatMetadata: () => { state.saves++; } }],
    ["modules/lore-cards.js", { normalizeLoreCardEntity: (entity) => entity }],
    ["modules/image-defaults.js", { createDefaultImagePreset: () => ({}) }],
  ]);
  const external = {
    "extensions.js": { getContext: () => state.context, extension_settings: state.extensionSettings },
    "script.js": { saveSettingsDebounced: () => {} },
    "reasoning.js": { removeReasoningFromString: (value) => value },
    "utils.js": { createTimeout: () => new Promise(() => {}) },
  };
  const cache = new Map();
  function moduleAt(url) {
    if (cache.has(url)) return cache.get(url);
    const filename = fileURLToPath(url);
    const relative = path.relative(root, filename).split(path.sep).join("/");
    const exports = relative.startsWith("../") ? external[path.basename(filename)] : mocks.get(relative);
    if (relative.startsWith("../") && !exports) throw new Error(`Unexpected ST import: ${relative}`);
    const module = exports
      ? new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context: sandbox, identifier: url })
      : new vm.SourceTextModule(readFileSync(filename, "utf8"), {
        context: sandbox, identifier: url,
        initializeImportMeta: (meta) => { meta.url = url; },
      });
    cache.set(url, module);
    return module;
  }
  state.load = async (relative) => {
    const module = moduleAt(pathToFileURL(path.join(root, relative)).href);
    if (module.status === "unlinked") {
      await module.link((specifier, parent) => moduleAt(new URL(specifier, parent.identifier).href));
    }
    if (module.status === "linked") await module.evaluate();
    return module.namespace;
  };
  state.cards = () => state.context.chatMetadata["story-manager-summary-chunks"].filter((c) => c.type !== "placeholder");
  return state;
}

export const plain = (value) => JSON.parse(JSON.stringify(value));
export const messages = (count) => Array.from({ length: count }, (_, id) => ({
  name: "Character", mes: `EVENT_${id}`, send_date: `REAL_TIMESTAMP_${id}`,
  is_user: false, is_system: false,
}));
export function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
