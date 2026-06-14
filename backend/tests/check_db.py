import os
from dotenv import load_dotenv
load_dotenv(r'c:\Users\afjal\Desktop\Cargofy\Cargofy\backend\.env')

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine(os.getenv('DATABASE_URL'))
Session = sessionmaker(bind=engine)
session = Session()

try:
    users = session.execute(text('SELECT COUNT(*) FROM users')).scalar()
    ships = session.execute(text('SELECT COUNT(*) FROM shipments')).scalar()
    print(f"Yes! Users: {users}, Shipments: {ships}")
except Exception as e:
    print(f"DB empty or no tables. Error: {e}")

session.close()
