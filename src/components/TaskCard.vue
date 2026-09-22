<script setup lang="ts">
import { computed, ref } from "vue";
import { fmtMoment, fmtPeriod } from "../domain/dates";
import { DRIVERS, findVehicle, VEHICLES } from "../domain/fleet";
import type { DispatchTask } from "../domain/types";
import { useDispatchStore } from "../store/dispatch";

const props = defineProps<{ task: DispatchTask }>();
const store = useDispatchStore();

const vehicle = computed(() => findVehicle(props.task.plate));
const frozen = computed(() => props.task.status === "已完成");
const pending = computed(() => store.pendingTakeover(props.task.id));
const confirmed = computed(() => store.confirmedTakeovers(props.task.id));
const chain = computed(() => store.chainOf(props.task));
const doneCount = computed(() => props.task.segments.filter((s) => s.done).length);

// —— 替换车申请内联表单 ——
const takeoverOpen = ref(false);
const toPlate = ref("");
const toDriver = ref("");
const takeoverError = ref("");

const candidateVehicles = computed(() => VEHICLES.filter((v) => v.plate !== props.task.plate));

function submitTakeover() {
  takeoverError.value = "";
  const report = store.requestTakeover(props.task.id, toPlate.value, toDriver.value);
  if (!report) return;
  if (report.passed) {
    takeoverOpen.value = false;
    toPlate.value = "";
    toDriver.value = "";
  } else {
    takeoverError.value = `替换车审查未通过：${report.violations.map((v) => v.ruleName).join("、")}（详见审查面板）`;
  }
}

function flow() {
  store.flowTask(props.task.id);
}
</script>

<template>
  <article class="record" :class="{ frozen }">
    <div class="record-head">
      <p class="record-title">
        {{ task.plate }} / {{ task.driver }}
        <span class="version">v{{ task.version }}</span>
      </p>
      <div class="head-tags">
        <span v-if="frozen" class="tag tag-frozen">已冻结</span>
        <span class="status" :class="`st-${task.status}`">{{ task.status }}</span>
      </div>
    </div>

    <div class="details">
      <span>工作区域：{{ task.region }}</span>
      <span>任务时段：{{ fmtPeriod(task.start, task.end) }}</span>
      <span>准驾车型：{{ task.requiredType }}</span>
      <span v-if="vehicle">车辆资料：{{ vehicle.type }} · {{ vehicle.emission }} · 年检至 {{ vehicle.inspectionUntil }}</span>
    </div>

    <p class="note">{{ task.notes }}</p>
    <p v-if="task.revisionReason" class="revision-reason">修订原因：{{ task.revisionReason }}</p>

    <!-- 路段：执行中可勾选，接管后由替换车继承未完成路段 -->
    <div class="segments">
      <span class="segments-title">路段 {{ doneCount }}/{{ task.segments.length }}</span>
      <label
        v-for="seg in task.segments"
        :key="seg.id"
        class="segment"
        :class="{ done: seg.done, locked: task.status !== '执行中' }"
      >
        <input
          type="checkbox"
          :checked="seg.done"
          :disabled="task.status !== '执行中'"
          @change="store.toggleSegment(task.id, seg.id)"
        />
        {{ seg.name }}
      </label>
    </div>

    <!-- 待接管：确认前原车不得释放 -->
    <div v-if="pending" class="takeover-banner">
      <p>
        替换车 <strong>{{ pending.toPlate }}</strong>（{{ pending.toDriver }}）待接管，
        原车 <strong>{{ pending.fromPlate }}</strong> 未释放。
      </p>
      <div class="actions">
        <button type="button" @click="store.confirmTakeover(pending.id)">确认接管并释放原车</button>
        <button type="button" class="secondary" @click="store.cancelTakeover(pending.id)">取消接管</button>
      </div>
    </div>

    <!-- 已接管记录 -->
    <div v-for="t in confirmed" :key="t.id" class="takeover-done">
      {{ fmtMoment(t.confirmedAt ?? t.createdAt) }} 由 {{ t.fromPlate }} → {{ t.toPlate }} 接管，
      继承未完成路段：{{ t.inheritedSegments.length ? t.inheritedSegments.join("、") : "（无）" }}
    </div>

    <!-- 修订链 -->
    <div v-if="chain.length > 1" class="chain">
      修订链：
      <template v-for="(node, i) in chain" :key="node.id">
        <span v-if="i > 0" class="chain-arrow">→</span>
        <span class="chain-node" :class="{ current: node.id === task.id }" :title="node.revisionReason || '首版'">
          v{{ node.version }}·{{ node.status }}
        </span>
      </template>
    </div>

    <!-- 替换车申请 -->
    <div v-if="takeoverOpen" class="takeover-form">
      <label>
        替换车辆
        <select v-model="toPlate" required>
          <option value="">请选择</option>
          <option v-for="v in candidateVehicles" :key="v.plate" :value="v.plate">
            {{ v.plate }}（{{ v.type }} · {{ v.emission }}）
          </option>
        </select>
      </label>
      <label>
        替换司机
        <select v-model="toDriver" required>
          <option value="">请选择</option>
          <option v-for="d in DRIVERS" :key="d.name" :value="d.name">{{ d.name }}（{{ d.license }}）</option>
        </select>
      </label>
      <div class="actions">
        <button type="button" :disabled="!toPlate || !toDriver" @click="submitTakeover">提交替换申请</button>
        <button type="button" class="secondary" @click="takeoverOpen = false">收起</button>
      </div>
      <p v-if="takeoverError" class="form-error">{{ takeoverError }}</p>
    </div>

    <div class="actions">
      <button
        type="button"
        :disabled="frozen || !!pending"
        :title="pending ? '有待接管的替换车，须先确认或取消' : ''"
        @click="flow"
      >
        流转为{{ store.nextStatus(task.status) }}
      </button>
      <button
        v-if="!frozen"
        type="button"
        class="secondary"
        :disabled="!!pending"
        @click="takeoverOpen = !takeoverOpen"
      >
        申请替换车
      </button>
      <button v-if="frozen" type="button" class="secondary" @click="store.startRevision(task.id)">
        调整（另建版本）
      </button>
      <button
        type="button"
        class="danger"
        :disabled="frozen || !!pending"
        :title="frozen ? '已完成任务已冻结' : pending ? '须先处理待接管' : ''"
        @click="store.removeTask(task.id)"
      >
        删除
      </button>
    </div>
  </article>
</template>
