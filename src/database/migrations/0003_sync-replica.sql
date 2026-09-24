CREATE TABLE `sync_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`task_id` text,
	`task_ref` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`field` text,
	`overwritten` text,
	`created_at` integer NOT NULL,
	`dismissed_at` integer
);
--> statement-breakpoint
CREATE INDEX `sync_notices_workspace` ON `sync_notices` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`op_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`type` text NOT NULL,
	`task_id` text NOT NULL,
	`payload` text NOT NULL,
	`base` text,
	`occurred_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_outbox_op_id_unique` ON `sync_outbox` (`op_id`);--> statement-breakpoint
CREATE INDEX `sync_outbox_workspace` ON `sync_outbox` (`workspace_id`,`seq`);--> statement-breakpoint
CREATE TABLE `sync_pending_activity` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`op_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`last_sync_at` integer,
	`last_error` text
);
