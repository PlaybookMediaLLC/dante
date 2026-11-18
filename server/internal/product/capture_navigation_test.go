package product

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/PlaybookMediaLLC/screenshot-studio/services/internal/capture/browser"
)

func TestNavigationPromptStaysWithinItsBudget(t *testing.T) {
	// Each "<" is escaped to six bytes, so labels are as large as the page can make them.
	label := strings.Repeat("<", 120)
	view := browser.NavigationObservation{Path: "/reports", Headings: []string{"Reports"}, Ready: true}
	for range 12 {
		view.Current = append(view.Current, label)
	}
	for i := range 60 {
		view.Controls = append(view.Controls, browser.NavigationControl{ID: i, Kind: "tab", Label: fmt.Sprintf("Tab %d", i)})
	}
	sent := func(objective string, view browser.NavigationObservation) browser.NavigationObservation {
		t.Helper()
		prompt, ok := navigationPrompt(objective, "", view)
		if !ok || len(prompt) > 16_000 {
			t.Fatalf("ok=%v length=%d", ok, len(prompt))
		}
		var input struct {
			Observation browser.NavigationObservation `json:"untrustedObservation"`
		}
		if err := json.Unmarshal([]byte(prompt), &input); err != nil {
			t.Fatal(err)
		}
		return input.Observation
	}

	// Controls go first and keep their IDs.
	got := sent(strings.Repeat("<", 1000), view)
	if len(got.Controls) == 0 || len(got.Controls) == 60 || len(got.Current) != 12 || !got.Ready {
		t.Fatalf("controls=%d current=%d ready=%v", len(got.Controls), len(got.Current), got.Ready)
	}
	for i, control := range got.Controls {
		if control.ID != i || control.Label != fmt.Sprintf("Tab %d", i) {
			t.Fatalf("control %d became %+v", i, control)
		}
	}

	// Then context, before the headings that name the screen.
	for range 12 {
		view.Headings = append(view.Headings, label)
	}
	got = sent(strings.Repeat("<", 1000), view)
	if len(got.Controls) != 0 || len(got.Current) == 12 || len(got.Headings) != 13 {
		t.Fatalf("controls=%d current=%d headings=%d", len(got.Controls), len(got.Current), len(got.Headings))
	}
}
