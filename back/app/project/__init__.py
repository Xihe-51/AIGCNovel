# _*_ Coding:utf-8 _*_
from flask import Blueprint

project = Blueprint("project", __name__)
import app.project.views
import app.project.branch_views
import app.project.save_views
import app.project.read_views
import app.project.variable_views
import app.project.ending_views
import app.project.cg_views
