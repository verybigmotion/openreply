export const REVEAL_LOG_PREFIX = "reveal:";
export const DIRECT_MESSAGE_LOG_PREFIX = "dm:";

export function revealLogId(userId: string) {
  return `${REVEAL_LOG_PREFIX}${userId}`;
}

export function directMessageLogId(messageId: string) {
  return `${DIRECT_MESSAGE_LOG_PREFIX}${messageId}`;
}

export function sentTo(userId: string) {
  return { OR: [{ commenterId: userId }, { recipientId: userId }] };
}
