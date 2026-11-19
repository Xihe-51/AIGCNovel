import type { TemplateMeta } from '@/api/project'

/**
 * 内置兜底模板：与后端 TEMPLATES 骨架保持一致，
 * 接口不可用时也能让用户看清会建出哪些场景与变量。
 */
export const FALLBACK_TEMPLATES: TemplateMeta[] = [
  {
    template_type: '线性叙事',
    name: '线性叙事',
    description: '单主线顺序推进，读者从头读到尾，适合短篇与明确结局的故事。',
    features: ['单主线', '顺序阅读', '单结局'],
    starter_scenes: [
      { title: '开场', order_num: 1 },
      { title: '发展', order_num: 2 },
      { title: '结局', order_num: 3 }
    ],
    recommended_variables: []
  },
  {
    template_type: '分支叙事',
    name: '分支叙事',
    description: '关键时刻提供选择，不同选择走向不同结局，适合多线多结局剧情。',
    features: ['多分支', '多结局', '选择驱动'],
    starter_scenes: [
      { title: '开场', order_num: 1 },
      { title: '分歧点', order_num: 2 },
      { title: '结局·A 线', order_num: 3 },
      { title: '结局·B 线', order_num: 4 }
    ],
    recommended_variables: [{ name: 'affection', label: '好感度', initial_value: 0 }]
  },
  {
    template_type: '开放世界',
    name: '开放世界',
    description: '多场景自由探索，用变量串联线索与状态，适合悬疑与探索类故事。',
    features: ['多场景', '变量驱动', '自由探索'],
    starter_scenes: [
      { title: '序章', order_num: 1 },
      { title: '探索区域·甲', order_num: 2 },
      { title: '探索区域·乙', order_num: 3 },
      { title: '终章', order_num: 4 }
    ],
    recommended_variables: [{ name: 'clue', label: '线索数', initial_value: 0 }]
  }
]
