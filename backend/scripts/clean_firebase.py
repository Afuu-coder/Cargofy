import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Remove imports
    content = re.sub(r'from app\.services import firebase_rtdb\n?', '', content)
    content = re.sub(r'import firebase_rtdb\n?', '', content)
    
    # Remove _firestore definition entirely
    content = re.sub(r'def _firestore\(\).*?return None', '', content, flags=re.DOTALL)
    content = re.sub(r'def _firestore\(\).*?except Exception:\s+return None', '', content, flags=re.DOTALL)
    content = re.sub(r'def _firestore_query\(.*?\)\s*->\s*List\[Dict\[str, Any\]\]:.*?except Exception:.*?return \[\]', '', content, flags=re.DOTALL)
    
    # Replace firebase_rtdb calls with pass or empty dict
    content = re.sub(r'firebase_rtdb\.[a-zA-Z_]+\(.*?\)', 'None', content)
    content = re.sub(r'=\s*None\s*or\s*{}', '= {}', content)
    content = re.sub(r'=\s*None\s*or\s*\[\]', '= []', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
files_to_process = [
    'c:/Users/afjal/Desktop/Cargofy/Axon/backend/app/routers/tracking.py',
    'c:/Users/afjal/Desktop/Cargofy/Axon/backend/app/routers/webhook.py',
    'c:/Users/afjal/Desktop/Cargofy/Axon/backend/app/routers/wizard.py',
    'c:/Users/afjal/Desktop/Cargofy/Axon/backend/app/services/escalation_service.py',
    'c:/Users/afjal/Desktop/Cargofy/Axon/backend/app/services/intervention_agent.py',
    'c:/Users/afjal/Desktop/Cargofy/Axon/backend/app/services/pubsub_service.py',
    'c:/Users/afjal/Desktop/Cargofy/Axon/backend/app/services/risk_compute_service.py',
    'c:/Users/afjal/Desktop/Cargofy/Axon/backend/app/services/simulator_service.py',
    'c:/Users/afjal/Desktop/Cargofy/Axon/backend/app/services/telemetry_pipeline.py'
]

for fp in files_to_process:
    if os.path.exists(fp):
        process_file(fp)
        print(f"Processed {fp}")
