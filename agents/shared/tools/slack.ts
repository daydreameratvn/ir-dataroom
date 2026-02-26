import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { WebClient } from "@slack/web-api";

const slackClient = new WebClient(process.env.SLACK_TOKEN);

export const sendSlackMessageTool: AgentTool = {
  name: "sendSlackMessage",
  label: "Send Slack Message",
  description: "Send a message to a Slack channel",
  parameters: Type.Object({
    channel: Type.String({ description: "The Slack channel ID to send the message to (e.g., C0A9MDAUR6Y)" }),
    text: Type.String({ description: "The message text to send" }),
    thread_ts: Type.Optional(Type.String({ description: "The timestamp of the parent message to reply in a thread" })),
  }),
  execute: async (toolCallId, { channel, text, thread_ts }) => {
    const result = await slackClient.chat.postMessage({ channel, text, thread_ts });
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: result.ok, ts: result.ts, channel: result.channel }) }],
      details: { channel },
    };
  },
};

export const addSlackReactionTool: AgentTool = {
  name: "addSlackReaction",
  label: "Add Slack Reaction",
  description: "Add a reaction emoji to a Slack message",
  parameters: Type.Object({
    channel: Type.String({ description: "The Slack channel ID where the message is" }),
    timestamp: Type.String({ description: "The timestamp of the message to react to" }),
    emoji: Type.String({ description: "The emoji name without colons (e.g., 'thumbsup', 'white_check_mark')" }),
  }),
  execute: async (toolCallId, { channel, timestamp, emoji }) => {
    const result = await slackClient.reactions.add({ channel, timestamp, name: emoji });
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: result.ok }) }],
      details: { channel, emoji },
    };
  },
};
