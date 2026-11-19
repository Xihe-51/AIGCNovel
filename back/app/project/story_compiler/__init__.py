# -*- coding: utf-8 -*-
"""叙事编译器分层包。

- parser：源文本 → AST
- report：AST → 统计 / 诊断 / 建议
- compiler：AST → 项目数据库 + source map
- views：HTTP 接口与参数校验
"""
from .parser import parse_source
from .report import build_report, structure_preview
from .compiler import compile_to_project

__all__ = ['parse_source', 'build_report', 'structure_preview', 'compile_to_project']
