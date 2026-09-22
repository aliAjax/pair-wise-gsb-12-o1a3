<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useDispatchStore, currentCarrierPlate, currentDriver } from "../store/dispatch";
import type { RuleHit, Task } from "../domain/types";
import { LICENSE_ORDER } from "../domain/seed";
import HitPanel from "./HitPanel.vue";

const props = defineProps<{ task: Task }>();
const store = useDispatchStore();

const showTakeover = ref(false);
const takeover = reactive({ candidatePlate: "", candidateDriver: "", reason: "" });
const takeoverHits = ref<RuleHit[] | null>(null);

const showRevise = ref(false);
const reviseForm = reactive({
  plate: "",
  driver: "",
  zone: "",
  startAt: "",
  endAt: "",
  requiredClass: "C1" as Task["requiredClass"],
  note: "",
  reason: ""
});
const reviseHits = ref<RuleHit[] | null>(null);

const chain = computed<Task[]>(() => store.revisionChains[props.task.rootId] ?? [props.task]);

const frozen = computed(() => props.task.supersededBy);
const isDone = computed(() => props.task.status === "已完成");
const carrier = computed(() => currentCarrierPlate(props.task));
const driverNow = computed(() => currentDriver(props.task));

/** 可选替换车：排除当前承运车，且不能是被其它任务占用的车 */
function startTakeoverPanel() {
  takeover.candidatePlate = "";
  takeover.candidateDriver = "";
  takeover.reason = "";
  takeoverHits.value = null;
  showTakeover.value = true;
}

function submitTakeover() {
  takeoverHits.value = store.startTakeover(props.task.id, { ...takeover });
}

function confirmTakeover() {
  store.confirmTakeover(props.task.id);
  showTakeover.value = false;
}

function startRevisePanel() {
  Object.assign(reviseForm, {
    plate: carrier.value,
    driver: driverNow.value,
    zone: props.task.zone,
    startAt: props.task.startAt,
    endAt: props.task.endAt,
    requiredClass: props.task.requiredClass,
    note: props.task.note,
    reason: ""
  });
  reviseHits.value = null;
  showRevise.value = true;
}

function submitRevise() {
  reviseHits.value = store.reviseTask(
    props.task.id,
    {
      plate: reviseForm.plate,
      driver: reviseForm.driver,
      zone: reviseForm.zone,
      startAt: reviseForm.startAt,
      endAt: reviseForm.endAt,
      requiredClass: reviseForm.requiredClass,
      note: reviseForm.note
    },
    reviseForm.reason
  );
  if (reviseHits.value.length === 0) showRevise.value = false;
}

const finished = computed(() => props.task.segments.filter((s) => s.state === "已完成").length);

const statusClass = computed(() => {
  if (isDone.value) return "status";
  if (frozen.value) return "status warn-status";
  return "status";
});

const statusText = computed(() => {
  if (isDone.value) return "已完成（冻结）";
  if (frozen.value) return `已由 v${chainVersion(store.tasks.find((t) => t.id === props.task.supersededBy)?.version)} 替代`;
  return props.task.status;
});

function chainVersion(v?: number): string {
  return v === undefined ? "?" : String(v);
}
</script>

<template>
  <article class="record task-card" :class="{ 'frozen-card': frozen || isDone }">
    <div class="record-head">
        <p class="record-title">
          #{{ task.seq }} v{{ task.version }} · {{ carrier }} / {{ driverNow }}
        </p>
        <span :class="statusClass">{{ statusText }}</span>
      </div>

      <div class="details">
        <span>工作区域：{{ task.zone }}</span>
        <span>准驾要求：{{ task.requiredClass }} 及以上</span>
        <span>开始：{{ task.startAt.replace("T", " ").slice(0, 16) }}</span>
        <span>结束：{{ task.endAt.replace("T", " ").slice(0, 16) }}</span>
        <span v-if="task.plate !== carrier || task.takeovers.length">
          原车：{{ task.takeovers[0]?.fromPlate ?? task.plate }}（接管 {{ task.takeovers.length }} 次）
        </span>
        <span v-if="task.reason">调整原因：{{ task.reason }}</span>
      </div>

      <!-- 路段：已完成冻结，未完成路段接管后归替换车 -->
      <div class="segments">
        <p class="seg-head">路段（{{ finished }}/{{ task.segments.length }} 已完成）</p>
        <ol>
          <li v-for="seg in task.segments" :key="seg.id" class="seg-row" :class="seg.state">
            <label class="seg-check">
              <input
                type="checkbox"
                :checked="seg.state === '已完成'"
                :disabled="isDone || frozen || !!task.pendingTakeover"
                @change="store.toggleSegment(task.id, seg.id)"
              />
              <span>{{ seg.name }}</span>
            </label>
            <span class="seg-by">{{ seg.state === "已完成" ? "已完成" : "未完成" }} · {{ seg.byPlate ?? "未派" }}</span>
          </li>
        </ol>
      </div>

      <!-- 接管时间线 -->
      <div v-if="task.takeovers.length" class="takeovers">
        <p class="seg-head">接管链</p>
        <div v-for="take in task.takeovers" :key="take.id" class="take-row">
          <span class="take-at">{{ new Date(take.at).toLocaleString("zh-CN", { hour12: false }) }}</span>
          <strong>{{ take.fromPlate }}</strong> → <strong>{{ take.toPlate }}</strong>
          <span v-if="take.driverChanged">（司机 {{ take.fromDriver }} → {{ take.toDriver }}）</span>
          <span class="take-reason">原因：{{ take.reason }}</span>
          <span class="take-inherit">继承未完成路段：{{ take.inheritedSegments.join("、") || "无" }}</span>
        </div>
      </div>

      <!-- 预占提示：原车不得释放 -->
      <div v-if="task.pendingTakeover" class="banner warn-banner">
        替换车 {{ task.pendingTakeover.candidatePlate }}（{{ task.pendingTakeover.candidateDriver }}）已预占至任务结束；
        原车 {{ carrier }} 在确认接管前<strong>不得释放</strong>。
      </div>

      <p v-if="task.note" class="note">{{ task.note }}</p>

      <!-- 修订链 -->
      <div v-if="chain.length > 1" class="chain">
        <p class="seg-head">修订链</p>
        <div v-for="t in chain" :key="t.id" class="chain-row" :class="{ current: t.id === task.id }">
          v{{ t.version }} · #{{ t.seq }} · {{ t.plate }} / {{ t.driver }} · {{ t.zone }}
          <span v-if="t.reason">（{{ t.reason }}）</span>
          <span v-if="t.status === '已拒单'" class="mini-badge danger-badge">拒</span>
          <span v-else-if="t.supersededBy" class="mini-badge">已替代</span>
        </div>
      </div>

      <div class="actions">
        <template v-if="!frozen">
          <button v-if="!isDone" type="button" :disabled="task.pendingTakeover" @click="startTakeoverPanel">替换车接管</button>
          <button type="button" class="secondary" :disabled="task.pendingTakeover" @click="startRevisePanel">
            {{ isDone ? "调整已完成任务（另建版本）" : "调整（另建版本）" }}
          </button>
          <button v-if="!isDone" type="button" :disabled="!store.canComplete(task)" @click="store.completeTask(task.id)">完成任务</button>
        </template>
        <span v-else class="frozen-tip">该版本已被替代并冻结，调整请基于最新版本另建</span>
      </div>

      <!-- 接管面板 -->
      <div v-if="showTakeover" class="inline-form">
        <h4>替换车接管登记</h4>
        <div class="form-grid">
          <label>
            替换车
            <select v-model="takeover.candidatePlate">
              <option value="" disabled>选择替换车</option>
              <option v-for="v in store.vehicles.filter((x) => x.plate !== carrier)" :key="v.plate" :value="v.plate">
                {{ v.plate }}（{{ v.emission }} / {{ v.ratedClass }} / 年检至 {{ v.inspectUntil }}）
              </option>
            </select>
          </label>
          <label>
            随车司机
            <select v-model="takeover.candidateDriver">
              <option value="" disabled>选择司机</option>
              <option v-for="d in store.drivers" :key="d.name" :value="d.name">{{ d.name }}（{{ d.license }}）</option>
            </select>
          </label>
          <label class="span-2">
            接管原因
            <input v-model="takeover.reason" placeholder="如：原车故障 / 尾号限行 / 司机临时请假" />
          </label>
        </div>
        <HitPanel v-if="takeoverHits" :hits="takeoverHits" />
        <div class="row-actions">
          <button type="button" @click="submitTakeover">预检并锁定替换车</button>
          <button type="button" class="secondary" @click="showTakeover = false">取消</button>
        </div>
      </div>

      <!-- 预占确认条 -->
      <div v-if="task.pendingTakeover && !showTakeover" class="inline-form pending-box">
        <h4>接管预占中</h4>
        <p class="hint">候选 {{ task.pendingTakeover.candidatePlate }} / {{ task.pendingTakeover.candidateDriver }}，原因：{{ task.pendingTakeover.reason }}</p>
        <div class="row-actions">
          <button type="button" @click="confirmTakeover">确认接管（继承未完成路段，原车释放）</button>
          <button type="button" class="danger" @click="store.cancelTakeover(task.id)">撤销预占</button>
        </div>
      </div>

      <!-- 调整面板 -->
      <div v-if="showRevise" class="inline-form">
        <h4>调整任务（冻结当前版本，另建带原因版本）</h4>
        <div class="form-grid">
          <label>
            车牌
            <select v-model="reviseForm.plate">
              <option v-for="v in store.vehicles" :key="v.plate" :value="v.plate">{{ v.plate }}（{{ v.emission }} / {{ v.ratedClass }}）</option>
            </select>
          </label>
          <label>
            司机
            <select v-model="reviseForm.driver">
              <option v-for="d in store.drivers" :key="d.name" :value="d.name">{{ d.name }}（{{ d.license }}）</option>
            </select>
          </label>
          <label>
            工作区域
            <select v-model="reviseForm.zone">
              <option v-for="z in ['城北', '城东', '城南', '城西', '高新区']" :key="z" :value="z">{{ z }}</option>
            </select>
          </label>
          <label>
            准驾要求
            <select v-model="reviseForm.requiredClass">
              <option v-for="l in LICENSE_ORDER" :key="l" :value="l">{{ l }}</option>
            </select>
          </label>
          <label><input v-model="reviseForm.startAt" type="datetime-local" /></label>
          <label><input v-model="reviseForm.endAt" type="datetime-local" /></label>
          <label class="span-2">
            备注
            <textarea v-model="reviseForm.note" />
          </label>
          <label class="span-2">
            调整原因（必填，随版本留存）
            <input v-model="reviseForm.reason" placeholder="如：客户改约时间 / 区域变更" />
          </label>
        </div>
        <HitPanel v-if="reviseHits && reviseHits.length" :hits="reviseHits" />
        <div class="row-actions">
          <button type="button" @click="submitRevise">提交调整版本</button>
          <button type="button" class="secondary" @click="showRevise = false">取消</button>
        </div>
      </div>
  </article>
</template>
