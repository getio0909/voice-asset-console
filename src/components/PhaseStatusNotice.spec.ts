import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PhaseStatusNotice from './PhaseStatusNotice.vue'

describe('PhaseStatusNotice', () => {
  it('describes the implemented slice without claiming the full product', () => {
    const wrapper = mount(PhaseStatusNotice, {
      props: { contractVersion: '0.7.0' },
    })

    expect(wrapper.get('h2').text()).toBe('Reviewable correction workflow')
    expect(wrapper.text()).toContain('Broader lifecycle administration remains planned')
    expect(wrapper.get('code').text()).toBe('0.7.0')
  })
})
