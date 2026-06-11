package domain

import (
	"fmt"
	"time"
)

// Date is a civil date (no time, no zone) — used for bodyweight entries,
// check-ins, and workout scheduling, where "which day" is the meaning and a
// timestamp would invite timezone bugs. JSON form is "2006-01-02".
type Date struct {
	Year  int
	Month time.Month
	Day   int
}

func NewDate(t time.Time) Date {
	return Date{Year: t.Year(), Month: t.Month(), Day: t.Day()}
}

func ParseDate(s string) (Date, error) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return Date{}, fmt.Errorf("invalid date %q: %w", s, err)
	}
	return NewDate(t), nil
}

func (d Date) String() string {
	return fmt.Sprintf("%04d-%02d-%02d", d.Year, int(d.Month), d.Day)
}

// Time returns midnight UTC of the date (for arithmetic).
func (d Date) Time() time.Time {
	return time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, time.UTC)
}

func (d Date) AddDays(n int) Date {
	return NewDate(d.Time().AddDate(0, 0, n))
}

// DaysSince returns d - other in whole days (positive if d is later).
func (d Date) DaysSince(other Date) int {
	return int(d.Time().Sub(other.Time()).Hours() / 24)
}

func (d Date) Before(other Date) bool { return d.Time().Before(other.Time()) }

func (d Date) IsZero() bool { return d == Date{} }

func (d Date) MarshalJSON() ([]byte, error) {
	return []byte(`"` + d.String() + `"`), nil
}

func (d *Date) UnmarshalJSON(b []byte) error {
	s := string(b)
	if len(s) < 2 || s[0] != '"' || s[len(s)-1] != '"' {
		return fmt.Errorf("invalid date JSON: %s", s)
	}
	parsed, err := ParseDate(s[1 : len(s)-1])
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}
