<script setup lang="ts">
import { reactive, ref } from "vue";
import { useDispatchStore } from "../store/dispatch";
import type { Driver, Vehicle } from "../domain/types";
import { EMISSION_ORDER, LICENSE_ORDER } from "../domain/seed";

const store = useDispatchStore();

const blankVehicle = (): Vehicle => ({
  plate: "",
  emission: "国五",
  inspectUntil: "",
  ratedClass: "C1",
  note: ""
});
const blankDriver = (): Driver => ({ name: "", license: "C1", phone: "" });

const vehicleForm = ref<Vehicle>(blankVehicle());
const driverForm = ref<Driver>(blankDriver());
const vehicleError = ref("");
const driverError = ref("");

function saveVehicle() {
  vehicleError.value = "";
  const v = vehicleForm.value;
  if (!v.plate.trim() || !v.inspectUntil) {
    vehicleError.value = "车牌与年检有效期必填";
    return;
  }
  store.upsertVehicle({ ...v, plate: v.plate.trim().toUpperCase() });
  vehicleForm.value = blankVehicle();
}

function editVehicle(v: Vehicle) {
  vehicleForm.value = { ...v };
  vehicleError.value = "";
}

function saveDriver() {
  driverError.value = "";
  const d = driverForm.value;
  if (!d.name.trim()) {
    driverError.value = "司机姓名必填";
    return;
  }
  store.upsertDriver({ ...d, name: d.name.trim() });
  driverForm.value = blankDriver();
}

function editDriver(d: Driver) {
  driverForm.value = { ...d };
  driverError.value = "";
}

function inspectionState(until: string): { text: string; cls: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (until < today) return { text: "已失效", cls: "danger-badge" };
  const days = Math.round((new Date(until).getTime() - new Date(today).getTime()) / 86400000);
  if (days <= 7) return { text: `${days}天后到期`, cls: "warn-badge" };
  return { text: `有效 ${days} 天`, cls: "ok-badge" };
}
</script>

<template>
  <div class="view-grid two-col">
    <!-- 车辆资料 -->
    <section class="panel">
      <h2>车辆资料</h2>
      <div class="form-grid compact">
        <label>
          车牌号
          <input v-model="vehicleForm.plate" placeholder="沪A-82L6" />
        </label>
        <label>
          排放等级
          <select v-model="vehicleForm.emission">
            <option v-for="e in EMISSION_ORDER" :key="e" :value="e">{{ e }}</option>
          </select>
        </label>
        <label>
          年检有效期至
          <input v-model="vehicleForm.inspectUntil" type="date" />
        </label>
        <label>
          核载准驾等级
          <select v-model="vehicleForm.ratedClass">
            <option v-for="l in LICENSE_ORDER" :key="l" :value="l">{{ l }}</option>
          </select>
        </label>
        <label class="span-2">
          备注
          <input v-model="vehicleForm.note" />
        </label>
        <p v-if="vehicleError" class="inline-error">{{ vehicleError }}</p>
        <div class="row-actions">
          <button type="button" @click="saveVehicle">保存车辆</button>
          <button type="button" class="secondary" @click="vehicleForm = blankVehicle()">重置表单</button>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr><th>车牌</th><th>排放</th><th>核载</th><th>年检</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="v in store.vehicles" :key="v.plate">
            <td>{{ v.plate }}<small v-if="v.note">{{ v.note }}</small></td>
            <td>{{ v.emission }}</td>
            <td>{{ v.ratedClass }}</td>
            <td>
              {{ v.inspectUntil }}
              <span class="mini-badge" :class="inspectionState(v.inspectUntil).cls">{{ inspectionState(v.inspectUntil).text }}</span>
            </td>
            <td class="cell-actions">
              <button type="button" class="secondary mini" @click="editVehicle(v)">编辑</button>
              <button type="button" class="danger mini" @click="store.removeVehicle(v.plate)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 司机资料 -->
    <section class="panel">
      <h2>司机资料</h2>
      <div class="form-grid compact">
        <label>
          姓名
          <input v-model="driverForm.name" placeholder="司机姓名" />
        </label>
        <label>
          准驾车型
          <select v-model="driverForm.license">
            <option v-for="l in LICENSE_ORDER" :key="l" :value="l">{{ l }}</option>
          </select>
        </label>
        <label class="span-2">
          联系电话
          <input v-model="driverForm.phone" />
        </label>
        <p v-if="driverError" class="inline-error">{{ driverError }}</p>
        <div class="row-actions">
          <button type="button" @click="saveDriver">保存司机</button>
          <button type="button" class="secondary" @click="driverForm = blankDriver()">重置表单</button>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr><th>姓名</th><th>准驾车型</th><th>电话</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="d in store.drivers" :key="d.name">
            <td>{{ d.name }}</td>
            <td>{{ d.license }}</td>
            <td>{{ d.phone || "—" }}</td>
            <td class="cell-actions">
              <button type="button" class="secondary mini" @click="editDriver(d)">编辑</button>
              <button type="button" class="danger mini" @click="store.removeDriver(d.name)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
