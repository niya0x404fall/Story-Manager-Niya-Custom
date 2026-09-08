import { bindChatEvents } from "./chat-events.js";
import { bindSummaryEvents } from "./summary-events.js";

let eventsBound = false;

export function registerEvents(eventSource, eventTypes, dependencies) {
  if (eventsBound) {
    return;
  }

  eventsBound = true;

  bindChatEvents(eventSource, eventTypes, dependencies);
  bindSummaryEvents(eventSource, eventTypes);
}
