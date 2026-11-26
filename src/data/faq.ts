import type { Catalogue } from './catalogue.ts';
import { configs, label } from './serving.ts';
import { ingredientScope, ingredientStatements, paymentTerms } from './business.ts';

// Customer questions answered only from owner-confirmed facts. Prices come from the catalogue so the FAQ can never contradict the menu.
// Deliberately absent until confirmed: delivery area and fees, cancellation wording, allergen and storage advice, cupcake prices.
const usd = (c: number) => '$' + (c % 100 === 0 ? c / 100 : (c / 100).toFixed(2));
export interface Faq { id: string; q: string; a: string }

export function buildFaq(cat: Catalogue): Faq[] {
  const sizes = Object.keys(cat.baseCents).sort((a, b) => Number(a) - Number(b));
  const cheapest = sizes.map((d) => `${d}-inch ${usd(cat.baseCents[d]!)}`).join(', ');
  const rasmalai = sizes.map((d) => `${d}-inch ${usd(cat.baseCents[d]! + cat.rasmalaiCents[d]!)}`).join(', ');
  const singles = configs.filter((c) => c.kind === 'single').map((c) => `${label(c)}: about ${c.servings}`).join('; ');
  return [
    { id: 'price', q: 'How much does a custom cake cost?', a: `Custom cakes start at ${cheapest} for a single-tier, four-layer cake. Rasmalai Cakes start at ${rasmalai}. Two- and three-tier cakes are quoted personally. The final price depends on size, flavour, design and add-ons, and you receive a personal quotation before anything is confirmed.` },
    { id: 'servings', q: 'How many people does a cake serve?', a: `For single-tier, four-layer cakes: ${singles}. Two- and three-tier cakes serve more; the size guide helps you choose from your guest count.` },
    { id: 'celebration', q: 'What is a Celebration Cake?', a: `A smaller six-inch, two-layer cake for ${usd(cat.celebrationCents)}, serving about 8 to 10, round or heart-shaped. You choose a colour, pearl sprinkles and a personalised message or coin topper. Flavours: ${cat.celebrationFlavours.filter((f) => !cat.pausedCelebrationFlavours.includes(f)).join(', ')}. There is no fondant work.` },
    { id: 'notice', q: 'How far ahead should I order?', a: 'Two weeks’ notice is recommended. Short-notice orders are possible subject to availability, so send an enquiry with your date and we will tell you.' },
    { id: 'payment', q: 'How do deposits and payment work?', a: `${paymentTerms.slice(0, 3).join(' ')} An enquiry does not reserve a date; your order is confirmed once the quotation is agreed and the advance payment is received.` },
    { id: 'brownies', q: 'What do brownies cost?', a: `A box of nine brownies is ${usd(cat.brownieBoxCents)} and the Fudge Delight Brownie Slab is ${usd(cat.brownieSlabCents)}. A topping (Nutella, Lotus Biscoff or chocolate ganache) adds ${usd(cat.brownieToppingCents)} per box or slab, not per brownie. Unusual quantities are reviewed individually.` },
    { id: 'inspiration', q: 'Can I share inspiration pictures?', a: 'Yes. The enquiry form lets you add up to three pictures from anywhere, plus a note describing what you like. Your pictures are stored privately and used only to discuss your order. A picture inspires a conversation; it is not a promise of an exact copy.' },
    { id: 'ingredients', q: 'What ingredients do you use?', a: `${ingredientStatements.join(' ')} ${ingredientScope}` },
  ];
}

/** Plain text of every answer, for tests and for guarding against unapproved claims. */
export const faqText = (items: Faq[]) => items.map((i) => `${i.q} ${i.a}`).join('\n');
