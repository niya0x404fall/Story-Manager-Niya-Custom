import { refreshFromChatState } from "./app/chat-refresh.js";
import { registerEvents } from "./events/register-events.js";
import { initButtons } from "./modules/buttons.js";
import { initSettings } from "./modules/settings.js";
import { initUI } from "./modules/ui.js";

let initialized = false;
let initStarted = false;
let bootstrapStarted = false;
let initScheduled = false;

async function initializeExtension() {
  if (initialized || initStarted) {
    return;
  }

  initStarted = true;

  try {
    initSettings();
    await initUI();
    initButtons();

    const { eventSource, event_types } = await import("../../../../script.js");
    registerEvents(eventSource, event_types, { refreshFromChatState });

    await refreshFromChatState();
    initialized = true;
  } catch (err) {
    initStarted = false;
    console.error("Story Manager: Critical error during initialization!", err);
  }
}

export async function bootstrapExtension() {
  if (bootstrapStarted) {
    return;
  }

  bootstrapStarted = true;

  try {
    const { eventSource, event_types } = await import("../../../../script.js");

    if (!eventSource?.on || !event_types) {
      throw new Error("SillyTavern event bus is not available");
    }

    const scheduleInit = () => {
      if (initScheduled || initialized || initStarted) {
        return;
      }

      initScheduled = true;
      setTimeout(() => {
        void initializeExtension();
      }, 0);
    };

    eventSource.on(event_types.APP_READY, scheduleInit);
    eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, scheduleInit);

    if (typeof SillyTavern !== "undefined" && SillyTavern.getContext?.()) {
      scheduleInit();
    }
  } catch (err) {
    bootstrapStarted = false;
    console.error("Story Manager: Failed to bootstrap extension", err);
  }
}
