PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "task_activity_type" CHECK(type IN ('task_created', 'task_updated', 'status_changed', 'assigned', 'unassigned', 'priority_changed', 'project_changed', 'comment_added', 'task_completed', 'task_reopened', 'git_committed', 'git_merged', 'git_branch_deleted', 'git_pushed', 'pr_opened', 'git_merge_detected', 'pr_merged', 'pr_checks_failed', 'task_archived', 'task_unarchived'))
);
--> statement-breakpoint
INSERT INTO `__new_task_activity`("id", "task_id", "user_id", "type", "metadata", "created_at") SELECT "id", "task_id", "user_id", "type", "metadata", "created_at" FROM `task_activity`;--> statement-breakpoint
DROP TABLE `task_activity`;--> statement-breakpoint
ALTER TABLE `__new_task_activity` RENAME TO `task_activity`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `task_activity_task` ON `task_activity` (`task_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `last_deleted_number` integer DEFAULT 0 NOT NULL;