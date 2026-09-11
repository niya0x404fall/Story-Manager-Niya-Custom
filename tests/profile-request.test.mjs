import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadProfiles({ profile, sendRequest }) {
  let legacyCalls = 0;
  const settings = {
    useDirectProfileRequests: true,
    connectionProfileId: profile.id,
  };
  const sandbox = vm.createContext({
    console,
    DOMException,
    Event,
    document: { getElementById: () => null },
    setTimeout,
    SillyTavern: { getContext: () => ({}) },
  });
  const mocks = new Map([
    ["extensions.js", {
      extension_settings: {
        connectionManager: { profiles: [profile], selectedProfile: "" },
      },
    }],
    ["script.js", {
      eventSource: { on: () => {}, removeListener: () => {} },
      event_types: { CONNECTION_PROFILE_LOADED: "loaded" },
      generateRaw: async () => {
        legacyCalls += 1;
        return "legacy";
      },
    }],
    ["shared.js", {
      ConnectionManagerRequestService: { sendRequest },
    }],
    ["settings.js", { getSettings: () => settings }],
  ]);
  const cache = new Map();

  function moduleAt(url) {
    if (cache.has(url)) return cache.get(url);
    const filename = fileURLToPath(url);
    const external = mocks.get(path.basename(filename));
    const module = external
      ? new vm.SyntheticModule(Object.keys(external), function () {
        for (const [key, value] of Object.entries(external)) this.setExport(key, value);
      }, { context: sandbox, identifier: url })
      : new vm.SourceTextModule(readFileSync(filename, "utf8"), {
        context: sandbox,
        identifier: url,
      });
    cache.set(url, module);
    return module;
  }

  const entry = moduleAt(pathToFileURL(path.join(root, "modules/profiles.js")).href);
  await entry.link((specifier, parent) => moduleAt(new URL(specifier, parent.identifier).href));
  await entry.evaluate();
  return { profiles: entry.namespace, legacyCalls: () => legacyCalls };
}

test("Custom-профиль использует штатный streaming ST без fallback", async () => {
  const calls = [];
  const h = await loadProfiles({
    profile: { id: "link", api: "custom", model: "glm", mode: "cc" },
    sendRequest: async (...args) => {
      calls.push(args);
      return async function* stream() {
        yield { text: "Summary " };
        yield { text: "Summary ready." };
      };
    },
  });

  const result = await h.profiles.generateQuietWithProfile({
    prompt: "Summarize",
    systemPrompt: "Only facts",
    responseLength: 500,
  });

  assert.equal(result, "Summary ready.");
  assert.equal(calls.length, 1);
  assert.equal(h.legacyCalls(), 0);
  assert.equal(calls[0][0], "link");
  assert.equal(calls[0][2], 500);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][3])), {
    stream: true,
    signal: null,
    extractData: true,
    includePreset: false,
    includeInstruct: false,
  });
});

test("ошибка профиля возвращается без второй платной попытки", async () => {
  let serviceCalls = 0;
  const h = await loadProfiles({
    profile: { id: "link", api: "custom", model: "glm", mode: "cc" },
    sendRequest: async () => {
      serviceCalls += 1;
      throw new Error("API request failed", {
        cause: new Error("HTTP 524: A Timeout Occurred"),
      });
    },
  });

  await assert.rejects(
    h.profiles.generateQuietWithProfile({ prompt: "Summarize" }),
    /524/,
  );
  assert.equal(serviceCalls, 1);
  assert.equal(h.legacyCalls(), 0);
});

test("обычный Chat Completion профиль остаётся non-streaming", async () => {
  const calls = [];
  const h = await loadProfiles({
    profile: { id: "openai", api: "openai", model: "gpt", mode: "cc" },
    sendRequest: async (...args) => {
      calls.push(args);
      return { content: "Ready" };
    },
  });

  assert.equal(
    await h.profiles.generateQuietWithProfile({ prompt: "Summarize" }),
    "Ready",
  );
  assert.equal(calls[0][3].stream, false);
  assert.equal(calls.length, 1);
});
