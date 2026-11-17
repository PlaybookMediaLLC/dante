//go:build !unix

package helpers

import (
	"testing"
	"time"
)

var clockStart = time.Now()

// cpuTime falls back to the clock where getrusage does not exist.
func cpuTime(t *testing.T) time.Duration {
	t.Helper()
	return time.Since(clockStart)
}
