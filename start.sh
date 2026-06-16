#!/bin/bash
# Multi worker server
gunicorn -k uvicorn.workers.UvicornWorker --workers=2 --bind=0.0.0.0:8000 --reload --timeout=300 app.main:app