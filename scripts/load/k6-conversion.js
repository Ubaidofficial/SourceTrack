import http from 'k6/http';
import { check, sleep } from 'k6';

// Read configuration from environment variables
const BASE_URL = __ENV.BASE_URL;
const SITE_KEY = __ENV.SITE_KEY;
const ALLOW_PRODUCTION_LOAD_TEST = __ENV.ALLOW_PRODUCTION_LOAD_TEST === 'true';

if (!BASE_URL || !SITE_KEY) {
  throw new Error('BASE_URL and SITE_KEY must be provided as environment variables! e.g., k6 run -e BASE_URL=http://localhost:3000 -e SITE_KEY=st_test_key scripts/load/k6-conversion.js');
}

// Safety check: refuse production-looking hosts
const prodPattern = /sourcetrack\.ai|srctk\.com|railway\.app/i;
if (prodPattern.test(BASE_URL) && !ALLOW_PRODUCTION_LOAD_TEST) {
  throw new Error('❌ SAFETY SHIELD: Refusing to run load test against production-looking BASE_URL: ' + BASE_URL + '. Set ALLOW_PRODUCTION_LOAD_TEST=true to override.');
}

// Configure scenarios matching Session 133L target spikes and bursts
export const options = {
  scenarios: {
    // 1. Smoke test: 1 VU, very low load
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '5s',
    },
    // 2. 200 events/sec peak spike
    spike_200: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 10,
      maxVUs: 50,
      startTime: '5s',
    },
    // 3. 500 events/sec high spike
    spike_500: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 25,
      maxVUs: 100,
      startTime: '15s',
    },
    // 4. 1000 events/sec short burst
    burst_1000: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '5s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      startTime: '25s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // less than 1% errors
    http_req_duration: ['p(95)<250'], // 95% of requests must complete under 250ms (allows for DB RPC overhead)
  },
};

export default function () {
  const url = `${BASE_URL}/api/conversion`;
  const orderId = `k6-order-${__VU}-${__ITER}-${Date.now()}`;
  const payload = JSON.stringify({
    site_key: SITE_KEY,
    anonymous_id: `k6-anon-${__VU}-${__ITER}`,
    conversion_value: 99.99,
    conversion_type: 'purchase',
    order_id: orderId,
    page_url: 'http://example.com/checkout/thank-you',
    referrer: 'http://google.com',
    utm_source: 'k6-load-test',
    utm_medium: 'cpc',
    utm_campaign: 'capacity-run-133L',
    timestamp: new Date().toISOString(),
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-testing-agent',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'success is true': (r) => {
      try {
        return JSON.parse(r.body).success === true;
      } catch (_) {
        return false;
      }
    },
  });

  sleep(0.1);
}
