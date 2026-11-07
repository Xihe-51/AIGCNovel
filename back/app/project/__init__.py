# _*_ Coding:utf-8 _*_
from flask import Blueprint

project = Blueprint("project", __name__)
import app.project.views
import app.project.branch_views
import app.project.save_views
import app.project.read_views
import app.project.variable_views
import app.project.directive_views
import app.project.asset_views
import app.project.ending_views
import app.project.cg_views
import app.project.search_views
import app.project.chapter_views
import app.project.scene_lock_views
import app.project.gallery_views
import app.project.overview_views
import app.project.version_views
import app.project.outline_views
import app.project.glossary_views
import app.project.publish_views
import app.project.play_views
import app.project.patrol_views
import app.project.regression_views
import app.project.achievement_views
import app.project.report_views
import app.project.release_views
import app.project.meta_views
import app.project.compiler_views
import app.project.reader_views
import app.project.translation_views
import app.project.static_export_views
