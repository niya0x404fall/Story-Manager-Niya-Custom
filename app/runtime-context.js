export { canPersistChatState } from "../modules/storage.js";

export function hasActiveChat() {
  const context = SillyTavern.getContext();
  return Boolean(context?.chatMetadata);
}
