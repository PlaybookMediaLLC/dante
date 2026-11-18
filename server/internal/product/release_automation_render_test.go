package product

import (
	"slices"
	"strings"
	"testing"
	"time"

	automation "github.com/PlaybookMediaLLC/screenshot-studio/services/internal/releaseautomation"
)

// The web verifies this exact vector in test/workflow-contracts.test.ts, so
// the Go signer and the TypeScript verifier cannot drift apart.
func TestWorkflowRenderSignatureMatchesTheWebVerifier(t *testing.T) {
	got := SignWorkflowRender([]byte(strings.Repeat("k", 40)), []byte(`{"organizationId":"org"}`), time.Unix(1792454400, 0))
	if want := "t=1792454400,v1=8e82175971c0945959d8004b2d126c6b4631ba7f718daaf2e9a1126ce8d64d76"; got != want {
		t.Fatalf("got %s want %s", got, want)
	}
}

func TestAutomationDraftMediaPrefersOneRenderPerCapturedChange(t *testing.T) {
	for name, test := range map[string]struct {
		input automation.Outputs
		want  []string
	}{
		"capture only":             {automation.Outputs{CaptureAssetID: "c1"}, []string{"c1"}},
		"captures only":            {automation.Outputs{CaptureAssetID: "c1", CaptureAssetIDs: []string{"c1", "c2"}}, []string{"c1", "c2"}},
		"one capture, three looks": {automation.Outputs{CaptureAssetID: "c1", RenderedAssetIDs: []string{"r1", "r2", "r3"}}, []string{"r1"}},
		"a render per change":      {automation.Outputs{CaptureAssetID: "c1", CaptureAssetIDs: []string{"c1", "c2"}, RenderedAssetIDs: []string{"r1", "r2"}}, []string{"r1", "r2"}},
	} {
		if got := automationDraftMedia(test.input); !slices.Equal(got, test.want) {
			t.Errorf("%s: got %v want %v", name, got, test.want)
		}
	}
}

// A release-matched capture asks the model and runs signed-in recipes, so
// activation needs a worker with both.
func TestReleaseMatchedCaptureNeedsAIAndABrowser(t *testing.T) {
	graph := automation.Graph{Nodes: []automation.Node{{ID: "capture", Type: "action", Action: &automation.Action{Type: "capture_product", MatchRelease: true, CreditLimit: 5}}}}
	if got := requiredCapabilities(graph); !slices.Contains(got, automation.CapabilityAI) || !slices.Contains(got, automation.CapabilityBrowser) || len(got) != 2 {
		t.Fatalf("capabilities=%v", got)
	}
}

func TestAutomationHeadlineText(t *testing.T) {
	for copy, want := range map[string]string{
		"Release 2.4\n\nNotes follow.":                 "Release 2.4",
		"Export reports as CSV. Teams asked for it.":   "Export reports as CSV.",
		"Version 2.4.1 ships faster search! More soon": "Version 2.4.1 ships faster search!",
		"  Plain line without a stop  ":                "Plain line without a stop",
		"":                                             "",
	} {
		if got := firstSentence(copy); got != want {
			t.Errorf("firstSentence(%q)=%q want %q", copy, got, want)
		}
	}
}
