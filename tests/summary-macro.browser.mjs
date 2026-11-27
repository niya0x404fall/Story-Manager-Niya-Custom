// ST_REFERENCE_ROOT=/path/to/SillyTavern node tests/summary-macro.browser.mjs
// Проверяет настоящие настройки и вставку расширения в браузере; API ST заменён локально.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", {
  paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()],
}));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prefix = "/public/scripts/extensions/third-party/Story-Manager-Niya-Custom/";
const jquery = await readFile(path.join(process.env.ST_REFERENCE_ROOT, "public/lib/jquery-3.5.1.min.js"), "utf8");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ST_CHROMIUM_EXECUTABLE ? { executablePath: process.env.ST_CHROMIUM_EXECUTABLE } : {}),
});
const errors = [];
const mocks = {
  "/public/scripts/extensions.js": "export const getContext=()=>window.testContext; export const extension_settings=window.extensionSettings;",
  "/public/script.js": `export function saveSettingsDebounced(){}
    export const extension_prompt_roles={SYSTEM:0,USER:1,ASSISTANT:2};
    export const extension_prompt_types={IN_PROMPT:0,IN_CHAT:1,BEFORE_PROMPT:2};
    export function setExtensionPrompt(key,text){window.prompts[key]=text;}`,
  "/public/scripts/tokenizers.js": "export const getTokenCountAsync=async text=>text.length;",
  "/public/scripts/reasoning.js": "export const removeReasoningFromString=text=>text;",
  "/public/scripts/utils.js": "export const createTimeout=()=>new Promise(()=>{});",
  "/public/scripts/popup.js": "export const Popup={show:{confirm:async()=>false}};",
  [prefix + "modules/storage.js"]: "export function saveChatMetadata(){}",
  [prefix + "modules/lore-cards.js"]: "export const normalizeLoreCardEntity=e=>e; export const getLoreCardBody=e=>e.body;",
  [prefix + "modules/ui/summary-list.js"]: "export async function renderSummary(){}",
  [prefix + "modules/ui/summary-rebuild-popup.js"]: "export function showSummaryRebuildPopup(){}",
  [prefix + "modules/ui/summary-fill-gaps-popup.js"]: "export function showSummaryFillGapsPopup(){}",
  [prefix + "modules/ui/summary-import-popup.js"]: "export function showSummaryImportBuiltinPopup(){}",
  [prefix + "modules/buttons.js"]: "export function updateSummaryIndicators(){}",
  [prefix + "app/summary-auto.js"]: "export function stopAutomaticSummaryGeneration(){}",
};

try {
  for (const supported of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://story-manager.test") throw new Error(`Unexpected network: ${url}`);
      const pathname = url.pathname;
      if (pathname === "/") return route.fulfill({ contentType: "text/html", body:
        `<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="${prefix}style.css"><script src="/jquery.js"></script>
        <style>body{margin:10px;color:#ddd;background:#222;font:14px Arial}.text_pole{box-sizing:border-box;max-width:100%}.inline-drawer-content{display:block}</style>
        </head><body></body></html>` });
      if (pathname === "/jquery.js") return route.fulfill({ contentType: "text/javascript", body: jquery });
      if (mocks[pathname]) return route.fulfill({ contentType: "text/javascript", body: mocks[pathname] });
      if (!pathname.startsWith(prefix)) throw new Error(`Unexpected request: ${pathname}`);
      const relative = pathname.slice(prefix.length);
      return route.fulfill({ body: await readFile(path.join(root, relative)),
        contentType: relative.endsWith(".js") ? "text/javascript" : relative.endsWith(".css") ? "text/css" : "text/html" });
    });
    await page.goto("http://story-manager.test");
    await page.evaluate(async ({ prefix, supported }) => {
      window.prompts = {}; window.handlers = {};
      window.extensionSettings = { "story-manager": {
        summaryEnabled: true, summaryAutoEnabled: false,
        summaryInjectionPosition: supported ? "main_prompt" : "preset_macro",
      } };
      window.testContext = { chat: [], chatMetadata: { "story-manager-summary-chunks": [
        { id: 1, type: "chunk", startMes: 0, endMes: 1, text: "BROWSER_MEMORY", enabled: true },
      ] } };
      if (supported) window.testContext.registerMacro = (name, handler) => { window.handlers[name] = handler; };
      window.SillyTavern = { getContext: () => window.testContext };
      window.toastr = Object.fromEntries(["info", "error", "warning", "success"].map(key => [key, () => {}]));
      const templates = await import(prefix + "modules/templates.js");
      if (!await templates.loadTemplates()) throw new Error("Templates not loaded");
      const $panel = templates.createFromTemplate("story-manager-settings");
      document.body.append($panel[0]);
      const injection = await import(prefix + "modules/injection.js");
      injection.registerSummaryMacro();
      (await import(prefix + "modules/ui/apply-ui-text.js")).applySettingsPanelText($panel);
      (await import(prefix + "modules/ui/summary-settings.js")).initSummaryUI($panel);
      injection.injectAllEntities();
    }, { prefix, supported });

    const position = page.locator("#story_manager_summary_injection_position");
    if (supported) {
      assert.equal(await page.locator(".story-summary-macro-hint").isVisible(), false);
      await position.selectOption("preset_macro");
      assert.equal(await page.locator(".story-summary-role-field").isVisible(), false);
      assert.equal(await page.locator(".story-summary-depth-field").isVisible(), false);
      assert.equal(await page.locator(".story-summary-macro-hint").isVisible(), true);
      assert.match(await page.locator(".story-summary-macro-hint").innerText(), /\{\{story_manager_summary\}\}/);
      assert.equal(await page.evaluate(() => window.prompts["story-manager-summary"]), "");
      assert.match(await page.evaluate(() => window.handlers.story_manager_summary()), /BROWSER_MEMORY/);
      const hint = await page.locator(".story-summary-macro-hint").boundingBox();
      assert.ok(hint.x >= 0 && hint.x + hint.width <= 390);
      await page.locator("#story_summary_enabled").uncheck();
      assert.equal(await page.evaluate(() => window.handlers.story_manager_summary()), "");
      await page.locator("#story_summary_enabled").check();
      await position.selectOption("chat_depth");
      assert.equal(await page.locator(".story-summary-role-field").isVisible(), true);
      assert.equal(await page.locator(".story-summary-depth-field").isVisible(), true);
      assert.equal(await page.locator(".story-summary-macro-hint").isVisible(), false);
      assert.equal(await page.evaluate(() => window.handlers.story_manager_summary()), "");
      assert.match(await page.evaluate(() => window.prompts["story-manager-summary"]), /BROWSER_MEMORY/);
    } else {
      assert.equal(await position.locator('option[value="preset_macro"]').isDisabled(), true);
      assert.equal(await page.locator(".story-summary-macro-unavailable").isVisible(), true);
      await page.evaluate(async prefix => {
        (await import(prefix + "modules/ui/summary-settings.js"))
          .refreshSummarySettingsUI($("#story_manager_settings"));
      }, prefix);
      assert.equal(await page.locator(".story-summary-macro-unavailable").isVisible(), true);
      assert.match(await page.evaluate(() => window.prompts["story-manager-summary"]), /BROWSER_MEMORY/);
      await position.selectOption("main_prompt");
      assert.equal(await page.locator(".story-summary-macro-unavailable").isVisible(), false);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log("UI PASS: mobile macro controls, exact macro hint, mode switching, disabled memory, unavailable API fallback.");
} finally {
  await browser.close();
}
