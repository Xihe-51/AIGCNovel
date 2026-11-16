import fs from 'node:fs'
import path from 'node:path'

const [vueRel, scssRel, styleTag] = process.argv.slice(2)
if (!vueRel || !scssRel) {
  console.error('usage: node scripts/extract-style.mjs <vue> <scss> [styleTag]')
  process.exit(1)
}

const vuePath = path.resolve(vueRel)
const scssPath = path.resolve(scssRel)
const src = fs.readFileSync(vuePath, 'utf8')

const openTag = styleTag || '<style scoped lang="scss">'
const openIdx = src.indexOf(openTag)
if (openIdx < 0) {
  console.error('style open tag not found')
  process.exit(1)
}
const closeIdx = src.lastIndexOf('</style>')
if (closeIdx < openIdx) {
  console.error('style close tag not found')
  process.exit(1)
}

const scss = src.slice(openIdx + openTag.length, closeIdx).replace(/^\r?\n/, '')
fs.writeFileSync(scssPath, scss.replace(/\r\n/g, '\n'), 'utf8')

const head = src.slice(0, openIdx)
const tail = src.slice(closeIdx + '</style>'.length)
const replacement = `<style scoped lang="scss" src="./${path.basename(scssPath)}"></style>`
const next = head + replacement + tail
fs.writeFileSync(vuePath, next, 'utf8')

console.log(`scss lines: ${scss.split('\n').length}`)
console.log(`vue lines: ${next.split('\n').length}`)
