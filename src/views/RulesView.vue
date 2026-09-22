<script setup lang="ts">
import { reactive, ref } from "vue";
import { useDispatchStore } from "../store/dispatch";
import type { RestrictionRule } from "../domain/types";
import { EMISSION_ORDER, ZONES } from "../domain/seed";

const store = useDispatchStore();

function blankRule(): RestrictionRule {
  return {
    id: "",
    name: "",
    type: "tail",
    scope: "zone",
    zones: [ZONES[0]],
    maxEmission: "国四",
    tails: ["0", "5"],
    start: "07:00",
    end: "20:00",
    enabled: true
  };
}

const form = ref<RestrictionRule>(blankRule());
const tailsText = ref("0,5");
const error = ref("");

function edit(rule: RestrictionRule) {
  form.value = JSON.parse(JSON.stringify(rule));
  tailsText.value = (rule.tails ?? []).join(",");
  error.value = "";
}

function save() {
  error.value = "";
  const rule = { ...form.value };
  if (!rule.name.trim()) {
    error.value = "规则名称必填";
    return;
  }
  if (rule.type === "emission") {
    rule.tails = undefined;
  } else {
    rule.tails = tailsText.value
      .split(/[,，\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    rule.maxEmission = undefined;
    if (rule.tails.length === 0) {
      error.value = "尾号规则至少填写一个尾号";
      return;
    }
  }
  if (rule.scope === "zone" && (!rule.zones || rule.zones.length === 0)) {
    error.value = "请选择限行区域";
    return;
  }
  if (rule.scope === "city") rule.zones = undefined;
  store.upsertRule(rule);
  form.value = blankRule();
  tailsText.value = "0,5";
}

function toggleZone(zone: string) {
  const zones = form.value.zones ?? (form.value.zones = []);
  const idx = zones.indexOf(zone);
  if (idx >= 0) zones.splice(idx, 1);
  else zones.push(zone);
}

function describe(rule: RestrictionRule): string {
  const target = rule.type === "emission" ? `排放 ≤ ${rule.maxEmission}` : `尾号 ${(rule.tails ?? []).join("/")}`;
  const area = rule.scope === "city" ? "全城" : (rule.zones ?? []).join("、");
  return `${target}｜${area}｜${rule.start ?? "00:00"}-${rule.end ?? "24:00"}`;
}
</script>

<template>
  <section class="panel wide">
    <h2>限行规则</h2>
    <p class="hint">排放等级不高于阈值、或车牌尾号命中即限行；可限定区域、时段。规则调整后立即参与派单与替换车预检。</p>

    <div class="rule-layout">
      <div class="form-grid compact">
        <label>
          规则名称
          <input v-model="form.name" placeholder="如：城北低排放限行" />
        </label>
        <label>
          类型
          <select v-model="form.type">
            <option value="tail">车牌尾号</option>
            <option value="emission">排放等级</option>
          </select>
        </label>
        <label>
          生效范围
          <select v-model="form.scope">
            <option value="zone">指定区域</option>
            <option value="city">全城</option>
          </select>
        </label>
        <label v-if="form.type === 'emission'">
          排放阈值（该等级及以下限行）
          <select v-model="form.maxEmission">
            <option v-for="e in EMISSION_ORDER" :key="e" :value="e">{{ e }}</option>
          </select>
        </label>
        <label v-else>
          限行尾号（逗号分隔）
          <input v-model="tailsText" placeholder="6,8" />
        </label>
        <label>
          开始时间
          <input v-model="form.start" type="time" />
        </label>
        <label>
          结束时间
          <input v-model="form.end" type="time" />
        </label>
        <div v-if="form.scope === 'zone'" class="zone-picker span-2">
          <span>限行区域：</span>
          <button
            v-for="z in ZONES"
            :key="z"
            type="button"
            class="chip"
            :class="{ active: (form.zones ?? []).includes(z) }"
            @click="toggleZone(z)"
          >
            {{ z }}
          </button>
        </div>
        <p v-if="error" class="inline-error">{{ error }}</p>
        <div class="row-actions">
          <button type="button" @click="save">保存规则</button>
          <button type="button" class="secondary" @click="form = blankRule(); tailsText = '0,5'">重置表单</button>
        </div>
      </div>

      <ul class="rule-list">
        <li v-for="rule in store.rules" :key="rule.id" class="rule-item" :class="{ off: !rule.enabled }">
          <div class="record-head">
            <p class="record-title">{{ rule.name }}</p>
            <span class="mini-badge" :class="rule.enabled ? 'ok-badge' : ''">{{ rule.enabled ? "启用" : "停用" }}</span>
          </div>
          <p class="rule-desc">{{ describe(rule) }}</p>
          <div class="actions">
            <button type="button" class="secondary mini" @click="edit(rule)">编辑</button>
            <button type="button" class="secondary mini" @click="store.toggleRule(rule.id)">
              {{ rule.enabled ? "停用" : "启用" }}
            </button>
            <button type="button" class="danger mini" @click="store.removeRule(rule.id)">删除</button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
