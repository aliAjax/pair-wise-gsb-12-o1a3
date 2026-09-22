<script setup lang="ts">
import { computed, ref } from "vue";
import DispatchForm from "./components/DispatchForm.vue";
import RestrictionBoard from "./components/RestrictionBoard.vue";
import ReviewPanel from "./components/ReviewPanel.vue";
import TaskCard from "./components/TaskCard.vue";
import { REGIONS } from "./domain/fleet";
import { useDispatchStore } from "./store/dispatch";

const store = useDispatchStore();

const regionFilter = ref("全部区域");
const filteredTasks = computed(() =>
  regionFilter.value === "全部区域"
    ? store.tasks
    : store.tasks.filter((t) => t.region === regionFilter.value),
);

const maxChart = computed(() => Math.max(1, ...store.statusChart.map((row) => row.value)));

const metricItems = computed(() => [
  { label: "任务总数", value: store.metrics.total },
  { label: "执行中", value: store.metrics.running },
  { label: "待接管", value: store.metrics.pendingTakeover },
  { label: "已完成", value: store.metrics.done },
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业前端最小闭环</p>
          <h1>区域限行与替换车派车台</h1>
          <p class="subtitle">
            派单登记车牌、司机、区域、时段与准驾车型；命中当日限行、年检失效或准驾不符即整单拒绝；
            替换车确认接管前原车不释放，接管后继承未完成路段；已完成任务冻结，调整另建带原因版本。
          </p>
        </div>
        <div class="stack">
          <span v-for="item in ['Vue3', 'Vite', 'TypeScript', 'Pinia']" :key="item" class="tag">{{ item }}</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metricItems" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <section class="workspace">
        <div class="side">
          <DispatchForm />
          <ReviewPanel />
          <RestrictionBoard />
        </div>

        <section class="list-panel">
          <div class="toolbar">
            <h2>任务列表</h2>
            <select v-model="regionFilter">
              <option>全部区域</option>
              <option v-for="r in REGIONS" :key="r">{{ r }}</option>
            </select>
          </div>

          <div class="record-grid">
            <div v-if="filteredTasks.length === 0" class="empty">暂无匹配数据</div>
            <TaskCard v-for="task in filteredTasks" :key="task.id" :task="task" />
          </div>

          <div class="mini-chart">
            <div v-for="row in store.statusChart" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" /></div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
