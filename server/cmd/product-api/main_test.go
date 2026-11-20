package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/PlaybookMediaLLC/screenshot-studio/services/internal/agentclients"
	"github.com/PlaybookMediaLLC/screenshot-studio/services/internal/media"
	"github.com/PlaybookMediaLLC/screenshot-studio/services/internal/telemetry"
)

// The public port serves agents the MCP server and its OAuth endpoints, and
// nothing of the internal product API.
func TestPublicPortServesOnlyMCPAndOAuth(t *testing.T) {
	t.Setenv("PLATFORM_MCP_URL", "https://mcp.shots.test/mcp")
	t.Setenv("FRONTEND_URL", "https://shots.test")
	t.Setenv("JWT_SECRET", "")
	if _, err := publicHandler(nil, nil, agentclients.New(nil), nil); err == nil {
		t.Fatal("the public port started without JWT_SECRET")
	}
	t.Setenv("JWT_SECRET", "test-secret")
	// No request below reaches the database or the product domain.
	handler, err := publicHandler(nil, nil, agentclients.New(nil), nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		method, path, body string
		status             int
	}{
		{"GET", "/.well-known/oauth-protected-resource/mcp", "", 200},
		{"GET", "/.well-known/oauth-authorization-server/mcp-oauth-dynamic", "", 200},
		{"POST", "/mcp", "{}", 401},
		{"POST", "/mcp-oauth-claude", "{}", 401},
		{"POST", "/oauth/register", "{}", 400},
		{"POST", "/oauth/token", "grant_type=authorization_code&code=shc_x", 401},
		{"GET", "/healthz", "", 404},
		{"GET", "/readyz", "", 404},
		{"GET", "/v1/workspaces", "", 404},
		{"GET", "/provider-media/media.mp4?token=invalid", "", 404},
		{"POST", "/v1/agent-authorizations", "{}", 404},
		{"GET", "/oauth/authorize", "", 404},
		{"GET", "/oauth/userinfo", "", 404},
		{"GET", "/", "", 404},
	} {
		request := httptest.NewRequest(c.method, c.path, strings.NewReader(c.body))
		if strings.HasPrefix(c.body, "grant_type") {
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != c.status {
			t.Errorf("%s %s: %d %s", c.method, c.path, recorder.Code, recorder.Body)
		}
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/.well-known/oauth-authorization-server/mcp-oauth-dynamic", nil))
	if body := recorder.Body.String(); !strings.Contains(body, `"token_endpoint":"https://mcp.shots.test/oauth/token"`) ||
		!strings.Contains(body, `"registration_endpoint":"https://mcp.shots.test/oauth/register"`) || strings.Contains(body, "userinfo") {
		t.Fatalf("metadata=%s", body)
	}
}

func TestPublicMediaRouteStreamsPastAPIDeadlineWithoutExposingProductAPI(t *testing.T) {
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/assets/org/one/clip.mp4" {
			t.Errorf("unexpected object: %s", r.URL.Path)
		}
		time.Sleep(50 * time.Millisecond)
		w.Header().Set("Content-Type", "video/mp4")
		w.Header().Set("Content-Length", "5")
		io.WriteString(w, "video")
	}))
	defer storage.Close()
	for key, value := range map[string]string{
		"R2_ENDPOINT": storage.URL, "R2_BUCKET_NAME": "assets", "R2_ACCESS_KEY_ID": "test", "R2_SECRET_ACCESS_KEY": "test",
		"PLATFORM_PROVIDER_MEDIA_ORIGIN": "https://shots.test", "PUBLISHING_SERVICE_TOKEN": strings.Repeat("s", 32),
		"PLATFORM_MCP_URL": "https://mcp.shots.test/mcp", "FRONTEND_URL": "https://shots.test", "JWT_SECRET": "test-secret",
	} {
		t.Setenv(key, value)
	}
	objects, err := media.NewS3StoreFromEnvironment()
	if err != nil {
		t.Fatal(err)
	}
	handler, err := publicHandler(nil, nil, agentclients.New(nil), objects)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewUnstartedServer(telemetry.Handler(handler, true))
	server.Config.WriteTimeout = 5 * time.Millisecond
	server.Start()
	defer server.Close()
	location, err := objects.SignDelivery(context.Background(), "org/one/clip.mp4")
	if err != nil {
		t.Fatal(err)
	}
	parsed, _ := url.Parse(location)
	response, err := server.Client().Get(server.URL + parsed.RequestURI())
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil || response.StatusCode != 200 || string(body) != "video" {
		t.Fatalf("status=%d body=%q err=%v", response.StatusCode, body, err)
	}
	for path, status := range map[string]int{"/provider-media/media.mp4?token=invalid": 403, "/v1/workspaces": 404} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != status {
			t.Errorf("%s: %d", path, response.Code)
		}
	}
}
