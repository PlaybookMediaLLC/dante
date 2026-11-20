/**
 * Analytics utility — PostHog only
 *
 * PostHog is initialized in instrumentation-client.ts with defaults: '2026-01-30'.
 * Pageviews, clicks, and interactions are captured automatically.
 */

import type { PostHog } from 'posthog-js';
import { readConsent } from '@/lib/consent';

let posthog: PostHog | null = null;

/**
 * PostHog, downloaded only once a visitor accepts analytics
 * (instrumentation-client.ts), so it stays out of every page's bundle.
 */
export async function loadPostHog(): Promise<PostHog> {
  posthog ??= (await import('posthog-js')).default;
  return posthog;
}

/**
 * Use PostHog now, or once it has loaded for a visitor who accepted analytics.
 * Without consent or a key it does nothing, as an uninitialized PostHog would.
 */
function withPostHog(apply: (instance: PostHog) => void, failure: string): void {
  const run = (instance: PostHog) => {
    if (!readConsent()?.analytics) return;
    try {
      apply(instance);
    } catch (error) {
      console.warn(failure, error);
    }
  };
  if (posthog) return run(posthog);
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !readConsent()?.analytics) return;
  loadPostHog().then(run, (error: unknown) => console.warn(failure, error));
}

// =============================================================================
// Core Tracking Functions
// =============================================================================

/**
 * Check if analytics should be enabled
 */
function shouldTrack(): boolean {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return false;
  }

  return true;
}

/**
 * Safely track a custom event with PostHog
 */
export function trackEvent(
  eventName: string,
  eventData?: Record<string, string | number | boolean>
): void {
  if (!shouldTrack()) {
    return;
  }

  withPostHog((instance) => instance.capture(eventName, eventData), '[PostHog] Failed:');
}

/**
 * Identify a user in PostHog (for future auth integration)
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, string | number | boolean>
): void {
  withPostHog((instance) => instance.identify(userId, properties), '[PostHog] Identify failed:');
}

/**
 * Reset user identity (call on logout)
 */
export function resetUser(): void {
  withPostHog((instance) => instance.reset(), '[PostHog] Reset failed:');
}

// =============================================================================
// Image Upload
// =============================================================================

export function trackImageUpload(source: 'file' | 'paste' | 'drop' | 'url', fileSize?: number): void {
  trackEvent('image_upload', {
    source,
    file_size_kb: fileSize ? Math.round(fileSize / 1024) : 0,
  });
}

// =============================================================================
// Export Events
// =============================================================================

export function trackExportStart(format: string, quality: string, scale: number): void {
  trackEvent('export_start', { format, quality, scale });
}

export function trackExportComplete(
  format: string,
  quality: string,
  scale: number,
  fileSizeKb: number,
  durationMs: number
): void {
  trackEvent('export_complete', { format, quality, scale, file_size_kb: fileSizeKb, duration_ms: durationMs });
}

export function trackExportError(format: string, error: string): void {
  trackEvent('export_error', { format, error: error.substring(0, 100) });
}

export function trackCopyToClipboard(success: boolean): void {
  trackEvent('copy_to_clipboard', { success });
}

// =============================================================================
// Feature Usage — high-level actions that help understand what people use
// =============================================================================

export function trackBackgroundChange(
  type: 'gradient' | 'solid' | 'image' | 'transparent',
  value?: string
): void {
  trackEvent('background_change', { type, value: value?.substring(0, 50) || '' });
}

export function trackEffectApply(
  effectType: 'shadow' | 'border' | 'radius' | 'blur' | 'noise' | 'filter' | '3d_transform',
  value?: string | number
): void {
  trackEvent('effect_apply', { effect_type: effectType, value: String(value || '').substring(0, 50) });
}

export function trackFrameApply(frameType: string): void {
  trackEvent('frame_apply', { frame_type: frameType });
}

export function trackPresetApply(presetId: string, presetName: string): void {
  trackEvent('preset_apply', { preset_id: presetId, preset_name: presetName.substring(0, 50) });
}

export function trackOverlayAdd(overlayType: 'text' | 'image' | 'sticker'): void {
  trackEvent('overlay_add', { overlay_type: overlayType });
}

export function trackAspectRatioChange(ratio: string): void {
  trackEvent('aspect_ratio_change', { ratio });
}

export function trackAnimationClipAdd(presetId: string, presetName: string, duration: number): void {
  trackEvent('animation_clip_add', { preset_id: presetId, preset_name: presetName.substring(0, 50), duration_ms: duration });
}

// =============================================================================
// Session & Navigation
// =============================================================================

export function trackSessionStart(): void {
  trackEvent('session_start', {
    referrer: typeof document !== 'undefined' ? (document.referrer || 'direct').substring(0, 100) : 'unknown',
  });
}

export function trackEditorOpen(): void {
  trackEvent('editor_open', {});
}

export function trackCTAClick(location: string, label: string): void {
  trackEvent('cta_click', { location, label: label.substring(0, 50) });
}

// =============================================================================
// Errors
// =============================================================================

export function trackError(errorType: string, message: string): void {
  trackEvent('error', { error_type: errorType, message: message.substring(0, 200) });
}
