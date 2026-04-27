"""
Axon -- Database Setup
Run once to create the axon PostgreSQL role + database + all tables.

Usage:
    python setup_db.py
    python setup_db.py --password yourpassword
"""

import argparse
import sys
import time

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT


def create_role_and_db(pg_user, pg_password, pg_host, pg_port):
    print("[*] Connecting to PostgreSQL as '{}' on {}:{}...".format(pg_user, pg_host, pg_port))

    connect_kwargs = dict(user=pg_user, host=pg_host, port=pg_port, dbname="postgres")
    if pg_password:
        connect_kwargs["password"] = pg_password

    try:
        conn = psycopg2.connect(**connect_kwargs)
    except psycopg2.OperationalError as e:
        print("\n[ERROR] Connection failed: {}".format(e))
        print("\n[TIP] Try:")
        print("  1. Open pgAdmin -> Query Tool and run setup_db.sql manually")
        print("  2. Or: python setup_db.py --password <your_postgres_password>")
        sys.exit(1)

    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_roles WHERE rolname='axon'")
    if cur.fetchone():
        print("[OK] Role 'axon' already exists -- skipping")
    else:
        cur.execute("CREATE ROLE axon WITH LOGIN PASSWORD 'axon_dev_password'")
        print("[OK] Created role 'axon'")

    cur.execute("SELECT 1 FROM pg_database WHERE datname='axon_db'")
    if cur.fetchone():
        print("[OK] Database 'axon_db' already exists -- skipping")
    else:
        cur.execute("CREATE DATABASE axon_db OWNER axon ENCODING 'UTF8'")
        print("[OK] Created database 'axon_db'")

    cur.execute("GRANT ALL PRIVILEGES ON DATABASE axon_db TO axon")
    cur.close()
    conn.close()
    print("[OK] Granted privileges")


def create_tables():
    print("\n[*] Creating tables via SQLAlchemy...")
    from app.db.session import engine, Base
    import app.models.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    print("[OK] All tables created (or already exist)")


def seed_demo_data():
    print("\n[*] Seeding demo data...")
    from app.db.session import SessionLocal
    from app.models.models import User
    db = SessionLocal()
    try:
        exists = db.query(User).filter(User.phone == "+919999999999").first()
        if not exists:
            user = User(
                name="Demo Owner",
                phone="+919999999999",
                business_name="Axon Demo MSME",
                business_type="dairy",
            )
            db.add(user)
            db.commit()
            print("[OK] Demo user created: +919999999999")
        else:
            print("[OK] Demo user already exists")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Axon Database Setup")
    parser.add_argument("--postgres-user", default="postgres")
    parser.add_argument("--password",      default=None)
    parser.add_argument("--host",          default="localhost")
    parser.add_argument("--port",          type=int, default=5432)
    parser.add_argument("--skip-role",     action="store_true")
    args = parser.parse_args()

    print("\n[AXON] Database Setup")
    print("-" * 40)

    if not args.skip_role:
        create_role_and_db(args.postgres_user, args.password or "", args.host, args.port)
        time.sleep(0.5)

    create_tables()
    seed_demo_data()

    print("\n" + "-" * 40)
    print("[DONE] Database setup complete!")
    print("\nNext steps:")
    print("  1. venv\\Scripts\\uvicorn main:app --reload")
    print("  2. cd ../frontend && npm run dev")


if __name__ == "__main__":
    main()
