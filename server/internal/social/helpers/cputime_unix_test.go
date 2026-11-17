//go:build unix

package helpers

import (
	"syscall"
	"testing"
	"time"
)

// cpuTime is the CPU time this test process has used. A scan's cost is read
// from it rather than the clock: on a runner busy with other packages' tests,
// the clock stretched a linear scan that takes 240 ms idle past a second.
func cpuTime(t *testing.T) time.Duration {
	t.Helper()
	var usage syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
		t.Fatalf("getrusage: %v", err)
	}
	return time.Duration(usage.Utime.Nano() + usage.Stime.Nano())
}
