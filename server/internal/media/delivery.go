package media

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

// ProviderDeliveryPath is routed to the public backend, never the product API.
const ProviderDeliveryPath = "/provider-media/"

const deliveryPurpose = "shots.provider-media.v1"
const deliveryLifetime = 24 * time.Hour

var deliveryRange = regexp.MustCompile(`^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$`)

type deliveryGrant struct {
	Key       string `json:"key"`
	ExpiresAt int64  `json:"expiresAt"`
}

type deliveryGateway struct {
	cipher cipher.AEAD
	origin string
}

func (s *S3Store) configureDelivery(secret, origin string) error {
	u, err := url.Parse(origin)
	if s == nil || len(secret) < 32 || err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return errors.New("provider media delivery requires an HTTPS origin and a backend service secret")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(deliveryPurpose))
	block, err := aes.NewCipher(mac.Sum(nil))
	if err != nil {
		return err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	s.delivery = &deliveryGateway{cipher: aead, origin: u.Scheme + "://" + u.Host}
	return nil
}

func deliveryKeyValid(key string) bool {
	parts := strings.SplitN(key, "/", 3)
	return len(parts) == 3 && validTenantObjectKey(parts[1], key)
}

func deliveryPath(key string) string { return ProviderDeliveryPath + "media" + path.Ext(key) }

func (d *deliveryGateway) sign(key string, expires time.Time) (string, error) {
	if !deliveryKeyValid(key) {
		return "", errors.New("invalid provider media object")
	}
	body, err := json.Marshal(deliveryGrant{Key: key, ExpiresAt: expires.Unix()})
	if err != nil {
		return "", err
	}
	nonce := make([]byte, d.cipher.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	token := d.cipher.Seal(nonce, nonce, body, []byte(deliveryPurpose))
	return d.origin + deliveryPath(key) + "?token=" + base64.RawURLEncoding.EncodeToString(token), nil
}

func (d *deliveryGateway) open(token string) (deliveryGrant, bool) {
	var grant deliveryGrant
	if len(token) > 4096 {
		return grant, false
	}
	sealed, err := base64.RawURLEncoding.DecodeString(token)
	n := d.cipher.NonceSize()
	if err != nil || len(sealed) < n+d.cipher.Overhead() {
		return grant, false
	}
	body, err := d.cipher.Open(nil, sealed[:n], sealed[n:], []byte(deliveryPurpose))
	now := time.Now().Unix()
	if err != nil || json.Unmarshal(body, &grant) != nil || !deliveryKeyValid(grant.Key) || grant.ExpiresAt <= now || grant.ExpiresAt > now+int64(deliveryLifetime.Seconds()) {
		return deliveryGrant{}, false
	}
	return grant, true
}

// ProviderDeliveryHandler streams only an object authorized at publish time.
// The encrypted, expiring grant replaces the existing 24-hour S3 capability;
// it grants neither bucket listing nor a caller-selected upstream URL.
func (s *S3Store) ProviderDeliveryHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
		if s == nil || s.delivery == nil {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		grant, ok := s.delivery.open(r.URL.Query().Get("token"))
		if !ok || r.URL.Path != deliveryPath(grant.Key) {
			http.Error(w, "media grant is invalid or expired", http.StatusForbidden)
			return
		}
		rangeHeader := r.Header.Get("Range")
		if rangeHeader != "" && !deliveryRange.MatchString(rangeHeader) {
			http.Error(w, "invalid media range", http.StatusRequestedRangeNotSatisfiable)
			return
		}
		// A provider may pull a large video for longer than the API's deadline.
		if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Minute)); err != nil && !errors.Is(err, http.ErrNotSupported) {
			http.Error(w, "media stream unavailable", http.StatusServiceUnavailable)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
		defer cancel()
		if r.Method == http.MethodHead {
			object, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(grant.Key)})
			if err != nil {
				deliveryError(w, err)
				return
			}
			deliveryHeaders(w, grant.Key, aws.ToString(object.ContentType), object.ContentLength)
			return
		}
		input := &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(grant.Key)}
		if rangeHeader != "" {
			input.Range = aws.String(rangeHeader)
		}
		object, err := s.client.GetObject(ctx, input)
		if err != nil {
			deliveryError(w, err)
			return
		}
		defer object.Body.Close()
		deliveryHeaders(w, grant.Key, aws.ToString(object.ContentType), object.ContentLength)
		if object.ContentRange != nil {
			w.Header().Set("Content-Range", *object.ContentRange)
			w.WriteHeader(http.StatusPartialContent)
		}
		if _, err := io.Copy(w, object.Body); err != nil {
			// Never turn a truncated transfer into a successful complete response.
			panic(http.ErrAbortHandler)
		}
	})
}

func deliveryHeaders(w http.ResponseWriter, key, mediaType string, size *int64) {
	if mediaType == "" {
		mediaType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", mediaType)
	if size != nil && *size >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(*size, 10))
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Content-Disposition", `attachment; filename="media`+path.Ext(key)+`"`)
}

func deliveryError(w http.ResponseWriter, err error) {
	status := http.StatusBadGateway
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.ErrorCode() {
		case "NoSuchKey", "NotFound", "404":
			status = http.StatusNotFound
		case "InvalidRange":
			status = http.StatusRequestedRangeNotSatisfiable
		}
	}
	// Storage errors can contain private keys or URLs; expose only a fixed message.
	http.Error(w, "media could not be read", status)
}
