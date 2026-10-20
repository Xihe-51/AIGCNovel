@echo off
REM ============================================================
REM  AIGCNovel Celery Worker 启动脚本（Windows）
REM  - 必须用 -P solo（Windows 不支持 prefork）
REM  - --concurrency=1 保护 8G 显存 / 16G 内存
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"

echo [AIGCNovel] 启动 Celery Worker...
echo    broker  : redis://127.0.0.1:6380/1
echo    backend : redis://127.0.0.1:6380/2
echo.

".venv\Scripts\python.exe" -m celery -A celery_app worker -l info -P solo --concurrency=1
pause
