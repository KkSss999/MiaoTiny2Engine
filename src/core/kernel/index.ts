/**
 * 内核：与"游戏"和"数据"都无关的运行时原语。
 * 事件总线 / 生命周期、固定步长循环、输入状态、种子随机。
 */
export * from "./event/index.ts";
export * from "./time/Loop.ts";
export * from "./input/index.ts";
export * from "./rng/index.ts";
