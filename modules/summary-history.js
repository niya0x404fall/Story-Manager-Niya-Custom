import { getContext } from "../../../../extensions.js";
import { applySummaryHistoryMutation } from "./summary-chunks.js";
import {
  createSummaryMessageSnapshot,
  diffSummaryMessageSnapshots,
} from "./summary-integrity.js";

let snapshotChatMetadata = null;
let messageSnapshot = [];

/** Начать наблюдение заново при открытии или полном обновлении чата. */
export function resetSummaryHistorySnapshot() {
  const context = getContext();
  snapshotChatMetadata = context?.chatMetadata ?? null;
  messageSnapshot = createSummaryMessageSnapshot(context?.chat);
}

/**
 * Сверить текущую историю с последним снимком и обезвредить устаревшие карточки.
 * Добавленные в конец сообщения не инвалидируют существующее саммари.
 */
export function reconcileSummaryHistory() {
  const context = getContext();
  if (!context?.chatMetadata || !Array.isArray(context.chat)) {
    snapshotChatMetadata = null;
    messageSnapshot = [];
    return {
      changed: false,
      invalidatedChunkIds: [],
      deletedMessageIds: [],
      changedMessageIds: [],
    };
  }

  const currentSnapshot = createSummaryMessageSnapshot(context.chat);
  if (snapshotChatMetadata !== context.chatMetadata) {
    snapshotChatMetadata = context.chatMetadata;
    messageSnapshot = currentSnapshot;
    return {
      changed: false,
      invalidatedChunkIds: [],
      deletedMessageIds: [],
      changedMessageIds: [],
    };
  }

  const diff = diffSummaryMessageSnapshots(messageSnapshot, currentSnapshot);
  messageSnapshot = currentSnapshot;

  return applySummaryHistoryMutation({
    deletedMessageIds: diff.deletedMessageIds,
    changedMessageIds: diff.changedMessageIds,
  });
}
