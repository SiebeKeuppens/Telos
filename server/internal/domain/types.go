// Package domain holds Telos's core types, shared by the engine, store, and
// HTTP layers. It must stay free of HTTP, SQL, and cache concerns.
package domain

import "time"

// Goal is the user's training goal. Profiles (package profile) map each goal
// to engine parameters — the engine itself never branches on Goal directly.
type Goal string

const (
	GoalStayFit      Goal = "stay_fit"
	GoalBuildMuscle  Goal = "build_muscle"
	GoalStrength     Goal = "strength"
	GoalBodybuilding Goal = "bodybuilding"
)

func (g Goal) Valid() bool {
	switch g {
	case GoalStayFit, GoalBuildMuscle, GoalStrength, GoalBodybuilding:
		return true
	}
	return false
}

type ExperienceLevel string

const (
	ExperienceBeginner     ExperienceLevel = "beginner"
	ExperienceIntermediate ExperienceLevel = "intermediate"
	ExperienceAdvanced     ExperienceLevel = "advanced"
)

func (e ExperienceLevel) Valid() bool {
	switch e {
	case ExperienceBeginner, ExperienceIntermediate, ExperienceAdvanced:
		return true
	}
	return false
}

type MuscleGroup string

const (
	MuscleChest      MuscleGroup = "chest"
	MuscleBack       MuscleGroup = "back"
	MuscleShoulders  MuscleGroup = "shoulders"
	MuscleBiceps     MuscleGroup = "biceps"
	MuscleTriceps    MuscleGroup = "triceps"
	MuscleQuads      MuscleGroup = "quads"
	MuscleHamstrings MuscleGroup = "hamstrings"
	MuscleGlutes     MuscleGroup = "glutes"
	MuscleCalves     MuscleGroup = "calves"
	MuscleCore       MuscleGroup = "core"
)

// AllMuscleGroups is the canonical iteration order (stable output matters for
// deterministic program generation and tests).
var AllMuscleGroups = []MuscleGroup{
	MuscleChest, MuscleBack, MuscleShoulders, MuscleBiceps, MuscleTriceps,
	MuscleQuads, MuscleHamstrings, MuscleGlutes, MuscleCalves, MuscleCore,
}

type MovementPattern string

const (
	PatternHorizontalPush MovementPattern = "horizontal_push"
	PatternVerticalPush   MovementPattern = "vertical_push"
	PatternHorizontalPull MovementPattern = "horizontal_pull"
	PatternVerticalPull   MovementPattern = "vertical_pull"
	PatternSquat          MovementPattern = "squat"
	PatternHinge          MovementPattern = "hinge"
	PatternLunge          MovementPattern = "lunge"
	PatternIsolation      MovementPattern = "isolation"
	PatternCore           MovementPattern = "core"
	PatternCarry          MovementPattern = "carry"
)

type Equipment string

const (
	EquipBarbell    Equipment = "barbell"
	EquipDumbbell   Equipment = "dumbbell"
	EquipMachine    Equipment = "machine"
	EquipCable      Equipment = "cable"
	EquipKettlebell Equipment = "kettlebell"
	EquipBand       Equipment = "band"
	EquipBodyweight Equipment = "bodyweight"
	EquipBench      Equipment = "bench"
	EquipPullupBar  Equipment = "pullup_bar"
	EquipDipBar     Equipment = "dip_bar"
	EquipRower      Equipment = "rowing_machine"
)

type SplitStyle string

const (
	SplitFullBody   SplitStyle = "full_body"
	SplitUpperLower SplitStyle = "upper_lower"
	SplitPushPullLegs SplitStyle = "push_pull_legs"
	// SplitBodyPart pairs two focus muscle groups per session
	// (chest+triceps, back+biceps, …).
	SplitBodyPart SplitStyle = "body_part"
)

// SplitCompatible reports whether a split style makes sense at a given
// training frequency — a pair split can't cover the body twice a week on two
// days, and full-body sessions six days a week never recover.
func SplitCompatible(s SplitStyle, days int) bool {
	switch s {
	case SplitFullBody:
		return days >= 1 && days <= 4
	case SplitUpperLower:
		return days >= 2 && days <= 5
	case SplitPushPullLegs:
		return days == 3 || days == 5 || days == 6
	case SplitBodyPart:
		return days >= 4 && days <= 6
	}
	return false
}

// User is the training-relevant profile; auth identity lives in Firebase.
type User struct {
	UID         string          `json:"uid"`
	Email       string          `json:"email,omitempty"`
	DisplayName string          `json:"displayName,omitempty"`
	Goal        Goal            `json:"goal"`
	Experience  ExperienceLevel `json:"experience"`
	DaysPerWeek int             `json:"daysPerWeek"`
	Equipment   []Equipment     `json:"equipment"`
	Limitations string          `json:"limitations,omitempty"`
	Unit        string          `json:"unit"` // "kg" | "lb" — display preference; storage is always kg
	// Optional body details powering the daily-energy estimate. All nullable:
	// training never requires them.
	HeightCm  *int    `json:"heightCm,omitempty"`
	BirthYear *int    `json:"birthYear,omitempty"`
	Sex       *string `json:"sex,omitempty"` // "male" | "female"; nil → formula constants averaged
	// SplitPreference overrides the profile's split style when compatible
	// with the training frequency; nil = automatic.
	SplitPreference *SplitStyle `json:"splitPreference,omitempty"`
	OnboardedAt *time.Time      `json:"onboardedAt,omitempty"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

type WorkoutStatus string

const (
	WorkoutPlanned    WorkoutStatus = "planned"
	WorkoutInProgress WorkoutStatus = "in_progress"
	WorkoutCompleted  WorkoutStatus = "completed"
	WorkoutSkipped    WorkoutStatus = "skipped"
	WorkoutAborted    WorkoutStatus = "aborted"
)

// ProgramPhase is the periodization phase the program is currently in.
// Linear (beginner) programs stay in "linear"; undulating stays in
// "undulating"; block periodization cycles accumulation → intensification →
// deload. A deload week is expressed as phase "deload" for every model.
type ProgramPhase string

const (
	PhaseLinear          ProgramPhase = "linear"
	PhaseUndulating      ProgramPhase = "undulating"
	PhaseAccumulation    ProgramPhase = "accumulation"
	PhaseIntensification ProgramPhase = "intensification"
	PhaseDeload          ProgramPhase = "deload"
)

type Program struct {
	ID            string       `json:"id"`
	UserID        string       `json:"userId"`
	Status        string       `json:"status"` // active | archived
	Goal          Goal         `json:"goal"`
	Split         SplitStyle   `json:"split"`
	DaysPerWeek   int          `json:"daysPerWeek"`
	Phase         ProgramPhase `json:"phase"`
	WeekInPhase   int          `json:"weekInPhase"`   // 1-based
	MesocycleWeek int          `json:"mesocycleWeek"` // 1-based, resets after deload
	StartedAt     time.Time    `json:"startedAt"`
	CreatedAt     time.Time    `json:"createdAt"`
	UpdatedAt     time.Time    `json:"updatedAt"`
}

// MaxRestSeconds caps rest between sets everywhere (engine prescriptions,
// client timer, sync validation): sessions keep moving. Default rest is 90 s.
const MaxRestSeconds = 120

// WarmupMove is one step of a session's dynamic warmup ("name" is a stable
// code the client localizes; prescription like "10/side" or "45 s").
type WarmupMove struct {
	Name         string `json:"name"`
	Prescription string `json:"prescription"`
}

type Workout struct {
	ID           string        `json:"id"`
	UserID       string        `json:"userId"`
	ProgramID    *string       `json:"programId,omitempty"`
	Name         string        `json:"name"`
	DayIndex     int           `json:"dayIndex"` // position within the split's week
	Status       WorkoutStatus `json:"status"`
	ScheduledFor *Date         `json:"scheduledFor,omitempty"`
	StartedAt    *time.Time    `json:"startedAt,omitempty"`
	CompletedAt  *time.Time    `json:"completedAt,omitempty"`
	Notes        string        `json:"notes,omitempty"`
	Edited       bool          `json:"edited"`
	Warmup       []WarmupMove  `json:"warmup,omitempty"` // engine-generated, read-only for clients
	Exercises    []WorkoutExercise `json:"exercises,omitempty"`
	CreatedAt    time.Time     `json:"createdAt"`
	UpdatedAt    time.Time     `json:"updatedAt"`
}

type WorkoutExercise struct {
	ID            string   `json:"id"`
	WorkoutID     string   `json:"workoutId"`
	ExerciseID    string   `json:"exerciseId"`
	Position      int      `json:"position"`
	TargetSets    int      `json:"targetSets"`
	TargetRepsMin int      `json:"targetRepsMin"`
	TargetRepsMax int      `json:"targetRepsMax"`
	TargetRPE     *float64 `json:"targetRpe,omitempty"`
	TargetLoadKg  *float64 `json:"targetLoadKg,omitempty"`
	RestSeconds   int      `json:"restSeconds"`
	Notes         string   `json:"notes,omitempty"`
	// NoteCode is engine guidance as a stable code ("first_time", "backoff",
	// "hold_add_rep", "deload_light", "intensity_optional") the client
	// localizes — the server ships no display language.
	NoteCode string `json:"noteCode,omitempty"`
	Sets          []Set    `json:"sets,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type Set struct {
	ID                string    `json:"id"`
	WorkoutExerciseID string    `json:"workoutExerciseId"`
	SetNumber         int       `json:"setNumber"`
	LoadKg            float64   `json:"loadKg"`
	Reps              int       `json:"reps"`
	RPE               *float64  `json:"rpe,omitempty"`
	Completed         bool      `json:"completed"`
	LoggedAt          time.Time `json:"loggedAt"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type BodyweightEntry struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Date      Date      `json:"date"`
	WeightKg  float64   `json:"weightKg"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// CheckIn captures daily recovery signals on 1–5 scales. Higher is always
// "better recovered" except Stress and Soreness, where higher means more.
type CheckIn struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	Date       Date      `json:"date"`
	Energy     int       `json:"energy"`
	Stress     int       `json:"stress"`
	Sleep      int       `json:"sleep"`
	Motivation int       `json:"motivation"`
	Soreness   int       `json:"soreness"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type Exercise struct {
	ID               string            `json:"id"` // stable slug, e.g. "barbell-back-squat"
	Name             string            `json:"name"`
	Equipment        []Equipment       `json:"equipment"` // required equipment (all of)
	Pattern          MovementPattern   `json:"pattern"`
	PrimaryMuscles   []MuscleGroup     `json:"primaryMuscles"`
	SecondaryMuscles []MuscleGroup     `json:"secondaryMuscles"`
	IsCompound       bool              `json:"isCompound"`
	FormCues         []string          `json:"formCues"`
	CommonMistakes   []string          `json:"commonMistakes"`
	SubstituteID     *string           `json:"substituteId,omitempty"`
	ProgressionID    *string           `json:"progressionId,omitempty"`
}
