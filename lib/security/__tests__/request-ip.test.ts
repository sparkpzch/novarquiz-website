import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { getRateLimitIp } from '../request-ip';

const originalTrust = process.env.TRUST_PROXY;
before(() => { delete process.env.TRUST_PROXY; });
after(() => {
  if (originalTrust === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = originalTrust;
});

test('spoofed forwarding headers cannot rotate buckets when proxy trust is disabled', () => {
  for (const trust of [undefined, '0', 'false']) {
    if (trust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = trust;
    for (const address of ['192.0.2.1', '192.0.2.2']) {
      const request = new Request('https://quiz.example/api/auth/session', {
        headers: { 'x-forwarded-for': address, 'x-real-ip': address },
      });
      assert.equal(getRateLimitIp(request), 'untrusted');
    }
  }
});

test('trusted ingress uses the last forwarded address instead of attacker-controlled prefixes', () => {
  for (const trust of ['1', 'true']) {
    process.env.TRUST_PROXY = trust;
    const request = new Request('https://quiz.example/api/auth/session', {
      headers: { 'x-forwarded-for': '192.0.2.99, 2001:db8::1', 'x-real-ip': '192.0.2.100' },
    });
    assert.equal(getRateLimitIp(request), '2001:db8::1');
  }
});

test('missing forwarding headers retain a capped shared bucket', () => {
  process.env.TRUST_PROXY = '1';
  assert.equal(getRateLimitIp(new Request('https://quiz.example/api/auth/session')), 'untrusted');
});
