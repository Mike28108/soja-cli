ALTER TABLE tasks ADD COLUMN remunerated INTEGER NOT NULL DEFAULT 0 CHECK (remunerated IN (0, 1));--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0);--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN currency_code TEXT CHECK (currency_code IS NULL OR currency_code GLOB '[A-Z][A-Z][A-Z]');
--> statement-breakpoint
ALTER TABLE workspace_members ADD COLUMN designated INTEGER NOT NULL DEFAULT 0 CHECK (designated IN (0, 1));
