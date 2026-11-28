// Pure, provisional message builder. Persist the exact bytes before sending.
// Copy and sender identity require approval before production activation.
type Config = Readonly<{ from: string; owner: string }>;
type Contact = Readonly<{ kind: 'email' | 'phone' | 'instagram'; value: string }>;
type Snapshot = { kind: 'send'; payload: string } | { kind: 'skip'; reason: 'non_email_contact' };
export function address(value: string): string {
  if (value.length > 254 || !/^[a-zA-Z0-9.!#$%&'*+\/=\?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(value) || /[\r\n]/.test(value)) throw Error('Invalid notification address');
  return value;
}
export function validateNotificationAddresses(config: Config): void {
  address(config.from);
  address(config.owner);
}
export function notificationSnapshot(config: Config, role: 'owner' | 'customer', reference: string, contact: Contact): Snapshot {
  if (!/^CK-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(reference)) throw Error('Invalid notification reference');
  if (role === 'customer' && contact.kind !== 'email') return { kind: 'skip', reason: 'non_email_contact' };
  const from = address(config.from);
  const to = [address(role === 'owner' ? config.owner : contact.value)];
  const subject = role === 'owner' ? 'New Cakeopedia enquiry' : 'Your Cakeopedia enquiry';
  const text = role === 'owner'
    ? `A new enquiry has been received. Reference: ${reference}. Review it in the private owner dashboard.`
    : `Thank you for your enquiry. Reference: ${reference}. This is not an order confirmation. Your design, price and availability must be agreed personally.`;
  return { kind: 'send', payload: JSON.stringify({ from, to, subject, text }) };
}
