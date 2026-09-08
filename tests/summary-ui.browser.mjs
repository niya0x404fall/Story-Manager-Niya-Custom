// Дополнительный локальный UI-тест: Playwright + jquery из вашей копии SillyTavern.
// ST_REFERENCE_ROOT=/path/to/SillyTavern node tests/summary-ui.browser.mjs
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", {
  paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()],
}));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prefix = "/public/scripts/extensions/third-party/Story-Manager/";
const jquery = await readFile(path.join(process.env.ST_REFERENCE_ROOT, "public/lib/jquery-3.5.1.min.js"), "utf8");
const output = process.env.ST_UI_TEST_OUTPUT;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const mocks = {
  "/public/scripts/extensions.js": "export const getContext=()=>window.testContext; export const extension_settings={};",
  "/public/script.js": "export function saveSettingsDebounced(){}",
  "/public/scripts/tokenizers.js": "export const getTokenCountAsync=async text=>text.length;",
  "/public/scripts/reasoning.js": "export const removeReasoningFromString=text=>text;",
  "/public/scripts/utils.js": "export const createTimeout=()=>new Promise(()=>{});",
  [prefix + "modules/profiles.js"]: "export async function generateQuietWithProfile(options){window.calls.push({prompt:options.prompt,systemPrompt:options.systemPrompt}); return '[10:24] Updated summary.';}",
  [prefix + "modules/storage.js"]: "export function saveChatMetadata(){}",
  [prefix + "modules/injection.js"]: "export function injectAllEntities(){window.injections++;}",
  [prefix + "modules/lore-cards.js"]: "export const normalizeLoreCardEntity=e=>e;",
  [prefix + "modules/buttons.js"]: "export function updateSummaryIndicators(){}",
};

try {
  // Все URL обслуживаются из файлов или заглушек; внешняя сеть запрещена.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://story-manager.test") throw new Error(`Unexpected network: ${url}`);
    const pathname = url.pathname;
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${prefix}style.css"><style>:root{--SmartThemeBodyColor:#e5dbe7;--SmartThemeBlurTintColor:#27242c;--SmartThemeBorderColor:#a389a6;--warning:#e9b951;--mainFontFamily:Arial;}body{background:#201d25;color:#e5dbe7;margin:10px;font-family:Arial;}button{font:inherit;color:inherit;background:#37303d;border:1px solid #9e809d;border-radius:6px}.story-summary-chunk-item{margin:12px 0}i{font-style:normal}i.fa-rotate:before{content:'↻'}i.fa-pencil:before{content:'✎'}</style><script src="/jquery.js"></script></head><body><p class="story-summary-stale-hint story-manager-hidden">Карточка устарела</p><div id="story-summary-chunks-container"></div><p id="story-summary-token-count"></p></body></html>` });
    if (pathname === "/jquery.js") return route.fulfill({ contentType: "text/javascript", body: jquery });
    if (mocks[pathname]) return route.fulfill({ contentType: "text/javascript", body: mocks[pathname] });
    if (!pathname.startsWith(prefix)) throw new Error(`Unexpected request: ${pathname}`);
    const relative = pathname.slice(prefix.length);
    const body = await readFile(path.join(root, relative));
    return route.fulfill({ body, contentType: relative.endsWith(".js") ? "text/javascript" : relative.endsWith(".css") ? "text/css" : "text/html" });
  });
  await page.goto("http://story-manager.test");
  await page.evaluate(async (prefix) => {
    window.calls = []; window.injections = 0; window.notices = [];
    window.toastr = Object.fromEntries(["info", "error", "warning", "success"].map((key) => [key, (text) => window.notices.push({ key, text })]));
    window.testContext = { chat: [0,1,2].map((id) => ({name:"Character",mes:`EVENT_${id}`,send_date:id+100,is_system:id===1})), chatMetadata:{} };
    window.SillyTavern = { getContext: () => window.testContext };
    const templates = await import(prefix + "modules/templates.js");
    if (!await templates.loadTemplates()) throw new Error("Templates not loaded");
    const sources = await import(prefix + "modules/summary-sources.js");
    const selection = sources.captureSelectedSummarySources(sources.selectSummarySources(window.testContext.chat, {startMes:0,endMes:2}, "visible"));
    window.testContext.chatMetadata["story-manager-summary-chunks"] = [{id:10,type:"chunk",startMes:0,endMes:2,text:"Correct saved summary",contextValid:true,enabled:true,...selection}];
    window.renderList = (await import(prefix + "modules/ui/summary-list.js")).renderSummary;
    await window.renderList();
  }, prefix);

  const arrow = page.locator(".story-summary-chunk-regenerate-btn");
  // Иконки FontAwesome на странице теста не загружаются из сети.
  await arrow.evaluate((element) => { element.textContent = "↻"; });
  await arrow.click();
  assert.equal(await page.locator(".story-summary-source-choice").count(), 2);
  assert.equal(await page.evaluate(() => window.calls.length), 0);
  await page.locator(".story-summary-source-cancel").click();
  assert.equal(await page.evaluate(() => window.calls.length), 0);
  await arrow.click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".story-summary-source-popup").count(), 0);
  await arrow.click();
  await page.locator(".story-manager-prompts-popup-backdrop").click({ position: { x: 2, y: 2 } });
  assert.equal(await page.evaluate(() => window.calls.length), 0);

  await page.evaluate(() => { window.testContext.chat[0].is_system = true; });
  await arrow.click();
  assert.match(await page.locator("[data-source-mode=original]").innerText(), /из них скрытых: 1/);
  const box = await page.locator(".story-manager-summary-confirm-panel").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "source-choice-mobile.png") });
  }
  await page.locator("[data-source-mode=original]").click();
  await page.waitForFunction(() => window.calls.length === 1 && !document.querySelector(".fa-spin"));
  assert.match(await page.evaluate(() => window.calls[0].prompt), /EVENT_0/);
  assert.doesNotMatch(await page.evaluate(() => window.calls[0].prompt), /EVENT_1/);

  // Карандаш без изменения текста возвращает красную карточку без AI.
  await page.evaluate(async () => {
    window.testContext.chatMetadata["story-manager-summary-chunks"].find(c => c.id === 10).contextValid = false;
    await window.renderList();
  });
  const edit = page.locator(".story-summary-chunk-edit-btn");
  await edit.evaluate((element) => { element.textContent = "✎"; });
  await edit.click();
  await page.locator(".story-summary-chunk-save-btn").click();
  await page.waitForFunction(() => !document.querySelector(".story-summary-chunk-stale"));
  assert.equal(await page.evaluate(() => window.calls.length), 1);
  assert.deepEqual(await page.evaluate(() => window.testContext.chatMetadata["story-manager-summary-chunks"].find(c => c.id===10).sourceMessageStates.map(s=>s.messageId)), [0,2]);

  // Старая карточка предлагает явные альтернативы, отмена сохраняет текст.
  await page.evaluate(async () => {
    const c = window.testContext.chatMetadata["story-manager-summary-chunks"].find(c=>c.id===10);
    delete c.sourceSelectionVersion; delete c.sourceMessageStates;
    await window.renderList();
  });
  await arrow.evaluate((element) => { element.textContent = "↻"; });
  await arrow.click();
  assert.equal(await page.locator("[data-source-mode=original]").count(), 0);
  assert.equal(await page.locator("[data-source-mode=all]").count(), 1);
  assert.equal(await page.locator(".story-summary-source-legacy").isVisible(), true);
  await page.locator(".story-summary-source-cancel").click();
  assert.equal(await page.evaluate(() => window.calls.length), 1);
  assert.deepEqual(errors, []);
  console.log("UI PASS: mobile choice, cancel/Escape/backdrop without requests, original source payload, free pencil, legacy choices.");
} finally {
  await browser.close();
}
