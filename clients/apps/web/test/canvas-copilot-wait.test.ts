import assert from 'node:assert/strict'
import test from 'node:test'
import { type EditorOpenState, waitForArtboard } from '@/lib/canvas/copilot-wait'

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
