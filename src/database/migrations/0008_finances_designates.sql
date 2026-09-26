PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`assignee_id` text,
	`creator_id` text NOT NULL,
	`requester` text,
	`remunerated` integer DEFAULT false NOT NULL,
	`price_minor` integer,
	`currency_code` text,
	`branch` text,
	`base_branch` text,
	`branch_start` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_type" CHECK(type IN ('bug', 'feature', 'improvement', 'maintenance', 'infra', 'refactor', 'research', 'chore')),
	CONSTRAINT "tasks_priority" CHECK(priority IN ('none', 'low', 'medium', 'high', 'urgent')),
	CONSTRAINT "tasks_status" CHECK(status IN ('backlog', 'todo', 'in_progress', 'review', 'blocked', 'done', 'cancelled')),
	CONSTRAINT "tasks_price_nonnegative" CHECK(price_minor IS NULL OR price_minor >= 0),
	CONSTRAINT "tasks_remuneration_fields" CHECK((remunerated = 0 AND price_minor IS NULL AND currency_code IS NULL) OR (remunerated = 1 AND price_minor IS NOT NULL AND currency_code IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "number", "workspace_id", "project_id", "title", "description", "type", "priority", "status", "assignee_id", "creator_id", "requester", "remunerated", "price_minor", "currency_code", "branch", "base_branch", "branch_start", "created_at", "updated_at", "started_at", "completed_at", "archived_at") SELECT "id", "number", "workspace_id", "project_id", "title", "description", "type", "priority", "status", "assignee_id", "creator_id", "requester", "remunerated", "price_minor", "currency_code", "branch", "base_branch", "branch_start", "created_at", "updated_at", "started_at", "completed_at", "archived_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_workspace_number` ON `tasks` (`workspace_id`,`number`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_status` ON `tasks` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_assignee` ON `tasks` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `tasks_project` ON `tasks` (`project_id`);--> statement-breakpoint
ALTER TABLE `workspace_members` ADD `designated` integer DEFAULT false NOT NULL;