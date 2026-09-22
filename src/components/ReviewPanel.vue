<script setup lang="ts">
import { computed } from "vue";
import { fmtMoment, fmtPeriod } from "../domain/dates";
import { useDispatchStore } from "../store/dispatch";

const store = useDispatchStore();

const rejection = computed(() => store.latestRejection);
const recentReviews = computed(() => store.reviews.slice(0, 8));
</script>

<template>
  <section class="panel">
    <h2>审查结果</h2>

    <div v-if="rejection" class="rejection">
      <p class="rejection-title">
        整单拒绝 · {{ rejection.kind }} · {{ rejection.plate }} / {{ rejection.driver }}
      </p>
      <p class="rejection-meta">
        区域：{{ rejection.region }} ｜ 时段：{{ fmtPeriod(rejection.start, rejection.end) }} ｜
        准驾车型：{{ rejection.requiredType }}
      </p>
      <table class="violation-table">
        <thead>
          <tr>
            <th>命中规则</th>
            <th>字段</th>
            <th>原值</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in rejection.violations" :key="v.ruleId + v.field">
            <td>{{ v.ruleName }}</td>
            <td>{{ v.field }}</td>
            <td class="mono">{{ v.originalValue }}</td>
            <td>{{ v.detail }}</td>
          </tr>
        </tbody>
      </table>
      <p class="rejection-tip">输入已保留在派单表单中，调整后重新提交即可。</p>
    </div>
    <p v-else class="empty-inline">当前无被拒绝的单据</p>

    <template v-if="recentReviews.length">
      <h3 class="subhead">审查记录</h3>
      <ul class="review-log">
        <li v-for="r in recentReviews" :key="r.id">
          <span class="tag" :class="r.passed ? 'tag-ok' : 'tag-bad'">{{ r.passed ? "通过" : "拒绝" }}</span>
          <span class="log-kind">{{ r.kind }}</span>
          <span>{{ r.plate }} / {{ r.driver }} · {{ r.region }}</span>
          <time>{{ fmtMoment(r.createdAt) }}</time>
        </li>
      </ul>
    </template>
  </section>
</template>
