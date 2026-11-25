import argparse
import math
import random
import time
from datetime import datetime, timedelta, timezone
import httpx

def main():
    parser = argparse.ArgumentParser(description="Generate synthetic silo sensor readings")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--site-name", default="HarvestGuard Demo Site")
    parser.add_argument("--silo-name", default="Maize Silo 01")
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--interval", type=float, default=0.15, help="Seconds between simulated hours")
    args = parser.parse_args()
    random.seed(17)

    with httpx.Client(base_url=args.api, timeout=10) as client:
        sites = client.get("/api/sites").raise_for_status().json()
        site = next((s for s in sites if s["name"] == args.site_name), None)
        if site is None:
            site = client.post("/api/sites", json={"name": args.site_name, "county": "Nairobi"}).raise_for_status().json()

        silos = client.get("/api/silos", params={"site_id": site["id"]}).raise_for_status().json()
        silo = next((s for s in silos if s["name"] == args.silo_name), None)
        if silo is None:
            silo = client.post("/api/silos", json={"site_id": site["id"], "name": args.silo_name,
                "grain_type": "maize", "capacity_tonnes": 500}).raise_for_status().json()

        positions = [("HG-MUR-001-T01", "upper"), ("HG-MUR-001-T02", "middle"), ("HG-MUR-001-T03", "lower")]
        start = datetime.now(timezone.utc) - timedelta(hours=args.hours - 1)
        print(f"Simulating {args.hours} hourly readings across {len(positions)} sensor nodes...")
        for hour in range(args.hours):
            for index, (sensor_id, position) in enumerate(positions):
                wave = math.sin(hour / 9 + index * 0.6)
                temp = 25.0 + index * 1.1 + wave * 2.0 + random.gauss(0, 0.35)
                rh = 61.0 + index * 3.0 + math.sin(hour / 13) * 5 + random.gauss(0, 1.2)
                co2 = 650 + index * 100 + max(0, wave) * 180 + random.gauss(0, 25)
                # A mild synthetic lower-zone drift makes the demo trend visible; it is not a real outbreak.
                if hour > args.hours * 0.72 and index == 2:
                    temp += (hour - args.hours * 0.72) * 0.16
                    rh += (hour - args.hours * 0.72) * 0.45
                    co2 += (hour - args.hours * 0.72) * 18
                payload = {"silo_id": silo["id"], "sensor_id": sensor_id, "position": position,
                    "temperature_c": round(temp, 2), "relative_humidity_pct": round(min(rh, 99), 2),
                    "co2_ppm": round(co2, 1), "grain_moisture_pct": 13.2,
                    "recorded_at": (start + timedelta(hours=hour)).isoformat()}
                client.post("/api/readings", json=payload).raise_for_status()
            print(f"Hour {hour + 1}/{args.hours}: readings submitted")
            if args.interval:
                time.sleep(args.interval)
        print(f"Done. View risk at {args.api}/api/silos/{silo['id']}/risk")

if __name__ == "__main__":
    main()

