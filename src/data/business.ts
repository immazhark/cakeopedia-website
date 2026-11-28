// Single source of truth for owner-supplied business facts (catalogue, add-ons, care, pending items).
// Prices are integer USD cents; `null` means "not supplied" and must never render as $0 or an estimate.
// Source: owner menus dated Jun–Aug 2024, treated as catalogue candidates until current availability is approved.
import { cupcakePrice, celebrationFlavours, celebrationShapes, celebrationServings, browniePrice, brownieToppings, BROWNIE_TOPPING_CENTS, brownieSlabServings } from './pricing.ts';
export type Money = number | null;
export interface Flavour { id: string; name: string; description: string }

export const customCake = {
  id: 'custom-cake', name: 'Custom cakes', startingCents: 13500, minimumOrderCents: 13500,
  base: { diameterIn: 6, layers: 4, servings: 20, heightIn: '5–6' },
  // Starting price is for the base configuration only; final price depends on size, flavour, design and add-ons.
  note: 'From $135 for a 6-inch, four-layer cake (about 20 servings). The final price depends on size, flavour, design and add-ons, and is agreed in your quotation.',
} as const;

export const flavours: readonly Flavour[] = [
  { id: 'vanilla-symphony', name: 'Vanilla Symphony', description: 'Vanilla cake layers filled with Swiss meringue buttercream.' },
  { id: 'berrylicious-dream', name: 'Berrylicious Dream Cake', description: 'Moist vanilla cake with a house-made berry filling and berry-flavoured buttercream.' },
  { id: 'butterscotch-indulgence', name: 'Butterscotch Indulgence', description: 'Butterscotch sauce, praline and butterscotch-flavoured buttercream.' },
  { id: 'biscoff-bliss', name: 'Biscoff Bliss', description: 'Vanilla cake with Biscoff spread, Biscoff cookie crumbs and Biscoff buttercream. A chocolate ganache or Nutella decoration is optional.' },
  { id: 'truffle-temptation', name: 'Truffle Temptation', description: 'Rich chocolate cake layers with truffle ganache.' },
  { id: 'biscoff-chocolate-delight', name: 'Biscoff Chocolate Delight', description: 'Chocolate cake filled with Biscoff spread and finished with Biscoff-flavoured buttercream.' },
  { id: 'nutella-nirvana', name: 'Nutella Nirvana', description: 'Chocolate cake layers filled with Nutella and finished with Nutella-infused buttercream.' },
  { id: 'dulce-de-leche-delight', name: 'Dulce de Leche Delight', description: 'Chocolate cake filled with dulce de leche, topped with dulce de leche buttercream and caramel sauce.' },
  { id: 'rasmalai-cake', name: 'Rasmalai Cake', description: 'Vanilla sponge infused with saffron and cardamom, filled with creamy rasmalai pieces and finished with Swiss meringue buttercream.' },
  { id: 'lemon-blueberry', name: 'Lemon Blueberry Cake', description: 'Blueberry sponge filled with lemon curd and frosted with Swiss meringue buttercream.' },
  { id: 'chocolate-caramel', name: 'Chocolate Caramel Cake', description: 'Rich chocolate cake layers filled with smooth caramel.' },
  { id: 'coffee-chocolate', name: 'Coffee Chocolate Cake', description: 'Espresso-infused chocolate cake filled and frosted with mocha buttercream.' },
];

export const celebrationCake = {
  id: 'celebration-cake', name: 'Celebration Cakes', priceCents: 7500, diameterIn: 6, layers: 2, shapes: celebrationShapes,
  customisation: ['Choice of colour', 'Pearl sprinkles', 'Personalised message or coin topper', 'Choice of round or heart shape'],
  flavours: celebrationFlavours, servings: celebrationServings, // no fondant work; the custom-cake minimum does not apply
} as const;

export const cupcakes = {
  id: 'cupcakes', name: 'Cupcakes', dozenCents: cupcakePrice.dozenCents, minimumDozens: cupcakePrice.minimumDozens, sameFlavour: cupcakePrice.sameFlavour, // per dozen; no topping or filling surcharges
  options: [
    { base: 'Vanilla cupcakes with Swiss meringue buttercream', fillings: ['Butterscotch', 'Blueberry', 'Strawberry', 'Lemon curd', 'Caramel', 'Lotus Biscoff', 'Rasmalai'] },
    { base: 'Chocolate cupcakes with chocolate ganache', fillings: ['Nutella', 'Lotus Biscoff'] },
  ],
  // The source image is ambiguous whether "caramel, chocolate ganache" is one filling or two. Not published until confirmed.
  unconfirmedFillings: ['Caramel', 'Chocolate ganache'],
} as const;

export const brownies = {
  id: 'brownies', name: 'Brownies', priceCents: browniePrice.boxCents, // box of nine; the topping upgrade is once per box or slab
  slabPriceCents: browniePrice.slabCents, toppingUpgradeCents: BROWNIE_TOPPING_CENTS, slabServings: brownieSlabServings,
  description: 'Rich, fudgy brownies made with Belgian chocolate and Dutch-process cocoa.',
  toppings: brownieToppings,
  formats: ['Box of nine brownies', 'Brownie slab with a personalised message'],
  slab: { name: 'Fudge Delight Brownie Slab', description: 'A fudgy brownie slab made with Dutch-process cocoa, topped with chocolate buttercream or ganache, with a personalised message. Nutella, Biscoff or ganache toppings are available.' },
} as const;

export interface Addon { id: string; name: string; priceCents: number; note?: string; appliesTo: readonly ('custom' | 'celebration')[] }
// Applicability to Celebration Cakes is unconfirmed, so add-ons are limited to custom cakes for now.
export const addons: readonly Addon[] = [
  { id: 'artificial-flowers', name: 'Artificial flowers', priceCents: 1500, appliesTo: ['custom'] },
  { id: 'fondant-accents', name: 'Fondant accents (3–4 pieces)', priceCents: 2000, appliesTo: ['custom'] },
  { id: 'acrylic-topper', name: 'Acrylic topper', priceCents: 2000, note: 'Subject to size and availability.', appliesTo: ['custom'] },
];

export const ingredientStatements = ['Made with kosher-certified ingredients.', 'Prepared using alcohol-free ingredients.'] as const;
export const ingredientScope = 'These statements describe ingredients only; they are not a certification of the finished cakes or the kitchen. Eggless, vegan and gluten-free cakes are not offered.';

// Reusable for the care page, confirmation emails and print. Durations the owner has not supplied are deliberately absent.
export const careSteps: readonly { id: string; title: string; text: string }[] = [
  { id: 'carrying', title: 'Carrying', text: 'Always support the cake box from underneath so its weight is spread evenly.' },
  { id: 'transport', title: 'Transport', text: 'Keep the box flat on a level surface, such as the car floor. Avoid sudden braking, sharp turns and excessive movement.' },
  { id: 'temperature', title: 'Temperature', text: 'Travel in an air-conditioned vehicle and refrigerate as instructed until the event. Keep the cake out of direct sunlight and heat.' },
  { id: 'decorations', title: 'Decorations', text: 'Remove flowers, baubles, non-edible toppers and any other non-edible decorations before cutting and serving.' },
  { id: 'cutting', title: 'Cutting', text: 'Use a sharp knife. A cutting guide is planned to help you reach the recommended number of servings.' },
  { id: 'leftovers', title: 'Leftovers', text: 'For products suitable for freezing, double-wrap leftovers in plastic wrap, place them in a suitable container and freeze for up to four weeks, subject to product-specific storage instructions.' },
];

// Owner-confirmed 26 Nov 2026 (core requirements freeze). Email is approved but not provisioned: do not publish it until it is.
export const businessEmail = 'contact@cakeopedia.com';
export const tagline = 'Custom baked goods';
export const paymentTerms = [
  '50% advance payment confirms an order.',
  'The remaining 50% is due at least 48 hours before pickup or delivery.',
  'Payment is by Zelle.',
  'Two weeks’ notice is recommended; short-notice orders are subject to availability.',
] as const;

// Still open, and not core business facts: one place for the remaining decision register.
export const pending = [
  'Current availability of each menu item (menus are dated Jun–Aug 2024)',
  'Whether caramel and chocolate ganache are separate cupcake fillings',
  'Delivery area detail (ZIP codes), delivery charges, pickup days, weekend availability',
  'Final customer-facing policy wording and legal review (business email contact@cakeopedia.com is live and verified)',
  'Product-specific refrigeration, shelf life and allergen matrix; Texas cottage food: DSHS rules verified 27 Nov 2026 (docs/compliance-texas-cottage-food.md), owner to confirm TCS items, food handler training and label address versus DSHS number',
] as const;
