#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WSGI configuration for Reg.ru hosting
Passenger WSGI interface for Flask application
"""

import sys
import os

# Добавляем текущую директорию в sys.path
INTERP = os.path.expanduser("~/virtualenv/md/bin/python3")
if sys.executable != INTERP:
    os.execl(INTERP, INTERP, *sys.argv)

# Добавляем директорию проекта в путь
sys.path.insert(0, os.path.dirname(__file__))

# Импортируем Flask приложение из server.py
from server import app as application

# Для отладки (можно удалить после успешного запуска)
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info("Passenger WSGI started successfully")
