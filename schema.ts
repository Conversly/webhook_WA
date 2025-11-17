import { pgTable, text, timestamp, varchar, smallint, boolean, json, index, uniqueIndex, foreignKey, unique, pgEnum } from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';

import { createId } from '@paralleldrive/cuid2';

export const Feedback = {
  None: 0,
  Like: 1,
  Dislike: 2,
  Neutral: 3,
} as const;

export type FeedbackType = (typeof Feedback)[keyof typeof Feedback];

export const chatbotStatus = pgEnum('ChatbotStatus', [
  'DRAFT',
  'TRAINING',
  'ACTIVE',
  'INACTIVE',
]);

// Unified channel & sender enums (for cross-channel messaging)
export const messageChannel = pgEnum('MessageChannel', [
  'WIDGET',
  'WHATSAPP',
]);

export const messageType = pgEnum('MessageType', [
  'user',       // end customer
  'assistant',  // AI agent
  'agent',      // human support agent
]);

// NEW Enums for WhatsApp
export const whatsappAccountStatus = pgEnum('WhatsappAccountStatus', ['active', 'inactive']);

// Minimal chatbot table - only what's needed for webhook service
export const chatBots = pgTable('chatbot', {
  id: text('id').primaryKey().notNull().$defaultFn(() => createId()),
  apiKey: varchar('api_key', { length: 255 }),
});

// Messages table - for storing WhatsApp messages
export const messages = pgTable('messages', {
  id: text('id').primaryKey().notNull().$defaultFn(() => createId()),
  uniqueConvId: text('unique_conv_id'),  /// contact, random generated id for widget 
  chatbotId: text('chatbot_id').notNull(),  // denormalized for fast filtering
  channel: messageChannel('channel').notNull().default('WIDGET'),  
  type: messageType('type').notNull().default('user'),
  content: text('content').notNull(),
  citations: text('citations').array().notNull().default(sql`ARRAY[]::text[]`),
  feedback: smallint('feedback').default(0).notNull(),  // 0=none, 1=like, 2=dislike, 3=neutral
  feedbackComment: text('feedback_comment'),
  channelMessageMetadata: json('channel_message_metadata'),   // whatsapp, widget metadata.
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true, precision: 6 }).defaultNow(),
  topicId: text('topic_id'),
}, (table) => [
  index('messages_unique_conv_id_created_idx').on(
    table.uniqueConvId,
    table.createdAt.desc(),
  ),
  index('messages_chatbot_id_created_idx').on(
    table.chatbotId,
    table.createdAt.desc(),
  ),
  index('messages_chatbot_channel_idx').on(table.chatbotId, table.channel),
  index('messages_chatbot_feedback_idx').on(table.chatbotId, table.feedback),
  foreignKey({
    columns: [table.chatbotId],
    foreignColumns: [chatBots.id],
  })
    .onUpdate('cascade')
    .onDelete('cascade'),
  // Note: topicId foreign key constraint is managed by another service
]);

// WhatsApp Tables (with webhook secrets and all required details)
export const whatsappAccounts = pgTable('whatsapp_accounts', {
  id: text('id').primaryKey().notNull().$defaultFn(() => createId()),
  chatbotId: text('chatbot_id').notNull().references(() => chatBots.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  phoneNumber: varchar('phone_number', { length: 20 }).notNull().unique(),
  wabaId: varchar('waba_id', { length: 255 }).notNull(),
  phoneNumberId: varchar('phone_number_id', { length: 255 }).notNull(),
  accessToken: text('access_token').notNull(),
  verifiedName: varchar('verified_name', { length: 255 }).notNull(),
  status: whatsappAccountStatus('status').default('active').notNull(),
  whatsappBusinessId: varchar('whatsapp_business_id', { length: 255 }).notNull(),
  webhookUrl: text('webhook_url'),
  verifyToken: varchar('verify_token', { length: 255 }), // Webhook verification token
  createdAt: timestamp('created_at', { mode: 'date', precision: 6 }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', precision: 6 }).defaultNow(),
}, (table) => [
  index('whatsapp_accounts_chatbot_id_idx').on(table.chatbotId),
  index('whatsapp_accounts_phone_number_idx').on(table.phoneNumber),
  // Index on phone_number_id for fast message routing (most common query)
  index('whatsapp_accounts_phone_number_id_idx').on(table.phoneNumberId),
  // Index on verify_token for fast webhook verification lookups
  index('whatsapp_accounts_verify_token_idx').on(table.verifyToken),
  // Composite index for common query pattern: phone_number_id + status
  index('whatsapp_accounts_phone_number_id_status_idx').on(table.phoneNumberId, table.status),
  // Composite index for webhook verification: verify_token + status
  index('whatsapp_accounts_verify_token_status_idx').on(table.verifyToken, table.status),
  unique('whatsapp_accounts_chatbot_id_unique').on(table.chatbotId), // One WhatsApp account per chatbot
]);

export const whatsappContacts = pgTable('whatsapp_contacts', {
  id: text('id').primaryKey().notNull().$defaultFn(() => createId()),
  chatbotId: text('chatbot_id').notNull(),
  phoneNumber: varchar('phone_number', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  // Detailed metadata: { wa_id, profile, first_seen_at, last_seen_at, last_inbound_message_id, waba_id, phone_number_id, display_phone_number, source, opt_in_status, etc }
  userMetadata: json('whatsapp_user_metadata').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', precision: 6 }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', precision: 6 }).defaultNow(),
}, (table) => [
  uniqueIndex('whatsapp_contacts_chatbot_id_phone_number_unique').on(table.chatbotId, table.phoneNumber),
  index('whatsapp_contacts_chatbot_id_idx').on(table.chatbotId),
  foreignKey({
    columns: [table.chatbotId],
    foreignColumns: [chatBots.id],
  })
    .onUpdate('cascade')
    .onDelete('cascade'),
]);
