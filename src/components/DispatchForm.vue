<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { toLocalInput } from "../domain/dates";
import {
  DRIVERS,
  findDriver,
  findVehicle,
  licenseScopeText,
  REGIONS,
  VEHICLE_TYPES,
  VEHICLES,
} from "../domain/fleet";
import type { ReviewInput } from "../domain/types";
import { useDispatchStore } from "../store/dispatch";

const store = useDispatchStore();

const blank = (): ReviewInput => ({
  plate: "",
  driver: "",
  region: "",
  start: "",
  end: "",
  requiredType: "",
});

const form = reactive<ReviewInput>(blank());
const segmentText = ref("");
const notes = ref("");
const revisionReason = ref("");
const formError = ref("");

const revising = computed(() => store.revisionBase);

// 进入修订模式：以被冻结任务的原值预填，提交时另建带原因的新版本
watch(revising, (base) => {
  if (!base) return;
  Object.assign(form, {
    plate: base.plate,
    driver: base.driver,
    region: base.region,
    start: base.start,
    end: base.end,
    requiredType: base.requiredType,
  });
  segmentText.value = base.segments.map((s) => s.name).join("，");
  notes.value = base.notes;
  revisionReason.value = "";
  formError.value = "";
});

const vehicleHint = computed(() => {
  const v = findVehicle(form.plate);
  return v ? `${v.type} · ${v.emission} · 年检至 ${v.inspectionUntil}` : "";
});

const driverHint = computed(() => {
  const d = findDriver(form.driver);
  return d ? `准驾 ${d.license}（可驾：${licenseScopeText(d.license)}）` : "";
});

function fillDemoTime() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setHours(18, 0, 0, 0);
  form.start = toLocalInput(start);
  form.end = toLocalInput(end);
}

function reset() {
  Object.assign(form, blank());
  segmentText.value = "";
  notes.value = "";
  revisionReason.value = "";
  formError.value = "";
}

function submit() {
  formError.value = "";
  if (form.end <= form.start) {
    formError.value = "任务时段无效：结束时间必须晚于开始时间";
    return;
  }
  const segments = segmentText
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    formError.value = "请至少填写一个途经路段（用逗号分隔）";
    return;
  }
  const input: ReviewInput = { ...form };
  if (revising.value) {
    if (!revisionReason.value.trim()) {
      formError.value = "修订已完成任务必须填写修订原因";
      return;
    }
    const report = store.submitRevision(input, segments, notes.value, revisionReason.value);
    if (report?.passed) reset(); // 通过才清空；整单拒绝时保留输入
    return;
  }
  const report = store.submitDispatch(input, segments, notes.value);
  if (report.passed) reset();
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>{{ revising ? `修订任务 v${revising.version}（另建版本）` : "新增派单" }}</h2>

    <div v-if="revising" class="revision-banner">
      基于 {{ revising.plate }} / {{ revising.driver }} 的已完成任务另建版本，原版本保持冻结。
      <button type="button" class="link" @click="store.cancelRevision(); reset()">取消修订</button>
    </div>

    <div class="form-grid">
      <label>
        车牌号
        <select v-model="form.plate" required>
          <option value="">请选择车辆</option>
          <option v-for="v in VEHICLES" :key="v.plate" :value="v.plate">{{ v.plate }}</option>
        </select>
        <small v-if="vehicleHint" class="hint">{{ vehicleHint }}</small>
      </label>

      <label>
        司机
        <select v-model="form.driver" required>
          <option value="">请选择司机</option>
          <option v-for="d in DRIVERS" :key="d.name" :value="d.name">{{ d.name }}（{{ d.license }}）</option>
        </select>
        <small v-if="driverHint" class="hint">{{ driverHint }}</small>
      </label>

      <label>
        工作区域
        <select v-model="form.region" required>
          <option value="">请选择区域</option>
          <option v-for="r in REGIONS" :key="r" :value="r">{{ r }}</option>
        </select>
      </label>

      <label>
        准驾车型（任务所需）
        <select v-model="form.requiredType" required>
          <option value="">请选择车型</option>
          <option v-for="t in VEHICLE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>

      <label>
        任务开始
        <input v-model="form.start" type="datetime-local" required />
      </label>

      <label>
        任务结束
        <input v-model="form.end" type="datetime-local" required />
      </label>

      <label class="span-2">
        途经路段（逗号分隔）
        <input v-model="segmentText" placeholder="如：装货点，高速路段，城区配送，卸货点" required />
      </label>

      <label v-if="revising" class="span-2">
        修订原因（必填，随版本入链）
        <input v-model="revisionReason" placeholder="如：客户改约至次日上午" required />
      </label>

      <label class="span-2">
        备注
        <textarea v-model="notes" placeholder="填写处理说明或现场备注" />
      </label>

      <p v-if="formError" class="form-error">{{ formError }}</p>

      <div class="form-actions">
        <button type="submit">{{ revising ? "提交修订版本" : "登记派单" }}</button>
        <button type="button" class="secondary" @click="fillDemoTime">填入明日 08:00–18:00</button>
      </div>
    </div>
  </form>
</template>
