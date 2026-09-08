import {
  initButtons,
  updateSummaryIndicators,
} from "../modules/buttons.js";
import { injectAllEntities } from "../modules/injection.js";
import {
  resetSummaryChatLengthBaseline,
  syncSummaryStateWithChat,
} from "../modules/summary-chunks.js";
import { resetSummaryHistorySnapshot } from "../modules/summary-history.js";
import {
  initUI,
  refreshChatBoundUI,
  renderCharacters,
  renderLocations,
  renderNotes,
  renderSummary,
} from "../modules/ui.js";
export { initUI };

export async function refreshFromChatState() {
  const context = SillyTavern.getContext();

  if (!context?.chatMetadata) {
    return;
  }

  syncSummaryStateWithChat(context.chat.length, { auditSources: true });
  resetSummaryChatLengthBaseline(context.chat.length);
  resetSummaryHistorySnapshot();
  refreshChatBoundUI();
  initButtons();
  renderNotes();
  renderCharacters();
  renderLocations();
  await renderSummary();

  injectAllEntities();
  updateSummaryIndicators();
}
