import { ref, onUnmounted, type Ref } from 'vue'
import type { ECharts } from 'echarts'
import type { Project } from '@/api/project'
import {
  filterProjectsByTimeRange,
  getGenreDistribution,
  getStatusDistribution,
  getWordCountByDate
} from '@/utils/homeStats'

export interface HomeChartsContext {
  projects: Ref<Project[]>
  isPublicMode: Ref<boolean>
  statsTimeRange: Ref<string>
}

const PIE_COLORS = ['#ff9a9e', '#f67280', '#c06c84', '#6c5b7b', '#355c7d', '#ffaaa5', '#fad0c4']

const TOOLTIP_ITEM = {
  trigger: 'item' as const,
  backgroundColor: 'rgba(255, 255, 255, 0.9)',
  borderColor: '#ffccd5',
  borderWidth: 1,
  textStyle: { color: '#333' }
}

const AKIS_STYLE = {
  axisLine: { lineStyle: { color: '#ffccd5' } },
  axisLabel: { color: '#666' }
}

const SPLIT_LINE = { lineStyle: { color: 'rgba(255, 204, 213, 0.2)' } }

export function useHomeCharts(ctx: HomeChartsContext) {
  const genreChartRef = ref<HTMLDivElement | null>(null)
  const wordCountChartRef = ref<HTMLDivElement | null>(null)
  const statusChartRef = ref<HTMLDivElement | null>(null)

  let genreChart: ECharts | null = null
  let wordCountChart: ECharts | null = null
  let statusChart: ECharts | null = null

  let echartsModule: Promise<typeof import('echarts')> | null = null
  const loadEcharts = () => (echartsModule ||= import('echarts'))

  const renderGenreChart = (echarts: typeof import('echarts'), filtered: Project[]) => {
    if (!genreChartRef.value) return
    genreChart?.dispose()
    genreChart = echarts.init(genreChartRef.value)
    genreChart.setOption({
      backgroundColor: 'transparent',
      tooltip: { ...TOOLTIP_ITEM, formatter: '{a} <br/>{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 10, textStyle: { color: '#666' } },
      series: [
        {
          name: '项目类型',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: '#fff',
            borderWidth: 2,
            color: (params: { dataIndex: number }) =>
              PIE_COLORS[params.dataIndex % PIE_COLORS.length]
          },
          label: { show: false, position: 'center' },
          emphasis: {
            label: { show: true, fontSize: 16, fontWeight: 'bold', color: '#333' }
          },
          labelLine: { show: false },
          data: getGenreDistribution(filtered)
        }
      ]
    })
  }

  const renderWordCountChart = (echarts: typeof import('echarts'), filtered: Project[]) => {
    if (!wordCountChartRef.value) return
    wordCountChart?.dispose()
    wordCountChart = echarts.init(wordCountChartRef.value)
    const wordCountData = getWordCountByDate(filtered)
    wordCountChart.setOption({
      backgroundColor: 'transparent',
      tooltip: { ...TOOLTIP_ITEM, trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, ...AKIS_STYLE },
      yAxis: {
        type: 'value',
        ...AKIS_STYLE,
        axisLabel: { color: '#666', formatter: '{value} 字' },
        splitLine: SPLIT_LINE
      },
      series: [
        {
          name: '累计字数',
          type: 'line',
          stack: 'Total',
          data: wordCountData.values,
          smooth: true,
          lineStyle: {
            width: 3,
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#ff9a9e' },
              { offset: 1, color: '#fad0c4' }
            ])
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(255, 154, 158, 0.4)' },
              { offset: 1, color: 'rgba(250, 208, 196, 0.1)' }
            ])
          },
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: '#ff9a9e' },
          emphasis: {
            itemStyle: {
              color: '#fff',
              borderColor: '#ff9a9e',
              borderWidth: 2,
              shadowBlur: 10,
              shadowColor: 'rgba(255, 154, 158, 0.5)'
            }
          }
        }
      ]
    })
  }

  const renderStatusChart = (echarts: typeof import('echarts'), filtered: Project[]) => {
    if (!statusChartRef.value) return
    statusChart?.dispose()
    statusChart = echarts.init(statusChartRef.value)
    const statusData = getStatusDistribution(filtered)
    statusChart.setOption({
      backgroundColor: 'transparent',
      tooltip: TOOLTIP_ITEM,
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: statusData.labels, ...AKIS_STYLE },
      yAxis: { type: 'value', ...AKIS_STYLE, splitLine: SPLIT_LINE },
      series: [
        {
          data: statusData.values,
          type: 'bar',
          barWidth: '60%',
          itemStyle: {
            color: (params: { dataIndex: number }) =>
              [
                new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#67c23a' },
                  { offset: 1, color: '#b3e19d' }
                ]),
                new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#ff9a9e' },
                  { offset: 1, color: '#fad0c4' }
                ])
              ][params.dataIndex],
            borderRadius: [4, 4, 0, 0]
          },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.1)' }
          }
        }
      ]
    })
  }

  const initCharts = async () => {
    if (!genreChartRef.value && !wordCountChartRef.value && !statusChartRef.value) return
    const echarts = await loadEcharts()
    const filtered = filterProjectsByTimeRange(ctx.projects.value, ctx.statsTimeRange.value)
    renderGenreChart(echarts, filtered)
    renderWordCountChart(echarts, filtered)
    renderStatusChart(echarts, filtered)
  }

  const refreshCharts = () => {
    if (!ctx.isPublicMode.value && ctx.projects.value.length > 0) {
      initCharts()
    }
  }

  const handleChartResize = () => {
    genreChart?.resize()
    wordCountChart?.resize()
    statusChart?.resize()
  }

  window.addEventListener('resize', handleChartResize)
  onUnmounted(() => {
    window.removeEventListener('resize', handleChartResize)
    genreChart?.dispose()
    wordCountChart?.dispose()
    statusChart?.dispose()
  })

  return {
    genreChartRef,
    wordCountChartRef,
    statusChartRef,
    initCharts,
    refreshCharts
  }
}
