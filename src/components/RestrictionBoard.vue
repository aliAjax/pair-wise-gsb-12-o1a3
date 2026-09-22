<script setup lang="ts">
import { computed } from "vue";
import { toLocalInput, weekdayOf, WEEKDAY_LABELS } from "../domain/dates";
import { REGIONS } from "../domain/fleet";
import { useDispatchStore } from "../store/dispatch";

const store = useDispatchStore();

const today = toLocalInput(new Date()).slice(0, 10);
const todayWeekday = weekdayOf(today);

/** 今日各区域限行摘要 */
const todaySummary = computed(() =>
  REGIONS.map((region) => {
    const parts: string[] = [];
    for (const rule of store.rules.filter((r) => r.region === region)) {
      if (rule.kind === "tail") {
        const digits = rule.schedule[todayWeekday];
        if (digits?.length) parts.push(`尾号 ${digits.join("/")}`);
      } else if (rule.weekdays.includes(todayWeekday)) {
        parts.push(`${rule.levels.join("/")} 禁行`);
      }
    }
    return { region, parts };
  }),
);
</script>

<template>
  <section class="panel">
    <h2>区域限行规则</h2>
    <p class="today-line">今日 {{ today.slice(5) }} {{ WEEKDAY_LABELS[todayWeekday] }}</p>

    <div class="today-chips">
      <div v-for="item in todaySummary" :key="item.region" class="today-chip">
        <strong>{{ item.region }}</strong>
        <span v-if="item.parts.length">{{ item.parts.join("；") }}</span>
        <span v-else class="muted">今日不限行</span>
      </div>
    </div>

    <div v-for="region in REGIONS" :key="region" class="rule-group">
      <h3 class="subhead">{{ region }}</h3>
      <ul class="rule-list">
        <template v-for="rule in store.rules.filter((r) => r.region === region)" :key="rule.id">
          <li v-if="rule.kind === 'tail'">
            <span class="rule-label">{{ rule.label }}</span>
            <span class="rule-detail">
              <template v-for="wd in [1, 2, 3, 4, 5, 6, 7]" :key="wd">
                <em v-if="rule.schedule[wd]" :class="{ today: wd === todayWeekday }">
                  {{ WEEKDAY_LABELS[wd] }} {{ rule.schedule[wd]!.join("/") }}
                </em>
              </template>
            </span>
          </li>
          <li v-else>
            <span class="rule-label">{{ rule.label }}</span>
            <span class="rule-detail">
              {{ rule.weekdays.map((w) => WEEKDAY_LABELS[w]).join("、") }} 禁行 {{ rule.levels.join("、") }}
            </span>
          </li>
        </template>
      </ul>
    </div>
  </section>
</template>
