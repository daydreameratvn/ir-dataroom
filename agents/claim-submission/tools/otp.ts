import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../../shared/graphql-client.ts";

export const sendOtpTool: AgentTool = {
  name: "sendOtp",
  label: "Send OTP",
  description: "Send OTP code to user's email or phone for claim verification",
  parameters: Type.Object({
    email: Type.Optional(Type.String({ description: "Email address to send OTP to" })),
    phone: Type.Optional(Type.String({ description: "Phone number to send OTP to" })),
  }),
  execute: async (toolCallId, { email, phone }) => {
    const { data } = await getClient().mutate({
      mutation: graphql(`
        mutation SendOtp($email: String, $phone: String) {
          createOtpForAnyRecipient(email: $email, phone: $phone) {
            success
            message
            data { expiresAt }
          }
        }
      `),
      variables: { email, phone },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data?.createOtpForAnyRecipient) }],
      details: { email, phone },
    };
  },
};
