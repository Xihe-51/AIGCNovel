import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'src')
const exts = new Set(['.vue', '.ts'])
const skipDirs = new Set(['__tests__', 'node_modules'])
const limit = Number(process.argv[2] || 30)
const budget = Number(process.argv[3] || 500)

const walk = (dir, out = []) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			if (!skipDirs.has(entry.name)) walk(full, out)
		} else if (exts.has(path.extname(entry.name))) {
			out.push(full)
		}
	}
	return out
}

const span = (src, open, close) => {
	const a = src.indexOf(open)
	if (a < 0) return 0
	const b = src.indexOf(close, a)
	return b < a ? 0 : src.slice(a, b).split('\n').length
}

const rows = walk(srcDir).map((full) => {
	const src = fs.readFileSync(full, 'utf8')
	const rel = path.relative(root, full).replace(/\\/g, '/')
	return {
		rel,
		total: src.split('\n').length,
		template: span(src, '<template', '</template>'),
		script: span(src, '<script', '</script>'),
		style: span(src, '<style', '</style>'),
	}
})

rows.sort((a, b) => b.total - a.total)

const over = rows.filter((r) => r.total > budget)
console.log(`# top ${limit} of ${rows.length} files (budget ${budget} lines)`)
for (const r of rows.slice(0, limit)) {
	const flag = r.total > budget ? '  OVER' : ''
	console.log(
		`${r.rel}\ttotal=${r.total}\ttemplate=${r.template}\tscript=${r.script}\tstyle=${r.style}${flag}`
	)
}
console.log(`# over budget: ${over.length}`)
