CREATE TABLE `project_repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`repository_url` text,
	`local_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_repositories_project_name` ON `project_repositories` (`project_id`,`name`);
--> statement-breakpoint
CREATE INDEX `project_repositories_project` ON `project_repositories` (`project_id`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `repository_id` text REFERENCES `project_repositories`(`id`) ON DELETE set null;
--> statement-breakpoint
INSERT INTO `project_repositories` (`id`,`project_id`,`name`,`repository_url`,`local_path`,`created_at`,`updated_at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), `id`, 'default', `repository_url`, `repository_path`, `created_at`, `updated_at`
FROM `projects` WHERE `repository_path` IS NOT NULL OR `repository_url` IS NOT NULL;
