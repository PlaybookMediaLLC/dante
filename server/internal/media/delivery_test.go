package media

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/johannesboyne/gofakes3"
	"github.com/johannesboyne/gofakes3/backend/s3mem"
)

func TestProviderDeliveryStreamsPrivateMediaAndRanges(t *testing.T) {
	storage := httptest.NewServer(gofakes3.New(s3mem.New(), gofakes3.WithAutoBucket(true)).Server())
	defer storage.Close()
	store, err := NewS3Store(storage.URL, "", "us-east-1", "assets", "test", "test")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.configureDelivery(strings.Repeat("s", 32), "https://shots.test/"); err != nil {
		t.Fatal(err)
	}
	key := "org/one/input/asset/1/clip.mp4"
	if err := store.Put(context.Background(), key, "video/mp4", strings.NewReader("0123456789")); err != nil {
		t.Fatal(err)
	}
	location, err := NewTenantObjects(store).SignDelivery(context.Background(), "one", key)
	if err != nil || !strings.HasPrefix(location, "https://shots.test/provider-media/media.mp4?token=") || strings.Contains(location, "org/") {
		t.Fatal("delivery did not use the private grant on the configured origin")
	}
	parsed, _ := url.Parse(location)
	grant, valid := store.delivery.open(parsed.Query().Get("token"))
	if !valid || grant.Key != key || time.Until(time.Unix(grant.ExpiresAt, 0)) < 23*time.Hour {
		t.Fatal("grant did not preserve object and expiry")
	}
	for _, tc := range []struct {
		method, rangeValue, body, contentRange, length string
		status                                         int
	}{
		{"GET", "", "0123456789", "", "10", 200},
		{"HEAD", "", "", "", "10", 200},
		{"GET", "bytes=2-5", "2345", "bytes 2-5/10", "4", 206},
		{"GET", "bytes=-3", "789", "bytes 7-9/10", "3", 206},
		{"GET", "bytes=7-", "789", "bytes 7-9/10", "3", 206},
	} {
		t.Run(tc.method+tc.rangeValue, func(t *testing.T) {
			request := httptest.NewRequest(tc.method, location, nil)
			request.Header.Set("Range", tc.rangeValue)
			response := httptest.NewRecorder()
			store.ProviderDeliveryHandler().ServeHTTP(response, request)
			if response.Code != tc.status || response.Body.String() != tc.body || response.Header().Get("Content-Range") != tc.contentRange || response.Header().Get("Content-Length") != tc.length {
				t.Fatalf("status=%d headers=%v body=%q", response.Code, response.Header(), response.Body.String())
			}
			for name, want := range map[string]string{"Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "attachment; filename=\"media.mp4\""} {
				if response.Header().Get(name) != want {
					t.Errorf("%s=%q", name, response.Header().Get(name))
				}
			}
		})
	}
	for _, rangeValue := range []string{"bytes=20-", "bytes=1-2,4-5", "bytes=oops"} {
		request := httptest.NewRequest("GET", location, nil)
		request.Header.Set("Range", rangeValue)
		response := httptest.NewRecorder()
		store.ProviderDeliveryHandler().ServeHTTP(response, request)
		if response.Code != 416 {
			t.Errorf("range=%s status=%d", rangeValue, response.Code)
		}
	}
	if err := store.Delete(context.Background(), key); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	store.ProviderDeliveryHandler().ServeHTTP(response, httptest.NewRequest("GET", location, nil))
	if response.Code != 404 || strings.Contains(response.Body.String(), key) {
		t.Fatal("missing object was not safely reported")
	}
}

func TestProviderDeliveryRejectsInvalidGrantsBeforeStorage(t *testing.T) {
	store := &S3Store{}
	if err := store.configureDelivery(strings.Repeat("s", 32), "https://shots.test"); err != nil {
		t.Fatal(err)
	}
	key := "org/one/input/asset/1/clip.mp4"
	valid, _ := store.delivery.sign(key, time.Now().Add(time.Hour))
	expired, _ := store.delivery.sign(key, time.Now().Add(-time.Second))
	tooLong, _ := store.delivery.sign(key, time.Now().Add(25*time.Hour))
	if _, err := NewTenantObjects(store).SignDelivery(context.Background(), "one", "org/two/input/asset/1/clip.mp4"); err == nil {
		t.Fatal("tenant boundary allowed a foreign grant")
	}
	for _, key := range []string{"secret", "org/one/../two/clip.mp4", "org//clip.mp4", "deletion-ledger/2026/11/19/entry.json"} {
		if _, err := store.SignDelivery(context.Background(), key); err == nil {
			t.Errorf("unsafe key accepted: %s", key)
		}
	}
	// Even a correctly sealed grant cannot name an unsafe storage key.
	body, _ := json.Marshal(deliveryGrant{Key: "org/one/../two/clip.mp4", ExpiresAt: time.Now().Add(time.Hour).Unix()})
	nonce := make([]byte, store.delivery.cipher.NonceSize())
	sealed := store.delivery.cipher.Seal(nonce, nonce, body, []byte(deliveryPurpose))
	unsafe := "https://shots.test/provider-media/media.mp4?token=" + base64.RawURLEncoding.EncodeToString(sealed)
	parsed, _ := url.Parse(valid)
	token := parsed.Query().Get("token")
	bytes, _ := base64.RawURLEncoding.DecodeString(token)
	bytes[len(bytes)/2] ^= 1
	tampered := "https://shots.test/provider-media/media.mp4?token=" + base64.RawURLEncoding.EncodeToString(bytes)
	for _, location := range []string{expired, tooLong, unsafe, tampered, strings.Replace(valid, "media.mp4", "other.mp4", 1), "https://shots.test/provider-media/media.mp4", "https://shots.test/provider-media/media.mp4?token=" + strings.Repeat("x", 4097)} {
		response := httptest.NewRecorder()
		store.ProviderDeliveryHandler().ServeHTTP(response, httptest.NewRequest("GET", location, nil))
		if response.Code != 403 || strings.Contains(response.Body.String(), token) {
			t.Errorf("invalid grant: status=%d", response.Code)
		}
	}
	for _, method := range []string{"POST", "PUT", "DELETE"} {
		response := httptest.NewRecorder()
		store.ProviderDeliveryHandler().ServeHTTP(response, httptest.NewRequest(method, valid, nil))
		if response.Code != 405 || response.Header().Get("Allow") != "GET, HEAD" {
			t.Errorf("method=%s status=%d", method, response.Code)
		}
	}
	response := httptest.NewRecorder()
	(&S3Store{}).ProviderDeliveryHandler().ServeHTTP(response, httptest.NewRequest("GET", valid, nil))
	if response.Code != 404 {
		t.Fatal("disabled delivery was exposed")
	}
}

func TestProviderDeliveryFailsClosedOnStorageAndStreamErrors(t *testing.T) {
	for _, truncated := range []bool{false, true} {
		t.Run(map[bool]string{false: "unavailable", true: "truncated"}[truncated], func(t *testing.T) {
			storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if !truncated {
					w.WriteHeader(403)
					io.WriteString(w, "<Error><Code>AccessDenied</Code><Message>private storage detail</Message></Error>")
					return
				}
				w.Header().Set("Content-Length", "10")
				io.WriteString(w, "short")
			}))
			defer storage.Close()
			store, _ := NewS3Store(storage.URL, "", "us-east-1", "assets", "test", "test")
			if err := store.configureDelivery(strings.Repeat("s", 32), "https://shots.test"); err != nil {
				t.Fatal(err)
			}
			location, _ := store.SignDelivery(context.Background(), "org/one/clip.mp4")
			response := httptest.NewRecorder()
			if truncated {
				defer func() {
					if recover() != http.ErrAbortHandler {
						t.Error("truncated stream was not aborted")
					}
				}()
			}
			store.ProviderDeliveryHandler().ServeHTTP(response, httptest.NewRequest("GET", location, nil))
			if !truncated && (response.Code != 502 || strings.Contains(response.Body.String(), "private")) {
				t.Fatal("upstream failure escaped or became success")
			}
		})
	}
}

func TestProviderDeliveryEnvironmentValidation(t *testing.T) {
	t.Setenv("R2_ENDPOINT", "https://storage.test")
	t.Setenv("R2_BUCKET_NAME", "assets")
	t.Setenv("R2_ACCESS_KEY_ID", "test")
	t.Setenv("R2_SECRET_ACCESS_KEY", "test")
	t.Setenv("PUBLISHING_SERVICE_TOKEN", strings.Repeat("s", 32))
	for _, origin := range []string{"http://shots.test", "https://user:secret@shots.test", "https://shots.test/path", "https://shots.test?token=private", "https://shots.test#fragment", "invalid", "https://shots.test"} {
		t.Setenv("PLATFORM_PROVIDER_MEDIA_ORIGIN", origin)
		store, err := NewS3StoreFromEnvironment()
		if origin != "https://shots.test" {
			if err == nil {
				t.Errorf("invalid origin accepted: %s", origin)
			}
		} else if err != nil || store.delivery == nil {
			t.Fatalf("valid origin: %v", err)
		}
	}
	t.Setenv("PUBLISHING_SERVICE_TOKEN", "short")
	if _, err := NewS3StoreFromEnvironment(); err == nil {
		t.Fatal("short service key accepted")
	}
}
