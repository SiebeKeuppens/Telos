package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// spaHandler serves the built PWA from dist with the cache semantics a
// service-worker app needs:
//   - hashed assets (/assets/*) are immutable — cache forever;
//   - index.html and sw.js must revalidate on every load, or deployed
//     updates would never reach installed clients;
//   - unknown paths fall back to index.html (client-side routing).
func spaHandler(dist string) http.Handler {
	fileServer := http.FileServer(http.Dir(dist))
	index := filepath.Join(dist, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(dist, filepath.Clean("/"+r.URL.Path))

		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			switch {
			case strings.HasPrefix(r.URL.Path, "/assets/"):
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			case strings.HasSuffix(r.URL.Path, "sw.js"),
				strings.HasSuffix(r.URL.Path, ".webmanifest"):
				w.Header().Set("Cache-Control", "no-cache")
			}
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback — never cached, it's the entry that references the
		// current hashed bundle.
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, index)
	})
}