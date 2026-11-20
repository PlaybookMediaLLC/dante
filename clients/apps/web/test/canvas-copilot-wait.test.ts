import assert from 'node:assert/strict'
import test from 'node:test'
import { ACROSS_ARTBOARDS, type EditorOpenState, waitForArtboard } from '@/lib/canvas/copilot-wait'

const editor = (state: Partial<EditorOpenState>): EditorOpenState => ({
  activeId: null,
  error: null,
  mounted: true,
  ready: false,
  ...state,
})

test('a request waits for its artboard to open, then load, then starts', () => {
  assert.deepEqual(waitForArtboard(editor({}), 'a', false), { kind: 'wait', seen: false })
  assert.deepEqual(waitForArtboard(editor({ activeId: 'a' }), 'a', false), {
    kind: 'wait',
    seen: true,
  })
  assert.deepEqual(waitForArtboard(editor({ activeId: 'a', ready: true }), 'a', true), {
    kind: 'start',
  })
})

test('a request never edits another artboard, and ends when its own fails or closes', () => {
  assert.equal(waitForArtboard(editor({ activeId: 'b', ready: true }), 'a', false).kind, 'fail')
  assert.match(
    (
      waitForArtboard(editor({ activeId: 'a', error: 'No fonts' }), 'a', true) as {
        message: string
      }
    ).message,
    /could not open: No fonts/
  )
  // Its artboard was open, then nothing is: it closed before the copilot started.
  assert.equal(waitForArtboard(editor({}), 'a', true).kind, 'fail')
  assert.deepEqual(waitForArtboard(editor({ activeId: 'a', mounted: false }), 'a', true), {
    kind: 'fail',
    message: 'Stopped: the canvas was closed.',
  })
})

test('a request about every artboard, slide or page runs across the canvas', () => {
  for (const ask of [
    'Make the headline punchier on every artboard',
    'Give all slides a darker background',
    'Tighten the spacing on each page',
    'Make all the artboards match',
  ])
    assert.ok(ACROSS_ARTBOARDS.test(ask), ask)
  for (const ask of [
    'Make the headline punchier',
    'Make every headline punchier',
    'Add every feature to the list',
    'All good. Now darken this slide',
  ])
    assert.equal(ACROSS_ARTBOARDS.test(ask), false, ask)
})

test('moving across the canvas, the previous artboard may stay open until the switch', () => {
  const moving = (state: Partial<EditorOpenState>, seen = false) =>
    waitForArtboard(editor(state), 'b', seen, 'a')
  // Still on the previous artboard: wait for the editor to switch.
  assert.deepEqual(moving({ activeId: 'a', ready: true }), { kind: 'wait', seen: false })
  assert.deepEqual(moving({ activeId: 'b', ready: false }), { kind: 'wait', seen: true })
  assert.deepEqual(moving({ activeId: 'b', ready: true }), { kind: 'start' })
  // A third artboard, or the previous one back after the target was seen, still fails.
  assert.equal(moving({ activeId: 'c', ready: true }).kind, 'fail')
  assert.equal(moving({ activeId: 'a', ready: true }, true).kind, 'fail')
})
