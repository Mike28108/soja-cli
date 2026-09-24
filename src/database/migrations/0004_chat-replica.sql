CREATE TABLE `chat_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`topic` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE INDEX `chat_channels_workspace` ON `chat_channels` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer,
	`workspace_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`reply_to_id` text,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `chat_messages_channel` ON `chat_messages` (`channel_id`,`seq`);--> statement-breakpoint
CREATE INDEX `chat_messages_workspace` ON `chat_messages` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `chat_reads` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`last_read_seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sync_outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`op_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`type` text NOT NULL,
	`task_id` text,
	`payload` text NOT NULL,
	`base` text,
	`occurred_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
INSERT INTO `__new_sync_outbox`("seq", "op_id", "workspace_id", "type", "task_id", "payload", "base", "occurred_at", "attempts", "last_error") SELECT "seq", "op_id", "workspace_id", "type", "task_id", "payload", "base", "occurred_at", "attempts", "last_error" FROM `sync_outbox`;--> statement-breakpoint
DROP TABLE `sync_outbox`;--> statement-breakpoint
ALTER TABLE `__new_sync_outbox` RENAME TO `sync_outbox`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sync_outbox_op_id_unique` ON `sync_outbox` (`op_id`);--> statement-breakpoint
CREATE INDEX `sync_outbox_workspace` ON `sync_outbox` (`workspace_id`,`seq`);