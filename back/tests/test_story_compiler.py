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


if __name__ == '__main__':
    unittest.main()
