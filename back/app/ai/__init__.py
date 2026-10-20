# _*_ Coding:utf-8 _*_
from flask import Blueprint

ai = Blueprint("ai", __name__)
import app.ai.views
