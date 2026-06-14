import re

filepath = r'c:\Users\afjal\Desktop\Cargofy\Axon\backend\app\routers\shipment_detail.py'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'from app\.services import firebase_rtdb\n?', '', content)
content = re.sub(r'live = firebase_rtdb\.get_shipment_state\(shipment_code\) or \{\}', 'live = {}', content)
content = re.sub(r'firebase_rtdb\.push_shipment_state\(.*?\)', 'pass', content, flags=re.DOTALL)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
