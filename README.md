# 区域限行与替换车派车台

- 行业：物流
- 技术栈：Vue3、Vite、TypeScript、Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

## 功能

- **派单登记**：车牌、司机、工作区域、任务时段、准驾车型与途经路段。
- **整单拒绝**：排放等级或车牌尾号命中当日限行、任务结束时年检失效、司机准驾车型不符，
  任一命中即整单拒绝；表单保留输入，审查面板列出车牌、区域、时段、原值与命中规则。
- **替换车接管**：替换车需通过同口径审查；确认接管前原车不释放，接管后继承未完成路段。
- **冻结与修订链**：已完成任务冻结，调整只能另建带原因的修订版本，版本链可溯。
- **一致性**：任务、限行规则、接管记录与修订链持久化在 localStorage，刷新后保持一致。

## 代码组织

```
src/
  domain/            # 车辆资料与审查计算（纯逻辑）
    fleet.ts           车辆台账、司机名册、准驾矩阵
    restrictions.ts    区域当日限行规则（尾号 / 排放）
    review.ts          审查计算：限行、年检、准驾三类命中
    dates.ts           时段与周几工具
    types.ts           实体类型
  store/dispatch.ts  # Pinia：任务、接管、修订链、审查记录 + 持久化
  components/        # 页面视图
    DispatchForm.vue     派单 / 修订表单
    ReviewPanel.vue      整单拒绝结果与审查记录
    RestrictionBoard.vue 区域限行规则与今日限行
    TaskCard.vue         任务卡片（路段、接管、修订链）
```
