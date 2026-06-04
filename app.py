# Lambda/클라우드 엔트리포인트
# NoaVibe python-server 프레임워크가 루트의 app.py에서 app 객체를 탐색합니다.
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from spao_monitor.app import app  # noqa: F401
