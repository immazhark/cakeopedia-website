import manifest from './media-manifest.json';

// Previous work only: nothing here is a menu product. No prices, flavours, sizes or servings are
// stated because none are owner-approved. Alt text and notes describe only what the photo shows.
// `confirm` lists provenance questions for the owner (shown in docs/media-plan.md, never on the page).
export type Category = 'floral' | 'vintage' | 'celebration' | 'minis';
export const categories: Record<Category, string> = { floral: 'Floral', vintage: 'Vintage', celebration: 'Celebrations', minis: 'Mini cakes' };

export interface Creation {
  slug: string;
  title: string;
  cats: Category[];
  alt: string;
  video?: { slug: keyof typeof manifest.videos; caption: string };
  /** Cover is a still frame taken from the video rather than a photograph. */
  poster?: boolean;
  focus?: string;
  confirm?: string;
}

export const creations: Creation[] = [
  { slug: 'vintage-piped-castle', title: 'Pink vintage piping, start to finish', cats: ['vintage'], poster: true,
    alt: 'A pink buttercream cake with scalloped vintage piping on a turntable, a gloved hand holding a piping bag',
    video: { slug: 'vintage-piped-castle', caption: 'Piping the borders by hand, filmed in the kitchen. Silent clip.' }, focus: '50% 55%', confirm: 'Kitchen visible in footage; confirm owner is happy to show it.' },
  { slug: 'ruby-rose-mr-and-mrs', title: 'Ruby roses and a gold Mr & Mrs', cats: ['floral'], alt: 'Tall white cake with a textured finish, covered on one side with deep red roses and topped with a gold Mr & Mrs topper' },
  { slug: 'blush-rose-marble', title: 'Blush roses on a marbled finish', cats: ['floral'], alt: 'Cream cake with a peach marbled finish, a gold Mr & Mrs topper and a crown of pink and burgundy roses' },
  { slug: 'crimson-cascade', title: 'Crimson cascade', cats: ['floral'], alt: 'White cake with a cascade of red and burgundy flowers running down one side' },
  { slug: 'pampas-and-peach-roses', title: 'Pampas grass and peach roses', cats: ['floral'], alt: 'Peach-toned cake with pampas grass at the top and peach and pink roses around the base' },
  { slug: 'pink-rose-crown', title: 'Pink rose crown', cats: ['floral'], alt: 'Tall cream cake with a crown of pink roses and a trail of blooms down its side' },
  { slug: 'white-feather-bloom', title: 'White blooms and feathers', cats: ['floral'], alt: 'White cake with white roses, feather-like white decorations and a gold plaque' },
  { slug: 'love-three-tier', title: 'Three tiers with love lettering', cats: ['floral'], alt: 'Three-tier cake in white and pink with the word love on the bottom tier and red and pink flowers' },
  { slug: 'anniversary-neon-roses', title: 'Anniversary roses under a glowing sign', cats: ['floral'], alt: 'White cake with burgundy roses and gold lettering on a crystal stand with a glowing Happy Anniversary sign above' },
  { slug: 'texas-hearts-three-tier', title: 'Ribbed tiers and red roses', cats: ['floral'], alt: 'Three-tier cake with ribbed white tiers, red and white flowers and small heart decorations', focus: '50% 40%' },
  { slug: 'gold-leaf-garden', title: 'Gold leaf and garden flowers', cats: ['floral'], alt: 'Two-tier cake with a soft peach finish, gold leaf and pink and white flowers', confirm: 'Studio-style backdrop differs from the other photos; confirm date and place before calling it Austin work.' },
  { slug: 'vintage-fig-cross-stitch', title: 'Cross-stitch and figs', cats: ['vintage', 'floral'], alt: 'Square cream cake with piped borders, a green cross-stitch pattern and figs on the corners' },
  { slug: 'blue-and-yellow-anniversary', title: 'Blue and yellow anniversary set', cats: ['celebration'], alt: 'Tall cake with a blue and yellow marbled panel, white roses and greenery, beside two small cakes and iced cookies' },
  { slug: 'polka-dot-roses', title: 'Polka dots and roses', cats: ['celebration'], alt: 'White buttercream cake with black polka dots, two dark red roses and a gold Happy Birthday topper' },
  { slug: 'red-bow-birthday', title: 'Red cake with a white bow', cats: ['celebration'], alt: 'Deep red cake topped with a large white fondant bow and a gold Happy Birthday topper' },
  { slug: 'balloon-he-or-she', title: 'Hot-air balloon reveal cake', cats: ['celebration'], alt: 'White cake with gold He or She lettering, two hot-air balloon toppers and pink and blue spheres',
    video: { slug: 'balloon-reveal', caption: 'A slow look around the cake. Silent clip.' } },
  { slug: 'blue-rainbow-pair', title: 'Blue rainbow pair', cats: ['celebration'], alt: 'Two small white cakes with blue icing details and a blue rainbow arch' },
  { slug: 'festive-orange-and-green', title: 'Orange and green drape cake', cats: ['celebration'], alt: 'Square orange cake with a green fondant drape and colourful piped details beside a Cakeopedia Austin sign' },
  { slug: 'mini-cake-box-sign', title: 'Mini cakes with the Cakeopedia sign', cats: ['minis'], alt: 'Pink mini cakes in clear boxes beside a navy Cakeopedia sign',
    video: { slug: 'mini-cakes-packing', caption: 'Mini cakes lined up and boxed. Silent clip.' } },
];

export const bySlug = (s: string): Creation => {
  const c = creations.find((x) => x.slug === s);
  if (!c) throw new Error(`unknown creation ${s}`);
  return c;
};

const WIDTHS = [480, 800, 1280];
export function cover(c: Creation) {
  if (c.poster) {
    const v = manifest.videos[c.video!.slug];
    return { src: `/media/video/${c.video!.slug}-poster.webp`, srcset: undefined, w: v.w, h: v.h };
  }
  const m = manifest.images[c.slug as keyof typeof manifest.images];
  const srcset = WIDTHS.map((w) => `/media/img/${c.slug}-${w}.webp ${w}w`).join(', ');
  return { src: `/media/img/${c.slug}-800.webp`, srcset, w: 800, h: Math.round((800 * m.h) / m.w) };
}
