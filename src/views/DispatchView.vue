<script setup lang="ts">
import { reactive, ref } from "vue";
import { useDispatchStore } from "../store/dispatch";
import { blankDraft } from "../domain/audit";
import type { DispatchDraft, RuleHit } from "../domain/types";
import { LICENSE_ORDER, ZONES } from "../domain/seed";
import HitPanel from "../components/HitPanel.vue";

const store = useDispatchStore();

function defaultStart(): string {
  const d = new Date(Date.now() + 30 * 60000);
  return toLocalInput(d);
}
function defaultEnd(): string {
  const d = new Date(Date.now() + 4 * 3600000);
  return toLocalInput(d);
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const draft = reactive<DispatchDraft>({
  ...blankDraft(),
  zone: ZONES[0],
  startAt: defaultStart(),
  endAt: defaultEnd(),
  requiredClass: "C1"
});
const lastHits = ref<RuleHit[] | null>(null);
const lastOkSeq = ref<number | null>(null);

function submit() {
  lastHits.value = null;
  lastOkSeq.value = null;
  const result = store.dispatch(draft);
  if (!result.ok) {
    // 整单拒绝：不清空表单，保留输入
    lastHits.value = result.hits;
    return;
  }
  lastOkSeq.value = result.task?.seq ?? null;
  Object.assign(draft, blankDraft(), {
    zone: ZONES[0],
    startAt: defaultStart(),
    endAt: defaultEnd(),
    requiredClass: "C1"
  });
}

function restore(taskId: string) {
  const task = store.tasks.find((t) => t.id === taskId);
  if (!task?.rejectedInput) return;
  Object.assign(draft, task.rejectedInput);
  lastHits.value = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
</script>

<template>
  <div class="view-grid">
    <form class="panel" @submit.prevent="submit">
      <h2>派单登记</h2>
      <p class="hint">登记车牌、司机、工作区域、任务时段、准驾车型与配送路段；命中限行/年检/准驾规则时整单拒绝并保留输入。</p>
      <div class="form-grid">
        <label>
          车牌号
          <select v-model="draft.plate" required>
            <option value="" disabled>请选择车辆</option>
            <option v-for="v in store.vehicles" :key="v.plate" :value="v.plate">
              {{ v.plate }}（{{ v.emission }} / {{ v.ratedClass }}）
            </option>
          </select>
        </label>
        <label>
          司机
          <select v-model="draft.driver" required>
            <option value="" disabled>请选择司机</option>
            <option v-for="d in store.drivers" :key="d.name" :value="d.name">
              {{ d.name }}（{{ d.license }}）
            </option>
          </select>
        </label>
        <label>
          工作区域
          <select v-model="draft.zone" required>
            <option value="" disabled>请选择区域</option>
            <option v-for="z in ZONES" :key="z" :value="z">{{ z }}</option>
          </select>
        </label>
        <label>
          准驾车型要求
          <select v-model="draft.requiredClass" required>
            <option v-for="l in LICENSE_ORDER" :key="l" :value="l">{{ l }} 及以上</option>
          </select>
        </label>
        <label>
          任务开始
          <input v-model="draft.startAt" type="datetime-local" required />
        </label>
        <label>
          任务结束
          <input v-model="draft.endAt" type="datetime-local" required />
        </label>
        <label class="span-2">
          配送路段（每行一个，接管时未完成路段由替换车继承）
          <textarea v-model="draft.route" placeholder="仓装发车&#10;东门交付&#10;回程空返" />
        </label>
        <label class="span-2">
          备注
          <textarea v-model="draft.note" placeholder="现场说明" />
        </label>
        <div class="span-2 row-actions">
          <button type="submit">审查并派单</button>
          <button type="button" class="secondary" @click="Object.assign(draft, blankDraft())">清空输入</button>
        </div>
      </div>

      <div v-if="lastHits" class="banner danger-banner">
        <strong>整单拒绝 · 已保留全部输入</strong>
        <HitPanel :hits="lastHits" />
      </div>
      <div v-else-if="lastOkSeq !== null" class="banner ok-banner">
        派单成功，任务编号 #{{ lastOkSeq }}
      </div>
    </form>

    <section class="panel">
      <h2>拒单记录 <span class="count">{{ store.rejectedTasks.length }}</span></h2>
      <p class="hint">列出车牌、区域、时段、原值与命中规则；可一键恢复到登记表重新提交。</p>
      <div v-if="store.rejectedTasks.length === 0" class="empty">暂无拒单</div>
      <article v-for="task in store.rejectedTasks" :key="task.id" class="reject-card">
        <div class="record-head">
          <p class="record-title">#{{ task.seq }} {{ task.plate }} / {{ task.driver }}</p>
          <span class="status danger-status">已拒单</span>
        </div>
        <div class="details">
          <span>区域：{{ task.zone || "（未填）" }}</span>
          <span>时段：{{ (task.startAt || "").replace("T", " ").slice(0, 16) }} ~ {{ (task.endAt || "").replace("T", " ").slice(0, 16) }}</span>
        </div>
        <HitPanel :hits="task.hits ?? []" />
        <div class="actions">
          <button type="button" class="secondary" @click="restore(task.id)">恢复输入到登记表</button>
          <button type="button" class="danger" @click="store.removeRejected(task.id)">删除拒单记录</button>
        </div>
      </article>
    </section>
  </div>
</template>
