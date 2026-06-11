// One-off maintenance command: removes planned, un-edited workouts left
// behind by archived programs (data created before SaveProgramState cleaned
// up on archive). Safe to run repeatedly.
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://telos@localhost:5433/postgres?sslmode=disable"
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		fmt.Fprintln(os.Stderr, "connect:", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	tag, err := conn.Exec(ctx, `
		DELETE FROM workouts w
		USING programs p
		WHERE w.program_id = p.id AND p.status = 'archived'
		  AND w.status = 'planned' AND NOT w.edited`)
	if err != nil {
		fmt.Fprintln(os.Stderr, "delete:", err)
		os.Exit(1)
	}
	fmt.Printf("removed %d orphaned planned workouts\n", tag.RowsAffected())
}
