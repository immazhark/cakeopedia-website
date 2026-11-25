import assert from 'node:assert/strict';
import { test } from 'node:test';
import { notificationSnapshot } from '../worker/notification-snapshot.ts';
const config = { from: 'sender@example.invalid', owner: 'owner@example.invalid' };
const reference = 'CK-12345678-1234-4234-8234-123456789abc';
const email = { kind: 'email', value: 'customer@example.invalid' } as const;

test('owner alert contains only reference, never customer contact details', () => {
  const result = notificationSnapshot(config, 'owner', reference, email);
  assert.equal(result.kind, 'send');
  if (result.kind !== 'send') return;
  const payload = JSON.parse(result.payload);
  assert.deepEqual(payload.to, [config.owner]);
  assert.ok(payload.text.includes(reference));
  assert.ok(!result.payload.includes(email.value));
});
test('customer acknowledgement is not an order confirmation', () => {
  const result = notificationSnapshot(config, 'customer', reference, email);
  assert.equal(result.kind, 'send');
  if (result.kind !== 'send') return;
  assert.deepEqual(JSON.parse(result.payload).to, [email.value]);
  assert.match(JSON.parse(result.payload).text, /not an order confirmation/i);
  assert.equal(result.payload, (notificationSnapshot(config, 'customer', reference, email) as typeof result).payload);
});
test('non-email enquiries never invent an email recipient', () => {
  for (const contact of [{kind:'phone',value:'5550000000'}, {kind:'instagram',value:'sample'}] as const) {
    assert.deepEqual(notificationSnapshot(config, 'customer', reference, contact), {kind:'skip',reason:'non_email_contact'});
    assert.equal(notificationSnapshot(config, 'owner', reference, contact).kind, 'send');
  }
});
test('invalid reference, injected address and missing owner configuration fail closed', () => {
  assert.throws(() => notificationSnapshot(config, 'owner', 'fake\nreference', email));
  assert.throws(() => notificationSnapshot({...config, owner:''}, 'owner', reference, email));
  assert.throws(() => notificationSnapshot(config, 'customer', reference, {...email,value:'a@example.invalid\nb@example.invalid'}));
});
