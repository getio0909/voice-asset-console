<script setup lang="ts">
import type { DeepReadonly } from 'vue'

import type { TranscriptSegment } from '@/api/client'

type TimelineSegment = DeepReadonly<TranscriptSegment>

defineProps<{
  segments: readonly TimelineSegment[]
  currentTimeMs: number
}>()

const emit = defineEmits<{
  seek: [milliseconds: number]
}>()

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000))
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const core = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  return hours > 0 ? `${hours.toString().padStart(2, '0')}:${core}` : core
}

function isActive(segment: TimelineSegment, currentTimeMs: number): boolean {
  return currentTimeMs >= segment.start_ms && currentTimeMs < segment.end_ms
}
</script>

<template>
  <ol class="transcript-timeline" aria-label="Timestamped raw transcript">
    <li
      v-for="segment in segments"
      :key="segment.id"
      class="transcript-segment"
      :class="{ 'transcript-segment--active': isActive(segment, currentTimeMs) }"
    >
      <button
        type="button"
        class="transcript-segment__seek"
        :aria-label="`Seek audio to ${formatTimestamp(segment.start_ms)}`"
        :aria-current="isActive(segment, currentTimeMs) ? 'true' : undefined"
        @click="emit('seek', segment.start_ms)"
      >
        {{ formatTimestamp(segment.start_ms) }}
      </button>
      <div>
        <span v-if="segment.speaker" class="transcript-segment__speaker">
          {{ segment.speaker }}
        </span>
        <p>{{ segment.text }}</p>
      </div>
    </li>
  </ol>
</template>
