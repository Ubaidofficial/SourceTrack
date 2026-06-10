# Ingestion Pipeline Load Testing Suite

This folder contains [k6](https://k6.io/) load testing scripts to verify and stress test the SourceTrack event ingestion pipeline under realistic production-grade traffic (50M–100M events/month capacity).

---

## ⚠️ Safety Shield & Production Protections

To prevent accidental load spikes against production environments, these scripts are equipped with **safety guards**:
1. **Target URLs containing `sourcetrack.ai`, `srctk.com`, or `railway.app` will be blocked automatically.**
2. **Explicit environment variables are strictly required** (`BASE_URL` and `SITE_KEY`).
3. To override the production blocker, you must set `ALLOW_PRODUCTION_LOAD_TEST=true`. **Do not do this unless you have explicit approval and a confirmed maintenance window.**

---

## 🚀 Execution Instructions

First, ensure `k6` is installed on your local system:
```bash
# macOS
brew install k6

# Debian/Ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5D5E675002A3741
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### 1. Test Ingestion Tracking (`/api/track`)
This script simulates standard pageview events with UTM campaign queries, referrers, and timestamps.
```bash
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e SITE_KEY=st_test_site_key_here \
  scripts/load/k6-track.js
```

### 2. Test Conversions (`/api/conversion`)
This script simulates purchase conversion events carrying values, order IDs, and conversion types, triggering Supabase idempotency RPC checks.
```bash
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e SITE_KEY=st_test_site_key_here \
  scripts/load/k6-conversion.js
```

### 3. Test Cookieless Token Generation (`/api/tracker/id`)
This script targets the cookieless identity hashing endpoint, verifying crypto/HMAC execution performance.
```bash
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e SITE_KEY=st_test_site_key_here \
  scripts/load/k6-tracker-id.js
```

---

## 📈 Test Scenarios Included

Each script walks through the following phases consecutively:

1. **`smoke`**: 1 Virtual User (VU) for 5 seconds to verify endpoint health and base responses.
2. **`spike_200`**: Constant arrival rate of **200 events/second** for 10 seconds to simulate standard launch traffic peaks.
3. **`spike_500`**: Constant arrival rate of **500 events/second** for 10 seconds to simulate high-concurrency traffic spikes.
4. **`burst_1000`**: Constant arrival rate of **1,000 events/second** for 5 seconds to test maximum pipeline burst headroom.
