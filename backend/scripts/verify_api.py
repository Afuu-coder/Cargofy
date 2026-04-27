import httpx, json
r = httpx.get("http://localhost:8000/api/v1/shipments")
ships = r.json()
print(f"Shipments in API: {len(ships)}")
for s in ships:
    risk = s.get("current_risk") or {}
    cat  = risk.get("risk_category", "none")
    pct  = round((risk.get("risk_score") or 0) * 100)
    code = s["shipment_code"]
    pt   = s["product_type"]
    print(f"  {code:<20} {pt:<8} {cat} {pct}%")
