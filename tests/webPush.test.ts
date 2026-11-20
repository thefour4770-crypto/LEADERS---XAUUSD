import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPushSubscriptionCount,
  getVapidPublicKey,
  isValidPushSubscription,
  removePushSubscription,
  upsertPushSubscription,
} from '../server/webPushStore.ts';

test('isValidPushSubscription enforces HTTPS endpoints and valid keys', () => {
  assert.equal(isValidPushSubscription(null), false);
  assert.equal(isValidPushSubscription({}), false);
  assert.equal(
    isValidPushSubscription({
      endpoint: 'http://insecure.example/push/123',
      keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa', auth: 'tBHItJI5svbpC7' },
    }),
    false
  );
  assert.equal(
    isValidPushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'short', auth: 'ok' },
    }),
    false
  );
  assert.equal(
    isValidPushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/valid-endpoint-token',
      keys: {
        p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8',
        auth: 'tBHItJI5svbpC7',
      },
    }),
    true
  );
});

test('getVapidPublicKey returns a stable URL-safe VAPID public key', async () => {
  const key1 = await getVapidPublicKey();
  const key2 = await getVapidPublicKey();
  assert.equal(typeof key1, 'string');
  assert.ok(key1.length >= 60);
  assert.equal(/^[A-Za-z0-9_-]+$/.test(key1), true);
  assert.equal(key1, key2);
});

test('upsertPushSubscription and removePushSubscription track active endpoints cleanly', async () => {
  const endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/test-leaders-endpoint';
  const validSub = {
    endpoint,
    keys: {
      p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8',
      auth: 'tBHItJI5svbpC7',
    },
  };

  const upsertRes = await upsertPushSubscription(validSub, 'UnitTestAgent/1.0');
  assert.equal(upsertRes.saved, true);
  assert.ok(upsertRes.count >= 1);
  assert.equal(await getPushSubscriptionCount(), upsertRes.count);

  const removed = await removePushSubscription(endpoint);
  assert.equal(removed, true);
  assert.equal(await removePushSubscription(endpoint), false);
});
