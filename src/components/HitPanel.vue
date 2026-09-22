<script setup lang="ts">
import type { RuleHit } from "../domain/types";

defineProps<{ hits: RuleHit[] }>();
</script>

<template>
  <ul class="hit-list">
    <li v-for="(hit, i) in hits" :key="i" class="hit-item">
      <div class="hit-top">
        <span class="hit-rule">{{ hit.ruleName }}</span>
        <span class="hit-field">{{ hit.field }}</span>
      </div>
      <p class="hit-original">原值：{{ hit.original }}</p>
      <p class="hit-detail">{{ hit.detail }}</p>
    </li>
  </ul>
</template>
