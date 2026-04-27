#!/bin/bash
# Axon Production Startup Script
# 1. Run seed script to populate demo data if DB is empty
# 2. Start the FastAPI server

set -e

echo "🌱 Checking and seeding demo data..."
python -c "
import sys, os
sys.path.insert(0, '/app')
os.chdir('/app')

from app.db.session import SessionLocal, Base, engine
from app.models.models import User

Base.metadata.create_all(bind=engine)
db = SessionLocal()
user_count = db.query(User).count()
db.close()

if user_count == 0:
    print('Database is empty — running seed script...')
    import subprocess
    result = subprocess.run(['python', 'scripts/seed.py'], capture_output=True, text=True, cwd='/app')
    print(result.stdout)
    if result.returncode != 0:
        print('Seed error:', result.stderr)
else:
    print(f'Database already has {user_count} user(s) — skipping seed.')
"

echo "🚀 Starting Axon FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8080
