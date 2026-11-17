package browser

import (
	"context"
	"encoding/json"
	"net/url"
	"slices"
	"strings"
	"time"
)

// NavigationControl is an observed navigation choice, never model-supplied code.
type NavigationControl struct {
	ID       int    `json:"id"`
	Kind     string `json:"kind"`
	Label    string `json:"label"`
	Path     string `json:"path,omitempty"`
	selector string
}

// NavigationObservation contains paths, headings and navigation labels. Input
// values, account elements, masked content and URL queries never reach a model.
type NavigationObservation struct {
	Path     string              `json:"path"`
	Headings []string            `json:"headings"`
	Controls []NavigationControl `json:"controls"`
	Ready    bool                `json:"ready"`
	loading  bool
}

// NavigationChoice must select an ID from the latest observation, capture a
// proven destination, or stop. The browser revalidates every choice.
type NavigationChoice struct {
	Action    string `json:"action"`
	ControlID *int   `json:"controlId"`
}

// NavigationAction records the executed action without page text or secrets.
type NavigationAction struct {
	Kind string `json:"kind"`
	Path string `json:"path"`
}

// NextNavigationAction is supplied by the product's existing model and meter.
type NextNavigationAction func(context.Context, NavigationObservation) (NavigationChoice, error)

const (
	NavigationUnavailable Code = "navigation_unavailable"
	// NavigationUnconfigured is final: this worker has no model or meter, so
	// retrying here until the job's deadline could never succeed.
	NavigationUnconfigured Code = "navigation_unconfigured"
	NavigationInvalid      Code = "navigation_invalid"
	NavigationFailed       Code = "navigation_failed"
	NavigationLimit        Code = "navigation_limit"
	NavigationBudget       Code = "navigation_budget"
	NavigationRetryLimit   Code = "navigation_retry_limit"
)

// No arbitrary click: navigation links, explicit tabs, and buttons that open
// menus, panels or dialogs. Links navigate directly, so their click handlers
// cannot submit forms or open other windows. A button inside a form, one that
// submits or resets, or one whose label names a risky action is never offered;
// the network policy still refuses every write a click might attempt.
const observeNavigation = `(identity, masks, markers, account) => {
 const visible = e => !!e && e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
 const excluded = e => { const selectors=[identity,...(masks || []),'form','[contenteditable=true]'].filter(Boolean).join(','); return !!e.closest(selectors) || !!e.querySelector(selectors); };
 const text = e => (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g,' ').replace(/[^\s@]+@[^\s@]+/g,'[private]').split(account).join('[account]').slice(0,120);
 const mentionsAccount = e => (e.innerText || e.getAttribute('aria-label') || '').includes(account);
 const selector = e => { const parts=[]; while(e && e.tagName!=='HTML' && parts.length<12) {
   const siblings=Array.from(e.parentElement.children);
   parts.unshift(':nth-child('+(siblings.indexOf(e)+1)+')'); e=e.parentElement;
 } const path=parts.join('>'); return document.querySelectorAll(path).length===1?path:''; };
 const links = Array.from(document.querySelectorAll('nav a[href],[role=navigation] a[href],[role=tab]'));
 const buttons = Array.from(document.querySelectorAll('` + pressableSelector + `')).filter(e => !links.includes(e) && ` + pressableCheck + `);
 const controls = [...links, ...buttons]
   .filter(e => visible(e) && !excluded(e) && !mentionsAccount(e) && !e.hasAttribute('download') && e.getAttribute('aria-disabled')!=='true' && !e.disabled && e.getAttribute('aria-selected')!=='true')
   .slice(0,60).map(e => ({kind:e.getAttribute('role')==='tab'?'tab':links.includes(e)?'link':'button',label:text(e),href:e.href || '',selector:selector(e)}));
 return {headings:Array.from(document.querySelectorAll('h1,h2,[role=heading]')).filter(e=>visible(e)&&!excluded(e)).slice(0,12).map(text),controls,
   loading:Array.from(document.querySelectorAll('[aria-busy=true],[role=progressbar]')).some(visible),
   ready:markers.every(s=>Array.from(document.querySelectorAll(s)).some(visible))};
}`

// pressableSelector finds buttons and the controls that open menus, panels and
// dialogs. Anchors never count: a link is followed only from navigation.
const pressableSelector = `button,[role=button],[aria-haspopup],[aria-expanded],[role=menuitem],summary`

// pressableCheck refuses a control whose press could submit, reset or name a
// risky action; e is the element. The same check runs before every press.
const pressableCheck = `!e.matches('a[href],input,[form],button[type=submit],button[type=reset]') && !e.closest('form') &&
 !/\b(delete|remove|destroy|erase|sign ?out|log ?out|unsubscribe|cancel|buy|purchase|pay|checkout|publish|send|submit|save|invite|confirm|revoke|leave|transfer|deactivate|disable|reset|archive|approve|reject|merge|deploy|uninstall|disconnect)\b/i.test(e.innerText || e.getAttribute('aria-label') || '')`

func navigationPath(raw, origin string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme+"://"+u.Host != origin || u.User != nil || u.RawQuery != "" || u.Fragment != "" || !ValidPath(u.EscapedPath()) {
		return "", false
	}
	for _, segment := range strings.FieldsFunc(strings.ToLower(u.Path), func(r rune) bool { return r == '/' || r == '-' || r == '_' || r == '.' }) {
		switch segment {
		case "api", "auth", "login", "logout", "signin", "signout", "delete", "remove", "destroy", "checkout", "unsubscribe":
			return "", false
		}
	}
	return u.EscapedPath(), true
}

func (s *scope) observeNavigation(ctx context.Context, input RunInput) (NavigationObservation, error) {
	view := NavigationObservation{Headings: []string{}, Controls: []NavigationControl{}}
	here, err := s.location()
	if err != nil || here.Scheme+"://"+here.Host != input.Target.Origin || s.privateResponse.Load() {
		return view, &Failure{Code: OriginRefused}
	}
	view.Path = here.EscapedPath()
	if err := s.checkIdentity(ctx, input.Target, view.Path); err != nil {
		return view, err
	}
	result, err := s.page.Context(ctx).Eval(observeNavigation, input.Target.IdentitySelector, input.Recipe.Masks, input.Recipe.Markers, input.Target.ExpectedAccount)
	if err != nil {
		return view, &Failure{Code: PageFailed}
	}
	var snapshot struct {
		Headings []string `json:"headings"`
		Ready    bool     `json:"ready"`
		Loading  bool     `json:"loading"`
		Controls []struct {
			Kind, Label, Href, Selector string
		} `json:"controls"`
	}
	if err := json.Unmarshal([]byte(result.Value.JSON("", "")), &snapshot); err != nil {
		return view, &Failure{Code: PageFailed}
	}
	view.Headings, view.Ready = snapshot.Headings, snapshot.Ready
	view.loading = snapshot.Loading
	view.Ready = view.Ready && !view.loading
	for _, control := range snapshot.Controls {
		if control.Label == "" || (control.Kind != "link" && !ValidSelector(control.Selector)) {
			continue
		}
		path := ""
		if control.Kind == "link" {
			var allowed bool
			path, allowed = navigationPath(control.Href, input.Target.Origin)
			if !allowed || path == view.Path {
				continue
			}
		}
		view.Controls = append(view.Controls, NavigationControl{ID: len(view.Controls), Kind: control.Kind, Label: control.Label, Path: path, selector: control.Selector})
	}
	return view, nil
}

// Wait for feature evidence or new navigation, not just a selected tab attribute.
func (s *scope) waitNavigation(ctx context.Context, input RunInput, before NavigationObservation) error {
	waitCtx, cancel := context.WithTimeout(ctx, defaultStepTimeout)
	defer cancel()
	for {
		view, err := s.observeNavigation(waitCtx, input)
		if err != nil {
			return err
		}
		changed := view.Path != before.Path || (!before.Ready && view.Ready) || !slices.Equal(view.Headings, before.Headings)
		for _, control := range view.Controls {
			if !slices.ContainsFunc(before.Controls, func(old NavigationControl) bool {
				return old.Kind == control.Kind && old.Label == control.Label && old.Path == control.Path
			}) {
				changed = true
			}
		}
		if !view.loading && changed {
			return nil
		}
		select {
		case <-waitCtx.Done():
			return &Failure{Code: NavigationFailed}
		case <-time.After(150 * time.Millisecond):
		}
	}
}

// pressButton presses the observed button only if it is still the same safe,
// visible, enabled control with the same label.
func (s *scope) pressButton(ctx context.Context, selector, label string) error {
	pressed, err := s.evalBool(ctx, `(selector, expected) => {
		const e = document.querySelector(selector);
		if (!e || !e.matches('`+pressableSelector+`') || !(`+pressableCheck+`)) return false;
		if ((e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g,' ').replace(/[^\s@]+@[^\s@]+/g,'[private]').slice(0,120) !== expected ||
			!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) || e.disabled || e.getAttribute('aria-disabled')==='true') return false;
		e.click(); return true;
	}`, selector, label)
	if err != nil {
		return &Failure{Code: PageFailed}
	}
	if !pressed {
		return &Failure{Code: NavigationInvalid}
	}
	return nil
}

func (s *scope) navigateFeature(ctx context.Context, input RunInput) ([]NavigationAction, error) {
	if input.NextNavigation == nil {
		return nil, &Failure{Code: NavigationUnavailable}
	}
	actions := []NavigationAction{}
	seen := map[string]bool{}
	for step := 0; step <= input.Recipe.Navigation.MaxSteps; step++ {
		view, err := s.observeNavigation(ctx, input)
		if err != nil {
			return actions, err
		}
		modelCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		choice, err := input.NextNavigation(modelCtx, view)
		cancel()
		if err != nil {
			return actions, err
		}
		if choice.ControlID == nil {
			return actions, &Failure{Code: NavigationInvalid}
		}
		switch choice.Action {
		case "capture":
			if *choice.ControlID != -1 || !view.Ready {
				return actions, &Failure{Code: NavigationInvalid}
			}
			current, err := s.observeNavigation(ctx, input)
			if err != nil {
				return actions, err
			}
			if !current.Ready || current.Path != view.Path {
				return actions, &Failure{Code: NavigationInvalid}
			}
			framed, err := s.evalBool(ctx, `(selector) => {
				const e=Array.from(document.querySelectorAll(selector)).find(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
				if (!e) return false;
				e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
				const r=e.getBoundingClientRect();
				return r.bottom>0 && r.right>0 && r.top<innerHeight && r.left<innerWidth;
			}`, input.Recipe.Markers[0])
			if err != nil || !framed {
				return actions, &Failure{Code: MarkerMissing}
			}
			actions = append(actions, NavigationAction{Kind: "frame", Path: view.Path})
			return actions, nil
		case "stop":
			return actions, &Failure{Code: NavigationFailed}
		case "select":
			if *choice.ControlID < 0 || *choice.ControlID >= len(view.Controls) {
				return actions, &Failure{Code: NavigationInvalid}
			}
		default:
			return actions, &Failure{Code: NavigationInvalid}
		}
		if step == input.Recipe.Navigation.MaxSteps {
			return actions, &Failure{Code: NavigationLimit}
		}
		control := view.Controls[*choice.ControlID]
		key := view.Path + ":" + control.Kind + ":" + control.Path + ":" + control.selector
		if seen[key] {
			return actions, &Failure{Code: NavigationLimit}
		}
		seen[key] = true
		switch control.Kind {
		case "link":
			err = s.navigate(ctx, input.Target, control.Path, defaultStepTimeout)
		case "tab":
			err = s.selectTab(ctx, Step{Selector: control.selector}, view.Path, control.Label)
		case "button":
			err = s.pressButton(ctx, control.selector, control.Label)
		default:
			return actions, &Failure{Code: NavigationInvalid}
		}
		if err != nil {
			return actions, err
		}
		if err := s.waitNavigation(ctx, input, view); err != nil {
			return actions, err
		}
		s.settle(ctx)
		path := control.Path
		if path == "" {
			path = view.Path
		}
		actions = append(actions, NavigationAction{Kind: control.Kind, Path: path})
	}
	return actions, &Failure{Code: NavigationLimit}
}
