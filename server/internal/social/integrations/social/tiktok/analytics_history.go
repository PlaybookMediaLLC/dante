package tiktok

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/PlaybookMediaLLC/screenshot-studio/services/internal/social/integrations"
	"github.com/PlaybookMediaLLC/screenshot-studio/services/internal/social/temporalx"
)

// analyticsError gives a refused grant or a rate limit the HTTP status that
// analytics ingestion reads, so it asks for a reconnect or waits instead of
// retrying hourly.
func analyticsError(err error) error {
	switch temporalx.FailureType(err) {
	case temporalx.TypeRefreshToken, temporalx.TypeDisconnect:
		return &integrations.HTTPError{Status: http.StatusUnauthorized}
	case temporalx.TypeRateLimited:
		return &integrations.HTTPError{Status: http.StatusTooManyRequests, Retry: time.Now().Add(temporalx.RetryAfter(err))}
	}
	return err
}

// CurrentMetrics reads the account's current follower count (user.info.stats).
func (p *Provider) CurrentMetrics(ctx context.Context, _, token string) (map[string]float64, error) {
	res, err := p.Fetch(ctx, apiURL+"/v2/user/info/?fields=follower_count", integrations.Request{
		Headers: map[string]string{"Authorization": "Bearer " + token},
	})
	if err != nil {
		return nil, analyticsError(err)
	}
	var reply struct {
		Data struct {
			User struct {
				Followers *int64 `json:"follower_count"`
			} `json:"user"`
		} `json:"data"`
	}
	if err := res.JSON(&reply); err != nil {
		return nil, err
	}
	result := map[string]float64{}
	if n := reply.Data.User.Followers; n != nil {
		result["followers"] = float64(*n)
	}
	return result, nil
}

// PublishedMetrics imports the account's public videos created since a date
// (video.list), newest first, at most 200. Counters use the keys PostMetrics
// gives the same video, so a later per-post poll continues the same series.
func (p *Provider) PublishedMetrics(ctx context.Context, _, token string, since time.Time) ([]integrations.PublishedMetricPost, error) {
	result := []integrations.PublishedMetricPost{}
	var cursor int64
	for page := 0; page < 10; page++ {
		request := map[string]any{"max_count": 20}
		if cursor != 0 {
			request["cursor"] = cursor
		}
		body, _ := json.Marshal(request)
		res, err := p.Fetch(ctx, apiURL+"/v2/video/list/?fields=id,create_time,title,video_description,share_url,view_count,like_count,comment_count,share_count", integrations.Request{
			Method:    http.MethodPost,
			Headers:   map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + token},
			Body:      body,
			Retryable: true, // a read sent as POST
		})
		if err != nil {
			return nil, analyticsError(err)
		}
		var reply struct {
			Data struct {
				Videos []struct {
					ID          string `json:"id"`
					CreatedAt   int64  `json:"create_time"`
					Title       string `json:"title"`
					Description string `json:"video_description"`
					ShareURL    string `json:"share_url"`
					Views       *int64 `json:"view_count"`
					Likes       *int64 `json:"like_count"`
					Comments    *int64 `json:"comment_count"`
					Shares      *int64 `json:"share_count"`
				} `json:"videos"`
				Cursor  int64 `json:"cursor"`
				HasMore bool  `json:"has_more"`
			} `json:"data"`
		}
		if err := res.JSON(&reply); err != nil {
			return nil, err
		}
		for _, video := range reply.Data.Videos {
			at := time.Unix(video.CreatedAt, 0).UTC()
			if at.Before(since) {
				continue
			}
			text := video.Description
			if text == "" {
				text = video.Title
			}
			row := integrations.PublishedMetricPost{
				ID: video.ID, Text: text, At: at, Counters: map[string]float64{},
				// share_url carries tracking params (the app's client key among them)
				URL: strings.Split(video.ShareURL, "?")[0],
			}
			for key, n := range map[string]*int64{"views": video.Views, "likes": video.Likes, "replies": video.Comments, "reposts": video.Shares} {
				if n != nil {
					row.Counters[key] = float64(*n)
				}
			}
			result = append(result, row)
		}
		// Videos come newest first: stop once a page reaches before the window.
		videos := reply.Data.Videos
		if !reply.Data.HasMore || len(videos) == 0 || time.Unix(videos[len(videos)-1].CreatedAt, 0).Before(since) || reply.Data.Cursor == cursor {
			break
		}
		cursor = reply.Data.Cursor
	}
	return result, nil
}
