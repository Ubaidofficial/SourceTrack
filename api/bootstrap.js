import 'dotenv/config'
import { enforceEnvironmentSafety } from './lib/environment-safety.js'
import { AsyncLocalStorage } from 'async_hooks';

// AsyncLocalStorage for request-scoped date mocking (only active in non-production tests)
const isTestMode = process.env.NODE_ENV !== 'production' && process.env.ALLOW_TEST_TIME_MOCK === 'true';

if (isTestMode) {
  const timeMockStorage = new AsyncLocalStorage();
  global.timeMockStorage = timeMockStorage;

  const OriginalDate = global.Date;
  class MockDate extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) {
        const mockTime = timeMockStorage.getStore();
        if (mockTime) {
          super(mockTime);
          return;
        }
      }
      super(...args);
    }
  }
  global.Date = MockDate;
  // Copy static methods
  Object.getOwnPropertyNames(OriginalDate).forEach(name => {
    if (name !== 'length' && name !== 'name' && name !== 'prototype') {
      global.Date[name] = OriginalDate[name];
    }
  });
  global.Date.now = function() {
    const mockTime = timeMockStorage.getStore();
    if (mockTime) {
      return new OriginalDate(mockTime).getTime();
    }
    return OriginalDate.now();
  };
}

enforceEnvironmentSafety()

await import('./index.js')
