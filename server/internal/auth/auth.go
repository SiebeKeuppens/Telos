// Package auth verifies caller identity. Production mode verifies Firebase
// ID tokens (the only Firebase piece Telos keeps — Postgres is the
// datastore). A clearly-fenced insecure dev mode exists for local work
// without a Firebase session; it refuses to load outside development.
package auth

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	firebase "firebase.google.com/go/v4"
	fbauth "firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

var ErrUnauthorized = errors.New("unauthorized")

// Identity is the verified caller.
type Identity struct {
	UID   string
	Email string
}

type Verifier interface {
	Verify(ctx context.Context, idToken string) (Identity, error)
}

// NewFirebase builds a verifier against a Firebase project. ID-token
// verification only needs the project ID — signatures are checked against
// Google's PUBLIC certs — but the Admin SDK insists on Application Default
// Credentials when constructing its client. So: use ADC when a service
// account is configured (GOOGLE_APPLICATION_CREDENTIALS), and otherwise build
// the client explicitly without authentication, which is sufficient for
// VerifyIDToken and avoids shipping a service-account key just to check
// signatures.
func NewFirebase(ctx context.Context, projectID string) (Verifier, error) {
	if projectID == "" {
		return nil, errors.New("FIREBASE_PROJECT_ID is required in firebase auth mode")
	}
	var opts []option.ClientOption
	if os.Getenv("GOOGLE_APPLICATION_CREDENTIALS") == "" {
		opts = append(opts, option.WithoutAuthentication())
	}
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID}, opts...)
	if err != nil {
		return nil, fmt.Errorf("init firebase app: %w", err)
	}
	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("init firebase auth client: %w", err)
	}
	return &firebaseVerifier{client: client}, nil
}

type firebaseVerifier struct {
	client *fbauth.Client
}

func (v *firebaseVerifier) Verify(ctx context.Context, idToken string) (Identity, error) {
	tok, err := v.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return Identity{}, fmt.Errorf("%w: %v", ErrUnauthorized, err)
	}
	email, _ := tok.Claims["email"].(string)
	return Identity{UID: tok.UID, Email: email}, nil
}

// NewInsecureDev returns a verifier accepting tokens of the form
// "dev:<uid>[:email]" — local development only. main.go refuses to wire it
// when ENV=production.
func NewInsecureDev() Verifier {
	return insecureDevVerifier{}
}

type insecureDevVerifier struct{}

func (insecureDevVerifier) Verify(_ context.Context, idToken string) (Identity, error) {
	parts := strings.SplitN(idToken, ":", 3)
	if len(parts) < 2 || parts[0] != "dev" || parts[1] == "" {
		return Identity{}, ErrUnauthorized
	}
	id := Identity{UID: parts[1]}
	if len(parts) == 3 {
		id.Email = parts[2]
	}
	return id, nil
}
