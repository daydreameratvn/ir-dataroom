import { gql } from "@apollo/client/core";
import { getClient } from "./graphql-client.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatType = "assessment" | "compliance" | "scourge";

export interface Chat {
  id: string;
  title: string;
  type: ChatType;
  claimCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: string;
  parts: unknown[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mutations & Queries
// ---------------------------------------------------------------------------

const INSERT_CHAT = gql`
  mutation InsertLairChat($object: lair_chats_insert_input!) {
    insert_lair_chats_one(object: $object) {
      id
    }
  }
`;

const LOAD_CHAT = gql`
  query LoadLairChat($id: uuid!) {
    lair_chats_by_pk(id: $id) {
      id
      title
      type
      claim_code
      created_at
      updated_at
    }
  }
`;

const LOAD_CHAT_MESSAGES = gql`
  query LoadLairChatMessages($chatId: uuid!) {
    lair_messages(
      where: { chat_id: { _eq: $chatId }, deleted_at: { _is_null: true } }
      order_by: { created_at: asc }
    ) {
      id
      chat_id
      role
      parts
      created_at
    }
  }
`;

const UPSERT_MESSAGE = gql`
  mutation UpsertLairMessage($object: lair_messages_insert_input!) {
    insert_lair_messages_one(
      object: $object
      on_conflict: {
        constraint: lair_messages_pkey
        update_columns: [parts, updated_at]
      }
    ) {
      id
    }
  }
`;

const LIST_CHATS = gql`
  query ListLairChats($where: lair_chats_bool_exp!, $limit: Int!, $offset: Int!) {
    lair_chats(
      where: $where
      order_by: { created_at: desc }
      limit: $limit
      offset: $offset
    ) {
      id
      title
      type
      claim_code
      created_at
      updated_at
    }
    lair_chats_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function createChat(params: {
  title: string;
  type: ChatType;
  claimCode: string;
}): Promise<string> {
  const client = getClient();
  const { data } = await client.mutate({
    mutation: INSERT_CHAT,
    variables: {
      object: {
        title: params.title,
        type: params.type,
        claim_code: params.claimCode,
      },
    },
  });
  return data.insert_lair_chats_one.id;
}

export async function loadChat(chatId: string): Promise<{
  chat: Chat;
  messages: ChatMessage[];
} | null> {
  const client = getClient();

  const { data: chatData } = await client.query({
    query: LOAD_CHAT,
    variables: { id: chatId },
    fetchPolicy: "no-cache",
  });

  const raw = chatData?.lair_chats_by_pk;
  if (!raw) return null;

  const chat: Chat = {
    id: raw.id,
    title: raw.title,
    type: raw.type,
    claimCode: raw.claim_code,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };

  const { data: msgData } = await client.query({
    query: LOAD_CHAT_MESSAGES,
    variables: { chatId },
    fetchPolicy: "no-cache",
  });

  const messages: ChatMessage[] = (msgData?.lair_messages ?? []).map((m: any) => ({
    id: m.id,
    chatId: m.chat_id,
    role: m.role,
    parts: m.parts ?? [],
    createdAt: m.created_at,
  }));

  return { chat, messages };
}

export async function upsertMessage(params: {
  chatId: string;
  messageId: string;
  role: string;
  parts: unknown[];
}): Promise<string> {
  const client = getClient();
  const { data } = await client.mutate({
    mutation: UPSERT_MESSAGE,
    variables: {
      object: {
        id: params.messageId,
        chat_id: params.chatId,
        role: params.role,
        parts: params.parts,
      },
    },
  });
  return data.insert_lair_messages_one.id;
}

export async function listChats(params: {
  type?: ChatType;
  limit?: number;
  offset?: number;
}): Promise<{ chats: Chat[]; total: number }> {
  const client = getClient();

  const where: Record<string, unknown> = { deleted_at: { _is_null: true } };
  if (params.type) {
    where.type = { _eq: params.type };
  }

  const { data } = await client.query({
    query: LIST_CHATS,
    variables: {
      where,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    },
    fetchPolicy: "no-cache",
  });

  const chats: Chat[] = (data?.lair_chats ?? []).map((c: any) => ({
    id: c.id,
    title: c.title,
    type: c.type,
    claimCode: c.claim_code,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));

  const total = data?.lair_chats_aggregate?.aggregate?.count ?? 0;

  return { chats, total };
}
