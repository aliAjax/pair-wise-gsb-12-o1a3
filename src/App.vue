<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore } from "./store/dispatch";
import DispatchView from "./views/DispatchView.vue";
import TasksView from "./views/TasksView.vue";
import RulesView from "./views/RulesView.vue";
import RegistryView from "./views/RegistryView.vue";

const tabs = [
  { key: "dispatch", label: "派单登记" },
  { key: "tasks", label: "派车台" },
  { key: "rules", label: "限行规则" },
  { key: "registry", label: "车辆/司机资料" }
] as const;

type TabKey = (typeof tabs)[number]["key"];
const active = ref<TabKey>("dispatch");
const store = useDispatchStore();

const metrics = computed(() => [
  { label: "执行中任务", value: store.tasks.filter((t) => t.status === "执行中" && !t.supersededBy).length },
  { label: "已完成（冻结）", value: store.tasks.filter((t) => t.status === "已完成").length },
  { label: "接管发生", value: store.tasks.filter((t) => t.takeovers.length > 0).length },
  { label: "整单拒绝", value: store.rejectedTasks.length }
]);

const chartRows = computed(() =>
  ["执行中", "已完成", "已替代", "已拒单"].map((status) => ({
    status,
    value:
      status === "执行中"
        ? store.tasks.filter((t) => t.status === "执行中" && !t.supersededBy).length
        : status === "已完成"
          ? store.tasks.filter((t) => t.status === "已完成").length
          : status === "已替代"
            ? store.tasks.filter((t) => !!t.supersededBy).length
            : store.rejectedTasks.length
  }))
);
const maxChart = computed(() => Math.max(1, ...chartRows.value.map((r) => r.value)));
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业前端最小闭环</p>
          <h1>区域限行与替换车派车台</h1>
          <p class="subtitle">
            派单登记车牌、司机、工作区域、任务时段与准驾车型；排放/尾号限行、任务结束时年检失效、准驾不符整单拒绝；
            替换车接管前原车锁定，接管后继承未完成路段；已完成冻结，调整另建带原因版本。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">Pinia</span>
          <span class="tag">localStorage 持久化</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <nav class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="tab"
          :class="{ active: active === tab.key }"
          @click="active = tab.key"
        >
          {{ tab.label }}
        </button>
        <button type="button" class="tab reset" @click="store.resetDemo()">重置示例数据</button>
      </nav>

      <DispatchView v-if="active === 'dispatch'" />
      <TasksView v-else-if="active === 'tasks'" />
      <RulesView v-else-if="active === 'rules'" />
      <RegistryView v-else />

      <section class="panel chart-panel">
        <h2>任务状态分布</h2>
        <div class="mini-chart">
          <div v-for="row in chartRows" :key="row.status" class="bar">
            <span>{{ row.status }}</span>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" />
            </div>
            <strong>{{ row.value }}</strong>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
