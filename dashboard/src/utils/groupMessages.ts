import type { FilteredMessage, MessageGroup } from '../types';

/**
 * Groups consecutive messages with the same role within a time window.
 * @param messages - Array of FilteredMessage to group
 * @param windowMs - Max time gap (ms) between messages in the same group (default: 60s)
 */
export function groupMessages(
  messages: FilteredMessage[],
  windowMs = 60_000,
): MessageGroup[] {
  if (messages.length === 0) return [];

  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;

  for (const message of messages) {
    const msgTime = message.timestamp ? new Date(message.timestamp).getTime() : null;

    if (currentGroup === null) {
      // Start first group
      currentGroup = createGroup(message);
    } else {
      const lastMsg = currentGroup.messages[currentGroup.messages.length - 1];
      const lastTime = lastMsg.timestamp ? new Date(lastMsg.timestamp).getTime() : null;

      const sameRole = message.role === currentGroup.speakerRole;
      const withinWindow =
        msgTime === null ||
        lastTime === null ||
        Math.abs(msgTime - lastTime) <= windowMs;

      if (sameRole && withinWindow) {
        // Extend current group
        currentGroup.messages.push(message);
        currentGroup.endTime = message.timestamp ?? currentGroup.endTime;
      } else {
        // Start a new group
        groups.push(currentGroup);
        currentGroup = createGroup(message);
      }
    }
  }

  if (currentGroup !== null) {
    groups.push(currentGroup);
  }

  return groups;
}

function createGroup(message: FilteredMessage): MessageGroup {
  const roleName = message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return {
    speakerId: message.role,
    speakerRole: message.role,
    speakerName: roleName,
    messages: [message],
    startTime: message.timestamp,
    endTime: message.timestamp,
  };
}