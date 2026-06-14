import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.session import engine, SessionLocal
from app.models.models import Base, Driver, Vehicle

# Create new tables
Base.metadata.create_all(bind=engine)

MOCK_DRIVERS = [
    {"id":"DRV-0042","org_id":"org_001","name":"Ramesh Kumar","phone":"+919876543210","whatsapp_verified":True,"fcm_token":"","status":"AVAILABLE","region":"NORTHEAST","product_certifications":["DAIRY","SEAFOOD","FROZEN"],"active_trip_id":None,"ack_rate":96.0,"avg_delay_minutes":8.0,"excursion_count_30d":1,"total_trips":48,"performance_score":98.0,"joined_at":"2022-03-15","last_seen_at":"2024-10-12T14:00:00Z"},
    {"id":"DRV-0051","org_id":"org_001","name":"Suresh Pandey","phone":"+919723411200","whatsapp_verified":True,"fcm_token":"","status":"ACTIVE","region":"NORTHEAST","product_certifications":["DAIRY","PRODUCE","FRUITS"],"active_trip_id":"AXN-2087","ack_rate":94.0,"avg_delay_minutes":11.0,"excursion_count_30d":2,"total_trips":41,"performance_score":94.0,"joined_at":"2021-07-10","last_seen_at":"2024-10-14T10:00:00Z"},
    {"id":"DRV-0064","org_id":"org_001","name":"Anuj Sharma","phone":"+919640055100","whatsapp_verified":True,"fcm_token":"","status":"AVAILABLE","region":"EAST","product_certifications":["DAIRY","FROZEN"],"active_trip_id":None,"ack_rate":89.0,"avg_delay_minutes":14.0,"excursion_count_30d":3,"total_trips":36,"performance_score":88.0,"joined_at":"2022-11-20","last_seen_at":"2024-10-13T18:00:00Z"},
    {"id":"DRV-0071","org_id":"org_001","name":"Dev Nair","phone":"+919610022100","whatsapp_verified":True,"fcm_token":"","status":"FLAGGED","region":"NORTHEAST","product_certifications":["DAIRY"],"active_trip_id":None,"ack_rate":72.0,"avg_delay_minutes":28.0,"excursion_count_30d":6,"total_trips":29,"performance_score":61.0,"joined_at":"2023-01-05","last_seen_at":"2024-10-14T11:00:00Z"},
    {"id":"DRV-0082","org_id":"org_001","name":"Bikash Roy","phone":"+919520031400","whatsapp_verified":True,"fcm_token":"","status":"FLAGGED","region":"NORTHEAST","product_certifications":["DAIRY"],"active_trip_id":None,"ack_rate":61.0,"avg_delay_minutes":35.0,"excursion_count_30d":9,"total_trips":31,"performance_score":48.0,"joined_at":"2023-05-15","last_seen_at":"2024-10-14T09:00:00Z"},
    {"id":"DRV-0091","org_id":"org_001","name":"Priya Das","phone":"+919600041500","whatsapp_verified":False,"fcm_token":"","status":"AVAILABLE","region":"EAST","product_certifications":["PRODUCE","FRUITS"],"active_trip_id":None,"ack_rate":84.0,"avg_delay_minutes":16.0,"excursion_count_30d":2,"total_trips":25,"performance_score":81.0,"joined_at":"2023-09-01","last_seen_at":"2024-10-14T08:00:00Z"},
]

MOCK_VEHICLES = [
    {"id":"VEH-0019","org_id":"org_001","plate":"MH-12-AB-3391","type":"REEFER_TRUCK","manufacturer":"Ashok Leyland","model":"Captain 3518","capacity_kg":5000,"capacity_liters":22000,"reefer_system":"Thermo King T-680","reefer_temp_range_min":-20,"reefer_temp_range_max":10,"reefer_health_score":98.0,"paired_sensor_id":"IoT-4821","sensor_battery_pct":78,"sensor_last_sync":"2024-10-14T14:00:00Z","status":"AVAILABLE","active_trip_id":None,"last_service_date":"2024-10-06","next_service_date":"2024-10-28","service_interval_days":22,"avg_temp_stability":0.3,"total_trips":142,"created_at":"2023-01-10"},
    {"id":"VEH-0023","org_id":"org_001","plate":"TN-01-AB-4521","type":"REEFER_TRUCK","manufacturer":"Tata Motors","model":"Prima","capacity_kg":8000,"capacity_liters":32000,"reefer_system":"Carrier Transicold","reefer_temp_range_min":-18,"reefer_temp_range_max":12,"reefer_health_score":68.0,"paired_sensor_id":"IoT-2044","sensor_battery_pct":55,"sensor_last_sync":"2024-10-14T09:00:00Z","status":"ACTIVE","active_trip_id":"AXN-2091","last_service_date":"2024-09-20","next_service_date":"2024-11-02","service_interval_days":30,"avg_temp_stability":1.2,"total_trips":88,"created_at":"2022-06-15"},
    {"id":"VEH-0031","org_id":"org_001","plate":"KA-09-DC-7744","type":"INSULATED_VAN","manufacturer":"Force Traveller","model":"T1","capacity_kg":1000,"capacity_liters":4000,"reefer_system":"N/A","reefer_temp_range_min":0,"reefer_temp_range_max":25,"reefer_health_score":0,"paired_sensor_id":None,"sensor_battery_pct":0,"sensor_last_sync":None,"status":"AVAILABLE","active_trip_id":None,"last_service_date":"2024-10-11","next_service_date":"2024-11-15","service_interval_days":35,"avg_temp_stability":2.1,"total_trips":58,"created_at":"2023-03-22"},
    {"id":"VEH-0038","org_id":"org_001","plate":"AS-01-BC-1110","type":"REEFER_TRUCK","manufacturer":"Eicher","model":"Pro 6016","capacity_kg":4000,"capacity_liters":18000,"reefer_system":"Thermo King V-500","reefer_temp_range_min":-15,"reefer_temp_range_max":8,"reefer_health_score":0,"paired_sensor_id":"IoT-0092","sensor_battery_pct":90,"sensor_last_sync":"2024-10-12T12:00:00Z","status":"MAINTENANCE","active_trip_id":None,"last_service_date":"2024-09-01","next_service_date":"2024-10-01","service_interval_days":30,"avg_temp_stability":3.4,"total_trips":61,"created_at":"2022-11-08"},
    {"id":"VEH-0044","org_id":"org_001","plate":"WB-08-EF-2291","type":"REEFER_TRUCK","manufacturer":"Ashok Leyland","model":"Captain 4940","capacity_kg":6000,"capacity_liters":26000,"reefer_system":"Carrier Vector 1850","reefer_temp_range_min":-25,"reefer_temp_range_max":12,"reefer_health_score":94.0,"paired_sensor_id":"IoT-3302","sensor_battery_pct":88,"sensor_last_sync":"2024-10-14T13:00:00Z","status":"AVAILABLE","active_trip_id":None,"last_service_date":"2024-10-08","next_service_date":"2024-11-05","service_interval_days":28,"avg_temp_stability":0.4,"total_trips":211,"created_at":"2021-08-30"},
]

db = SessionLocal()
try:
    for d in MOCK_DRIVERS:
        if not db.query(Driver).filter(Driver.id == d["id"]).first():
            db.add(Driver(**d))
            
    for v in MOCK_VEHICLES:
        if not db.query(Vehicle).filter(Vehicle.id == v["id"]).first():
            db.add(Vehicle(**v))
            
    db.commit()
    print("Successfully seeded drivers and vehicles")
finally:
    db.close()
