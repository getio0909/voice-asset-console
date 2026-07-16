import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import InitializationNotice from './InitializationNotice.vue'

describe('InitializationNotice', () => {
  it('states that server-backed features are not implemented', () => {
    const wrapper = mount(InitializationNotice, {
      props: { contractVersion: '0.1.0' },
    })

    expect(wrapper.get('h2').text()).toBe('Project initialization in progress')
    expect(wrapper.text()).toContain('not implemented yet')
    expect(wrapper.get('code').text()).toBe('0.1.0')
  })
})
