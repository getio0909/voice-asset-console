import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TranscriptTimeline from './TranscriptTimeline.vue'

const segments = [
  {
    id: 'segment-1',
    ordinal: 0,
    start_ms: 0,
    end_ms: 1_500,
    speaker: 'Speaker 1',
    text: 'Opening note.',
    confidence: 0.99,
    words: [],
  },
  {
    id: 'segment-2',
    ordinal: 1,
    start_ms: 1_500,
    end_ms: 3_000,
    speaker: null,
    text: 'Second note.',
    confidence: 0.97,
    words: [],
  },
]

describe('TranscriptTimeline', () => {
  it('marks the synchronized segment and emits an exact seek time', async () => {
    const wrapper = mount(TranscriptTimeline, {
      props: { segments, currentTimeMs: 1_800 },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons[0]?.attributes('aria-current')).toBeUndefined()
    expect(buttons[1]?.attributes('aria-current')).toBe('true')
    expect(buttons[1]?.text()).toBe('00:01')

    await buttons[1]?.trigger('click')
    expect(wrapper.emitted('seek')).toEqual([[1_500]])
  })
})
