import request from '@/utils/request'

export interface CompilerStats {
  line_count: number
  node_count: number
  dialogue_count: number
  narration_count: number
  chapter_count: number
  scene_count: number
  character_total: number
  character_bound: number
  character_unknown: number
  unknown_speakers: string[]
  branch_suggestion_count: number
  variable_suggestion_count: number
  source_preserved_pct: number
}

export interface CompilerDiagnostic {
  level: 'error' | 'warning' | 'info'
  code: string
  message: string
  line?: number | null
}

export interface CompilerScenePreview {
  title: string
  line?: number | null
  node_count: number
  preview: {
    line?: number | null
    kind: 'dialogue' | 'narration'
    speaker?: string | null
    text: string
  }[]
}

export interface CompilerChapterPreview {
  title: string
  line?: number | null
  scene_count: number
  node_count: number
  scenes: CompilerScenePreview[]
}

export interface CompilePreview {
  filename: string
  format: string
  stats: CompilerStats
  diagnostics: CompilerDiagnostic[]
  branch_suggestions: { line?: number | null; scene_title: string; preview: string; reason: string }[]
  variable_suggestions: { name: string; line?: number | null; scene_title: string; reason: string }[]
  structure: {
    chapters: CompilerChapterPreview[]
    truncated: boolean
  }
}

export interface CompileSourceNode {
  content_id: number
  scene_id: number
  line?: number | null
  kind: string
  speaker?: string | null
  character_id?: number | null
  content_type: string
  text: string
}

export interface CompileApplied {
  source_id: number
  created: {
    chapters: number
    scenes: number
    nodes: number
    characters: { character_id: number; name: string }[]
  }
  stats: CompilerStats
  diagnostics: CompilerDiagnostic[]
  branch_suggestions: CompilePreview['branch_suggestions']
  variable_suggestions: CompilePreview['variable_suggestions']
  source_map: {
    chapters: { chapter_id: number; title: string; line?: number | null }[]
    scenes: { scene_id: number; title: string; line?: number | null; chapter_title?: string | null }[]
    nodes: CompileSourceNode[]
  }
  first: { scene_id: number; content_id: number } | null
  project_title: string
}

export interface CompilePayload {
  text: string
  filename?: string
  format?: string
  create_characters?: boolean
  create_chapters?: boolean
}

export const previewStoryCompile = async (
  projectId: number,
  payload: CompilePayload
): Promise<CompilePreview> => {
  const response = await request.post(`/project/story_compile/${projectId}/preview`, payload)
  return response.data.data as CompilePreview
}

export const applyStoryCompile = async (
  projectId: number,
  payload: CompilePayload
): Promise<CompileApplied> => {
  const response = await request.post(`/project/story_compile/${projectId}/apply`, payload)
  return response.data.data as CompileApplied
}

export interface CompileSourceSummary {
  source_id: number
  filename: string
  format: string
  created_at?: string | null
  stats: Partial<CompilerStats>
  diagnostic_count: number
}

export const listCompileSources = async (projectId: number): Promise<CompileSourceSummary[]> => {
  const response = await request.get(`/project/story_compile/${projectId}/sources`)
  return response.data.data as CompileSourceSummary[]
}

export interface CompileSourceDetail {
  source_id: number
  filename: string
  format: string
  created_at?: string | null
  content: string
  compile: {
    stats?: CompilerStats
    diagnostics?: CompilerDiagnostic[]
    branch_suggestions?: CompilePreview['branch_suggestions']
    variable_suggestions?: CompilePreview['variable_suggestions']
    source_map?: CompileApplied['source_map']
  }
}

export const getCompileSource = async (sourceId: number): Promise<CompileSourceDetail> => {
  const response = await request.get(`/project/story_compile/source/${sourceId}`)
  return response.data.data as CompileSourceDetail
}
