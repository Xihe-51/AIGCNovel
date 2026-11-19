# -*- coding: utf-8 -*-
"""叙事编译器最小测试：只覆盖纯函数解析与报告，不依赖数据库。"""
import unittest

from app.project.story_compiler.parser import parse_source
from app.project.story_compiler.report import build_report, structure_preview


class ParserTest(unittest.TestCase):
    def test_markdown_structure(self):
        source = '''# 第一章 雨夜

## 诊所

【李暮尘】“王医生，我真的没病。”

旁白：雨水敲打着窗户。

李暮尘：你相信我吗？
'''
        parsed = parse_source(source, 'sample.md')
        self.assertEqual(parsed['filename'], 'sample.md')
        self.assertEqual(len(parsed['chapters']), 1)
        chapter = parsed['chapters'][0]
        self.assertEqual(chapter['title'], '第一章 雨夜')
        self.assertEqual(len(chapter['scenes']), 1)
        scene = chapter['scenes'][0]
        self.assertEqual(scene['title'], '诊所')

        nodes = scene['nodes']
        self.assertEqual([n['kind'] for n in nodes], ['dialogue', 'narration', 'dialogue'])
        self.assertEqual(nodes[0]['speaker'], '李暮尘')
        self.assertEqual(nodes[0]['text'], '王医生，我真的没病。')
        self.assertEqual(nodes[1]['speaker'], None)
        self.assertEqual(nodes[2]['speaker'], '李暮尘')
        self.assertEqual([n['line'] for n in nodes], [5, 7, 9])

    def test_chinese_headings_and_sentence_guard(self):
        source = '''第一章 开端

第一场 走廊

李暮尘：走吧。

第一回合，他赢了。

第二场 天台

林瑶：到了。
'''
        parsed = parse_source(source)
        self.assertEqual(len(parsed['chapters']), 1)
        chapter = parsed['chapters'][0]
        self.assertEqual(chapter['title'], '第一章 开端')
        self.assertEqual([s['title'] for s in chapter['scenes']], ['第一场 走廊', '第二场 天台'])
        # 「第一回合，他赢了」应作为旁白留在第一个场景里
        self.assertEqual(chapter['scenes'][0]['nodes'][-1]['kind'], 'narration')

    def test_bom_and_crlf(self):
        source = '\ufeff# 第一章\r\n\r\n## 场景\r\n甲：你好。\r\n'
        parsed = parse_source(source)
        self.assertEqual(parsed['chapters'][0]['title'], '第一章')
        self.assertEqual(parsed['chapters'][0]['scenes'][0]['title'], '场景')
        self.assertEqual(parsed['chapters'][0]['scenes'][0]['nodes'][0]['speaker'], '甲')

    def test_empty_source_falls_back_to_default_scene(self):
        parsed = parse_source('   \n\n')
        self.assertEqual(len(parsed['chapters']), 1)
        self.assertEqual(parsed['chapters'][0]['title'], '正文')
        self.assertEqual(parsed['chapters'][0]['scenes'][0]['title'], '导入内容')
        self.assertEqual(parsed['chapters'][0]['scenes'][0]['nodes'], [])


class ReportTest(unittest.TestCase):
    def test_unbound_character_and_stats(self):
        source = '''# 第一章

## 场景一

李暮尘：你好。

陌生人：再见。

旁白：雨停了。
'''
        parsed = parse_source(source)
        report = build_report(parsed, {'李暮尘'})

        stats = report['stats']
        self.assertEqual(stats['node_count'], 3)
        self.assertEqual(stats['dialogue_count'], 2)
        self.assertEqual(stats['narration_count'], 1)
        self.assertEqual(stats['character_unknown'], 1)
        self.assertEqual(stats['unknown_speakers'], ['陌生人'])
        self.assertTrue(any(d['code'] == 'unbound_character' for d in report['diagnostics']))

    def test_all_narration_warning(self):
        parsed = parse_source('只是旁白。\n又一句。\n')
        codes = [d['code'] for d in build_report(parsed, set())['diagnostics']]
        self.assertIn('no_dialogue', codes)

    def test_structure_preview_truncation(self):
        source = '\n'.join('# 第%d章\n## 场景\n甲：话。\n' % i for i in range(41))
        preview = structure_preview(parse_source(source))
        self.assertTrue(preview['truncated'])
        self.assertEqual(len(preview['chapters']), 40)

    def test_structure_preview(self):
        source = '''# 第一章

## 场景一

甲：一句话。
'''
        parsed = parse_source(source)
        preview = structure_preview(parsed)
        self.assertFalse(preview['truncated'])
        self.assertEqual(preview['chapters'][0]['title'], '第一章')
        self.assertEqual(preview['chapters'][0]['scenes'][0]['node_count'], 1)


class StoryDirectiveTest(unittest.TestCase):
    SOURCE = '''# 第一章 雨夜

## 诊所

@bg rain.png
@bgm theme.mp3
@show 李暮尘
【李暮尘】“王医生，我真的没病。”

@choice 你打算怎么做？
- 承认病情 -> 承认
- 继续否认 -> 否认

## 承认线

#承认
@hide 李暮尘
@wait 300
李暮尘：好吧，我承认。
@jump 结局

## 否认线

#否认
李暮尘：我没病。

## 结局

@label 结局
旁白：雨停了。
'''

    def test_parse_labels_choice_jump_directives(self):
        parsed = parse_source(self.SOURCE, 'story.story')
        self.assertEqual(sorted(parsed['labels']), sorted(['承认', '否认', '结局']))
        self.assertEqual(parsed['errors'], [])

        chapter = parsed['chapters'][0]
        self.assertEqual([s['title'] for s in chapter['scenes']],
                         ['诊所', '承认线', '否认线', '结局'])

        opening = chapter['scenes'][0]['nodes']
        self.assertEqual(opening[0]['kind'], 'dialogue')
        self.assertEqual([d['type'] for d in opening[0]['directives']],
                         ['background', 'music', 'avatar'])

        choice = opening[1]
        self.assertEqual(choice['kind'], 'choice')
        self.assertEqual(choice['text'], '你打算怎么做？')
        self.assertEqual([c['text'] for c in choice['choices']], ['承认病情', '继续否认'])
        self.assertEqual([c['target'] for c in choice['choices']], ['承认', '否认'])

        accepted = chapter['scenes'][1]['nodes'][0]
        self.assertEqual(accepted['labels'], ['承认'])
        self.assertEqual([d['type'] for d in accepted['directives']], ['avatar', 'wait'])
        self.assertEqual(accepted['directives'][0]['payload']['action'], 'hide')
        self.assertEqual(accepted['jump'], {'target': '结局', 'line': 20})

        ending = chapter['scenes'][3]['nodes'][0]
        self.assertEqual(ending['labels'], ['结局'])

    def test_report_counts_branches_and_directives(self):
        parsed = parse_source(self.SOURCE)
        report = build_report(parsed, set())
        stats = report['stats']
        self.assertEqual(stats['node_count'], 5)
        self.assertEqual(stats['dialogue_count'], 3)
        self.assertEqual(stats['choice_count'], 1)
        self.assertEqual(stats['narration_count'], 1)
        self.assertEqual(stats['branch_count'], 3)
        self.assertEqual(stats['directive_count'], 5)
        self.assertEqual(stats['label_count'], 3)
        codes = [d['code'] for d in report['diagnostics']]
        self.assertNotIn('unresolved_label', codes)
        self.assertNotIn('self_loop_branch', codes)

    def test_plain_novel_has_no_directive_noise(self):
        parsed = parse_source('第一章 开端\n\n甲：你好。\n乙：再见。\n')
        self.assertEqual(parsed['labels'], {})
        self.assertEqual(parsed['errors'], [])

    def test_unresolved_label_reported(self):
        parsed = parse_source('甲：走。\n@jump 不存在\n')
        report = build_report(parsed, set())
        hit = [d for d in report['diagnostics'] if d['code'] == 'unresolved_label']
        self.assertEqual(len(hit), 1)
        self.assertEqual(hit[0]['level'], 'error')
        self.assertIn('不存在', hit[0]['message'])

    def test_duplicate_label_reported(self):
        parsed = parse_source('#开始\n甲：一。\n#开始\n乙：二。\n')
        codes = [e['code'] for e in parsed['errors']]
        self.assertIn('duplicate_label', codes)
        self.assertEqual(parsed['labels']['开始']['line'], 1)

    def test_choice_without_option_reported(self):
        parsed = parse_source('@choice 选什么？\n旁白：没人回答。\n')
        codes = [e['code'] for e in parsed['errors']]
        self.assertIn('choice_without_option', codes)
        node = parsed['chapters'][0]['scenes'][0]['nodes'][0]
        self.assertEqual(node['choices'], [])

    def test_jump_on_choice_rejected(self):
        parsed = parse_source('@choice 选什么？\n- 继续 -> x\n@jump x\n#x\n旁白：好。\n')
        codes = [e['code'] for e in parsed['errors']]
        self.assertIn('jump_on_choice', codes)

    def test_self_loop_branch_reported(self):
        parsed = parse_source('#起点\n@choice 选什么？\n- 继续 -> 起点\n')
        report = build_report(parsed, set())
        codes = [d['code'] for d in report['diagnostics']]
        self.assertIn('self_loop_branch', codes)

    def test_content_after_jump_is_warning(self):
        parsed = parse_source('甲：一。\n@jump 尾\n乙：二。\n#尾\n丙：三。\n')
        hit = [e for e in parsed['errors'] if e['code'] == 'content_after_jump']
        self.assertEqual(len(hit), 1)
        self.assertEqual(hit[0]['level'], 'warning')

    def test_compiler_module_importable(self):
        from app.project.story_compiler.compiler import compile_to_project
        self.assertTrue(callable(compile_to_project))


if __name__ == '__main__':
    unittest.main()
