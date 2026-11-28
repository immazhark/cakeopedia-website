import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalClientNetwork } from '../worker/client-network.ts';

test('strict IPv4 identity rejects ambiguous encodings',()=>{
  assert.equal(canonicalClientNetwork('192.0.2.1'),'v4:192.0.2.1');
  for(const ip of ['192.00.2.1','192.0.2.256','192.0.2','0xc0000201','192.0.2.1:80','192.0.2.1,198.51.100.1']){
    assert.equal(canonicalClientNetwork(ip),null);
  }
});
test('IPv6 representation and host rotations collapse to a canonical /64',()=>{
  for(const ip of ['2001:0DB8:0001:0002:0000:0000:0000:0001','2001:db8:1:2::1','2001:db8:1:2:ffff:aaaa:bbbb:cccc']){
    assert.equal(canonicalClientNetwork(ip),'v6:2001:db8:1:2::/64');
  }
  assert.equal(canonicalClientNetwork('2001:db8:1:3::1'),'v6:2001:db8:1:3::/64');
  assert.equal(canonicalClientNetwork('::1'),'v6:0:0:0:0::/64');
});
test('IPv4-mapped IPv6 cannot bypass the IPv4 bucket',()=>{
  for(const ip of ['::ffff:192.0.2.1','0:0:0:0:0:ffff:c000:201','::FFFF:C000:0201']){
    assert.equal(canonicalClientNetwork(ip),'v4:192.0.2.1');
  }
});
test('invalid or non-address inputs fail closed',()=>{
  for(const ip of [null,'','localhost','[::1]','fe80::1%eth0','2001:db8::/64',':::', '2001::db8::1',' ::1','::1\n','a'.repeat(80)]){
    assert.equal(canonicalClientNetwork(ip),null);
  }
});
