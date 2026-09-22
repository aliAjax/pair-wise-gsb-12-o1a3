<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore } from "../store/dispatch";
import TaskCard from "../components/TaskCard.vue";
import { ZONES } from "../domain/seed";

const store = useDispatchStore();
const zoneFilter = ref("全部区域");
const statusFilter = ref("全部状态");

const visible = computed(() =>
  store.tasks.filter((t) => {
    if (t.status === "已拒单") return false;
    if (zoneFilter.value !== "全部区域" && t.zone !== zoneFilter.value) return false;
    if (statusFilter.value === "执行中" && (t.status !== "执行中" || t.supersededBy)) return false;
    if (statusFilter.value === "已完成" && t.status !== "已完成") return false;
    if (statusFilter.value === "已替代" && !t.supersededBy) return false;
    return true;
  })
);

const stats = computed(() => ({
  active: store.tasks.filter((t) => t.status === "执行中" && !t.supersededBy).length,
  done: store.tasks.filter((t) => t.status === "已完成").length,
  takeover: store.tasks.filter((t) => (t.takeovers?.length ?? 0) > 0).length,
  rejected: store.rejectedTasks.length
}));
</script>

<template>
  <section class="panel wide">
    <div class="toolbar">
      <h2>派车台</h2>
      <div class="filters">
        <select v-model="zoneFilter">
          <option>全部区域</option>
          <option v-for="z in ZONES" :key="z">{{ z }}</option>
        </select>
        <select v-model="statusFilter">
          <option>全部状态</option>
          <option>执行中</option>
          <option>已完成</option>
          <option>已替代</option>
        </select>
      </div>
    </div>

    <div class="stat-strip">
      <span>执行中 <strong>{{ stats.active }}</strong></span>
      <span>已完成冻结 <strong>{{ stats.done }}</strong></span>
      <span>发生接管 <strong>{{ stats.takeover }}</strong></span>
      <span>拒单 <strong>{{ stats.rejected }}</strong></span>
    </div>

    <div class="record-grid">
      <div v-if="visible.length === 0" class="empty">暂无匹配任务</div>
      <TaskCard v-for="task in visible" :key="task.id" :task="task" />
    </div>
  </section>
</template>
