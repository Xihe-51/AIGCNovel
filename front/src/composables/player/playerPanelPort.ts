/**
 * 播放器装配端口：面板域（存档 / 章节 / 更新日志 / 演出编辑）暴露给编排层的惰性入口。
 *
 * 编排层先建立播放器状态与播放推进，面板域依赖这些状态才能创建，
 * 但编排层里的开局装载与位置副作用又需要在面板域创建后回调它们 ——
 * 这里用一个按实例创建的端口解开这个环：编排层只依赖端口，面板域在
 * setup 内同步回填实现，任何调用都发生在挂载之后，所以不会读到空实现。
 */

export interface PlayerPanelPort {
  /** 载入存档槽位（开局装载时调用） */
  loadProgress: () => any
  /** 载入章节与路线图数据（开局装载时调用） */
  loadChapterData: () => any
  /** 载入公开版本清单（开局装载时调用） */
  loadPublicReleases: () => any
  /** 自动存档落盘 */
  saveToSlot: (slot: any, silent?: boolean) => any
  /** 写本地进度（刷新后续读用） */
  saveProgress: (silent?: boolean) => any
  /** 演出模式开关（作者预览） */
  setPerformMode: (value: boolean) => void
  /** 演出模式是否开启 */
  getPerformMode: () => boolean
  /** 读档还原中标记，位置副作用据此暂停自动存档 */
  getIsRestoring: () => boolean
}

const notWired = (name: string) => (): never => {
  throw new Error(`[player] 面板域尚未装配：${name}`)
}

export function createPlayerPanelPort(): PlayerPanelPort {
  return {
    loadProgress: notWired('loadProgress'),
    loadChapterData: notWired('loadChapterData'),
    loadPublicReleases: notWired('loadPublicReleases'),
    saveToSlot: notWired('saveToSlot') as PlayerPanelPort['saveToSlot'],
    saveProgress: notWired('saveProgress') as PlayerPanelPort['saveProgress'],
    setPerformMode: notWired('setPerformMode') as PlayerPanelPort['setPerformMode'],
    getPerformMode: notWired('getPerformMode'),
    getIsRestoring: notWired('getIsRestoring'),
  }
}
