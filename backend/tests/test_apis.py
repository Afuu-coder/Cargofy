import requests
import time

urls = [
    "http://localhost:8000/api/v1/shipments?status_filter=active",
    "http://localhost:8000/api/v1/alerts",
    "http://localhost:8000/api/v1/analytics/summary",
    "http://localhost:8000/api/v1/control-tower/snapshot",
    "http://localhost:8000/api/v1/fleet/vehicles",
    "http://localhost:8000/api/v1/fleet/drivers",
    "http://localhost:8000/api/v1/tracking/fleet/positions",
    "http://localhost:8000/api/v1/interventions/fleet/dashboard"
]

print(f"{'Endpoint':<50} | {'Status':<6} | {'Time(ms)':<8} | {'Data/Count'}")
print("-" * 90)

for url in urls:
    start = time.time()
    try:
        r = requests.get(url, timeout=5)
        elapsed = int((time.time() - start) * 1000)
        
        status = r.status_code
        data = ""
        
        if status == 200:
            json_data = r.json()
            if isinstance(json_data, list):
                data = f"{len(json_data)} items"
            elif isinstance(json_data, dict):
                if "count" in json_data:
                    data = f"{json_data['count']} items"
                else:
                    data = f"Object with {len(json_data.keys())} keys"
            else:
                data = str(json_data)[:20]
        else:
            data = r.text[:30]
            
        print(f"{url.split('8000')[1]:<50} | {status:<6} | {elapsed:<8} | {data}")
    except Exception as e:
        print(f"{url.split('8000')[1]:<50} | ERROR  | -        | {str(e)[:30]}")
