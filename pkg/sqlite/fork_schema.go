package sqlite

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/stashapp/stash/pkg/logger"
)

// Fork-specific schema additions.
//
// These are applied idempotently on every startup, completely outside the
// migration system. This avoids version-number collisions when rebasing
// on upstream: appSchemaVersion always matches upstream's latest, upstream
// migrations always run unmodified, and fork columns are added afterward.
//
// To add a new fork column, append to forkColumns below. No migration
// files, renumbering, or version bumps needed.
//
// On each upstream sync:
//  1. git rebase upstream/develop
//  2. Resolve merge conflicts in source files
//  3. Update appSchemaVersion in database.go to match upstream's latest
//  4. Done — no migration file changes needed

type forkColumn struct {
	Table      string
	Column     string
	Definition string
}

var forkColumns = []forkColumn{
	{Table: "scenes", Column: "favorite", Definition: "boolean NOT NULL DEFAULT '0'"},
	{Table: "images", Column: "favorite", Definition: "boolean NOT NULL DEFAULT '0'"},
	{Table: "galleries", Column: "favorite", Definition: "boolean NOT NULL DEFAULT '0'"},
	{Table: "galleries", Column: "has_generated_cover", Definition: "boolean NOT NULL DEFAULT '0'"},
}

// ensureForkSchema idempotently applies all fork-specific schema changes.
// Safe to call on every startup — column existence checks are cheap
// and no-ops when columns already exist.
func ensureForkSchema(ctx context.Context, db *sqlx.DB) error {
	for _, col := range forkColumns {
		exists, err := columnExists(ctx, db, col.Table, col.Column)
		if err != nil {
			return fmt.Errorf("checking column %s.%s: %w", col.Table, col.Column, err)
		}
		if exists {
			continue
		}

		logger.Infof("Fork schema: adding %s.%s", col.Table, col.Column)
		stmt := fmt.Sprintf("ALTER TABLE `%s` ADD COLUMN `%s` %s", col.Table, col.Column, col.Definition)
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("adding column %s.%s: %w", col.Table, col.Column, err)
		}
	}

	return nil
}

func columnExists(ctx context.Context, db *sqlx.DB, table, column string) (bool, error) {
	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(`%s`)", table))
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, typeName string
		var notNull int
		var dfltValue *string
		var pk int
		if err := rows.Scan(&cid, &name, &typeName, &notNull, &dfltValue, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}

	return false, rows.Err()
}
