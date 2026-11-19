import 'dotenv/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/prisma-client/client.js';
import { randomUUID } from 'node:crypto';

if (process.env.CATALOG_SEED_CONFIRM !== 'insert-50-products') {
  throw new Error('Set CATALOG_SEED_CONFIRM=insert-50-products to confirm this catalog write.');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = new URL(databaseUrl);
if (!database.hostname.endsWith('.neon.tech') || database.pathname.slice(1) !== 'neondb') {
  throw new Error('This one-time seed only targets the configured Neon neondb database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
  transactionOptions: { maxWait: 20_000, timeout: 120_000 },
});

const categories = [
  { slug: 'skincare', name: 'Skincare', description: 'Daily skin and body care essentials.' },
  { slug: 'makeup', name: 'Makeup', description: 'Everyday color and beauty tools.' },
  { slug: 'fragrance', name: 'Fragrance', description: 'Personal fragrance and home scent.' },
  {
    slug: 'home-kitchen',
    name: 'Home & Kitchen',
    parentSlug: 'homeware',
    description: 'Useful, thoughtfully made kitchen and dining goods.',
  },
  {
    slug: 'home-decor',
    name: 'Home Decor',
    parentSlug: 'homeware',
    description: 'Finishing touches for calm, considered rooms.',
  },
  {
    slug: 'fashion-apparel',
    name: 'Fashion & Apparel',
    description: 'Easy-to-wear clothing and wardrobe staples.',
  },
  {
    slug: 'bags-accessories',
    name: 'Bags & Accessories',
    parentSlug: 'accessories',
    description: 'Everyday carry and personal accessories.',
  },
  {
    slug: 'electronics',
    name: 'Electronics',
    description: 'Personal audio and useful everyday tech.',
  },
  {
    slug: 'fitness-wellness',
    name: 'Fitness & Wellness',
    description: 'Simple equipment for movement and recovery.',
  },
  {
    slug: 'books-stationery',
    name: 'Books & Stationery',
    description: 'Paper goods and desk essentials.',
  },
] as const;

const brands = [
  { slug: 'aster-and-clay', name: 'Aster & Clay', category: 'skincare' },
  { slug: 'mira-color-studio', name: 'Mira Color Studio', category: 'makeup' },
  { slug: 'still-hour', name: 'Still Hour', category: 'fragrance' },
  { slug: 'table-and-tide', name: 'Table & Tide', category: 'home-kitchen' },
  { slug: 'form-and-field-home', name: 'Form & Field Home', category: 'home-decor' },
  { slug: 'thread-current', name: 'Thread Current', category: 'fashion-apparel' },
  { slug: 'northline-carry', name: 'Northline Carry', category: 'bags-accessories' },
  { slug: 'daymark-electronics', name: 'Daymark Electronics', category: 'electronics' },
  { slug: 'stride-common', name: 'Stride Common', category: 'fitness-wellness' },
  { slug: 'paper-orbit', name: 'Paper Orbit', category: 'books-stationery' },
] as const;

type ProductSeed = {
  category: (typeof categories)[number]['slug'];
  brand: (typeof brands)[number]['slug'];
  name: string;
  description: string;
  priceRupees: number;
  compareAtRupees: number;
  option: string;
  material: string;
  color: string;
  highlights: string[];
  photo: string;
};

const products: ProductSeed[] = [
  {
    category: 'skincare',
    brand: 'aster-and-clay',
    name: 'Cloudmilk Barrier Cream',
    description:
      'A cushiony daily cream with a soft, comfortable finish for morning and evening routines.',
    priceRupees: 1290,
    compareAtRupees: 1490,
    option: '50 ml',
    material: 'Cream',
    color: 'Ivory',
    highlights: ['Daily moisturiser', '50 ml glass jar', 'Fragrance-free finish'],
    photo: '1608248543803-ba4f8c70ae0b',
  },
  {
    category: 'skincare',
    brand: 'aster-and-clay',
    name: 'Dewdrop Hydration Serum',
    description: 'A lightweight serum designed to layer easily under moisturiser and sunscreen.',
    priceRupees: 1590,
    compareAtRupees: 1790,
    option: '30 ml',
    material: 'Water-based serum',
    color: 'Clear',
    highlights: ['Dropper bottle', '30 ml', 'Lightweight layering texture'],
    photo: '1556228720-195a672e8a03',
  },
  {
    category: 'skincare',
    brand: 'aster-and-clay',
    name: 'Daylight Mineral Sun Fluid',
    description: 'A smooth daily sun fluid in a compact tube that fits neatly into a travel pouch.',
    priceRupees: 990,
    compareAtRupees: 1190,
    option: '50 ml',
    material: 'Mineral sun fluid',
    color: 'White',
    highlights: ['50 ml squeeze tube', 'Easy-to-carry format', 'For daily routines'],
    photo: '1620916566398-39f1143ab7be',
  },
  {
    category: 'skincare',
    brand: 'aster-and-clay',
    name: 'Soft Reset Gel Cleanser',
    description: 'A gentle-feeling gel cleanser with a fresh rinse and a simple pump format.',
    priceRupees: 890,
    compareAtRupees: 1050,
    option: '150 ml',
    material: 'Gel cleanser',
    color: 'Clear',
    highlights: ['Pump dispenser', '150 ml', 'Rinses clean'],
    photo: '1571781926291-c477ebfd024b',
  },
  {
    category: 'skincare',
    brand: 'aster-and-clay',
    name: 'Evening Squalane Face Oil',
    description:
      'A small-batch style facial oil presented in an amber dropper bottle for an evening ritual.',
    priceRupees: 1790,
    compareAtRupees: 1990,
    option: '30 ml',
    material: 'Face oil',
    color: 'Amber',
    highlights: ['Amber glass dropper', '30 ml', 'Evening routine format'],
    photo: '1611930022073-b7a4ba5fcccd',
  },
  {
    category: 'makeup',
    brand: 'mira-color-studio',
    name: 'Soft Focus Skin Tint',
    description:
      'A sheer, buildable complexion tint with a natural-looking finish and a neat pump bottle.',
    priceRupees: 1490,
    compareAtRupees: 1690,
    option: '30 ml · shade 02',
    material: 'Liquid tint',
    color: 'Warm beige',
    highlights: ['Buildable coverage', '30 ml pump bottle', 'Natural finish'],
    photo: '1596462502278-27bfdc403348',
  },
  {
    category: 'makeup',
    brand: 'mira-color-studio',
    name: 'Rosewater Lip Veil',
    description: 'A sheer rose lip color in a slim tube for a quick touch of everyday color.',
    priceRupees: 790,
    compareAtRupees: 950,
    option: '3.5 g · rose',
    material: 'Lip balm color',
    color: 'Petal rose',
    highlights: ['Sheer color', '3.5 g', 'Twist-up tube'],
    photo: '1586495777744-4413f21062fa',
  },
  {
    category: 'makeup',
    brand: 'mira-color-studio',
    name: 'Everyday Lift Mascara',
    description:
      'A classic black mascara with a tapered wand and a compact tube for daily makeup bags.',
    priceRupees: 890,
    compareAtRupees: 1090,
    option: '8 ml · black',
    material: 'Mascara',
    color: 'Black',
    highlights: ['Tapered wand', '8 ml', 'Compact tube'],
    photo: '1706170498499-235824fd317c',
  },
  {
    category: 'makeup',
    brand: 'mira-color-studio',
    name: 'Petal Pressed Blush',
    description: 'A finely milled pressed blush in a pocket-size compact with a soft rose tone.',
    priceRupees: 990,
    compareAtRupees: 1190,
    option: '4 g · rose',
    material: 'Pressed powder',
    color: 'Muted rose',
    highlights: ['Pocket compact', '4 g', 'Soft rose tone'],
    photo: '1645961359170-c01fa306aa6b',
  },
  {
    category: 'makeup',
    brand: 'mira-color-studio',
    name: 'Little Hours Eye Palette',
    description: 'A five-pan neutral eye palette with a mix of matte and softly reflective shades.',
    priceRupees: 1390,
    compareAtRupees: 1590,
    option: '5 shades · neutral',
    material: 'Pressed powder',
    color: 'Warm neutrals',
    highlights: ['Five coordinated shades', 'Mirror compact', 'Day-to-evening palette'],
    photo: '1627885793933-584e53987c14',
  },
  {
    category: 'fragrance',
    brand: 'still-hour',
    name: 'Sunday Fig Eau de Parfum',
    description:
      'A skin-close fragrance with a green, woody character in a clear glass spray bottle.',
    priceRupees: 3290,
    compareAtRupees: 3690,
    option: '50 ml',
    material: 'Eau de parfum',
    color: 'Clear glass',
    highlights: ['50 ml spray bottle', 'Green and woody profile', 'Gift-ready box'],
    photo: '1594035910387-fea47794261f',
  },
  {
    category: 'fragrance',
    brand: 'still-hour',
    name: 'Cedar Library Roll-On',
    description:
      'A pocket roll-on fragrance with a warm cedar character for travel and everyday carry.',
    priceRupees: 1190,
    compareAtRupees: 1390,
    option: '10 ml',
    material: 'Perfume oil',
    color: 'Amber',
    highlights: ['10 ml roll-on', 'Travel-friendly glass vial', 'Warm woody profile'],
    photo: '1592945403244-b3fbafd7f539',
  },
  {
    category: 'fragrance',
    brand: 'still-hour',
    name: 'Quiet Bloom Home Candle',
    description: 'A softly scented candle in an amber glass vessel for an easy evening wind-down.',
    priceRupees: 1490,
    compareAtRupees: 1690,
    option: '220 g',
    material: 'Wax blend',
    color: 'Amber glass',
    highlights: ['220 g candle', 'Reusable glass vessel', 'Cotton wick'],
    photo: '1608571423902-eed4a5ad8108',
  },
  {
    category: 'fragrance',
    brand: 'still-hour',
    name: 'Greenhouse Reed Diffuser',
    description:
      'A compact reed diffuser with a fresh botanical scent for smaller rooms and workspaces.',
    priceRupees: 1690,
    compareAtRupees: 1890,
    option: '100 ml',
    material: 'Fragrance oil',
    color: 'Clear glass',
    highlights: ['100 ml bottle', 'Includes diffuser reeds', 'Suitable for compact spaces'],
    photo: '1587017539504-67cfbddac569',
  },
  {
    category: 'fragrance',
    brand: 'still-hour',
    name: 'Citrus Grove Body Mist',
    description:
      'A light, easy-to-layer body mist with a bright citrus character in a fine-spray bottle.',
    priceRupees: 990,
    compareAtRupees: 1190,
    option: '100 ml',
    material: 'Body mist',
    color: 'Clear',
    highlights: ['100 ml fine-mist spray', 'Light daytime format', 'Easy to layer'],
    photo: '1615634260167-c8cdede054de',
  },
  {
    category: 'home-kitchen',
    brand: 'table-and-tide',
    name: 'Fieldnote Stoneware Mug',
    description: 'A rounded stoneware mug with a comfortable handle and a softly speckled glaze.',
    priceRupees: 590,
    compareAtRupees: 690,
    option: '350 ml · sand',
    material: 'Stoneware',
    color: 'Sand speckle',
    highlights: ['350 ml capacity', 'Comfortable handle', 'Glazed stoneware'],
    photo: '1597696929736-6d13bed8e6a8',
  },
  {
    category: 'home-kitchen',
    brand: 'table-and-tide',
    name: 'Everyday Breakfast Bowl',
    description: 'A versatile ceramic bowl sized for breakfast, snacks, or a small side dish.',
    priceRupees: 490,
    compareAtRupees: 590,
    option: '600 ml · oat',
    material: 'Ceramic',
    color: 'Oat',
    highlights: ['600 ml capacity', 'Stackable shape', 'Food-safe glaze'],
    photo: '1511920170033-f8396924c348',
  },
  {
    category: 'home-kitchen',
    brand: 'table-and-tide',
    name: 'Sunrise Dinner Plate',
    description: 'A clean-lined dinner plate with a gently raised rim for everyday meals.',
    priceRupees: 690,
    compareAtRupees: 790,
    option: '26 cm · chalk',
    material: 'Stoneware',
    color: 'Chalk white',
    highlights: ['26 cm diameter', 'Raised rim', 'Everyday table setting'],
    photo: '1495521821757-a1efb6729352',
  },
  {
    category: 'home-kitchen',
    brand: 'table-and-tide',
    name: 'Clearwater Glass Carafe',
    description:
      'A clear serving carafe with a gently curved profile for water, juice, or iced tea.',
    priceRupees: 990,
    compareAtRupees: 1190,
    option: '1 litre',
    material: 'Glass',
    color: 'Clear',
    highlights: ['1 litre capacity', 'Easy-pour neck', 'Serving table essential'],
    photo: '1498837167922-ddd27525d352',
  },
  {
    category: 'home-kitchen',
    brand: 'table-and-tide',
    name: 'Pantry Glass Jar Set',
    description:
      'A set of three clear pantry jars with simple lids for dry ingredients and countertop storage.',
    priceRupees: 1290,
    compareAtRupees: 1490,
    option: 'Set of 3',
    material: 'Glass and wood',
    color: 'Clear · natural lids',
    highlights: ['Three jar sizes', 'Clear glass bodies', 'Countertop storage'],
    photo: '1600566753086-00f18fb6b3ea',
  },
  {
    category: 'home-decor',
    brand: 'form-and-field-home',
    name: 'Sculpted Sandstone Vase',
    description:
      'A sculptural ceramic vase with a tactile silhouette that works with stems or as a standalone accent.',
    priceRupees: 1490,
    compareAtRupees: 1690,
    option: '22 cm · sand',
    material: 'Ceramic',
    color: 'Warm sand',
    highlights: ['22 cm height', 'Sculptural profile', 'Matte textured finish'],
    photo: '1616486338812-3dadae4b4ace',
  },
  {
    category: 'home-decor',
    brand: 'form-and-field-home',
    name: 'Harbor Woven Cushion Cover',
    description: 'A woven cushion cover with a subtle slub texture and a concealed zip closure.',
    priceRupees: 990,
    compareAtRupees: 1190,
    option: '45 × 45 cm · navy',
    material: 'Cotton blend',
    color: 'Deep navy',
    highlights: ['45 × 45 cm', 'Concealed zip', 'Cover only'],
    photo: '1600210492486-724fe5c67fb0',
  },
  {
    category: 'home-decor',
    brand: 'form-and-field-home',
    name: 'Arc Table Lamp',
    description:
      'A compact table lamp with a calm silhouette for bedside tables and reading corners.',
    priceRupees: 2490,
    compareAtRupees: 2890,
    option: '38 cm · linen shade',
    material: 'Metal and linen',
    color: 'Warm white',
    highlights: ['Compact footprint', 'Linen-look shade', 'Standard replaceable bulb'],
    photo: '1616486029423-aaa4789e8c9a',
  },
  {
    category: 'home-decor',
    brand: 'form-and-field-home',
    name: 'Market Woven Storage Basket',
    description:
      'A lightweight woven basket with integrated handles for throws, toys, or everyday storage.',
    priceRupees: 1290,
    compareAtRupees: 1490,
    option: 'Medium · natural',
    material: 'Woven natural fibre',
    color: 'Natural',
    highlights: ['Integrated handles', 'Flexible storage', 'Hand-finished look'],
    photo: '1618221195710-dd6b41faaea6',
  },
  {
    category: 'home-decor',
    brand: 'form-and-field-home',
    name: 'Stillwater Linen Table Runner',
    description:
      'A softly textured table runner that adds a natural layer to weekday and weekend tables.',
    priceRupees: 1190,
    compareAtRupees: 1390,
    option: '180 × 35 cm · flax',
    material: 'Linen blend',
    color: 'Flax',
    highlights: ['180 × 35 cm', 'Textured weave', 'Machine washable'],
    photo: '1600607687939-ce8a6c25118c',
  },
  {
    category: 'fashion-apparel',
    brand: 'thread-current',
    name: 'Daily Cotton Crew Tee',
    description:
      'A relaxed crew-neck tee in midweight cotton with an easy fit for everyday layering.',
    priceRupees: 990,
    compareAtRupees: 1190,
    option: 'M · natural',
    material: 'Cotton',
    color: 'Natural',
    highlights: ['Relaxed fit', 'Midweight cotton', 'Ribbed crew neckline'],
    photo: '1490481651871-ab68de25d43d',
  },
  {
    category: 'fashion-apparel',
    brand: 'thread-current',
    name: 'Coastline Linen Shirt',
    description:
      'A breathable button-front shirt with a softly relaxed shape for warm-weather dressing.',
    priceRupees: 1890,
    compareAtRupees: 2190,
    option: 'M · sky stripe',
    material: 'Linen blend',
    color: 'Sky stripe',
    highlights: ['Button front', 'Relaxed fit', 'Curved hem'],
    photo: '1483985988355-763728e1935b',
  },
  {
    category: 'fashion-apparel',
    brand: 'thread-current',
    name: 'Sunday Cotton Midi Dress',
    description: 'An easy midi dress with a softly draped shape and simple, versatile styling.',
    priceRupees: 2290,
    compareAtRupees: 2590,
    option: 'M · sage',
    material: 'Cotton voile',
    color: 'Sage',
    highlights: ['Midi length', 'Side pockets', 'Pull-on styling'],
    photo: '1529139574466-a303027c1d8b',
  },
  {
    category: 'fashion-apparel',
    brand: 'thread-current',
    name: 'Straightline Denim Trousers',
    description:
      'Straight-leg denim trousers with a classic five-pocket construction and clean finish.',
    priceRupees: 2190,
    compareAtRupees: 2490,
    option: '32 · mid blue',
    material: 'Denim cotton',
    color: 'Mid blue',
    highlights: ['Straight-leg cut', 'Five-pocket design', 'Zip and button closure'],
    photo: '1503342217505-b0a15ec3261c',
  },
  {
    category: 'fashion-apparel',
    brand: 'thread-current',
    name: 'Cloudsoft Lounge Set',
    description:
      'A matching relaxed top and lounge trouser set made for slow mornings and quiet evenings.',
    priceRupees: 2490,
    compareAtRupees: 2890,
    option: 'M · oat',
    material: 'Cotton jersey',
    color: 'Oat',
    highlights: ['Two-piece set', 'Elastic waist', 'Relaxed homewear fit'],
    photo: '1434389677669-e08b4cac3105',
  },
  {
    category: 'bags-accessories',
    brand: 'northline-carry',
    name: 'Cityline Crossbody Bag',
    description: 'A compact crossbody bag with a secure zip top and an adjustable shoulder strap.',
    priceRupees: 1990,
    compareAtRupees: 2290,
    option: 'One size · stone',
    material: 'Vegan leather',
    color: 'Stone',
    highlights: ['Adjustable strap', 'Interior slip pocket', 'Secure zip closure'],
    photo: '1553062407-98eeb64c6a62',
  },
  {
    category: 'bags-accessories',
    brand: 'northline-carry',
    name: 'Open Road Canvas Tote',
    description: 'A sturdy everyday tote with long shoulder handles and room for daily essentials.',
    priceRupees: 790,
    compareAtRupees: 950,
    option: 'One size · natural',
    material: 'Cotton canvas',
    color: 'Natural',
    highlights: ['Long shoulder straps', 'Reinforced base', 'Reusable carryall'],
    photo: '1584917865442-de89df76afd3',
  },
  {
    category: 'bags-accessories',
    brand: 'northline-carry',
    name: 'Slimfold Everyday Wallet',
    description:
      'A slim bifold wallet with an easy-to-carry profile and neatly arranged card slots.',
    priceRupees: 890,
    compareAtRupees: 1090,
    option: 'One size · tan',
    material: 'Vegan leather',
    color: 'Tan',
    highlights: ['Slim bifold profile', 'Six card slots', 'Full-length note sleeve'],
    photo: '1565026057447-bc90a3dceb87',
  },
  {
    category: 'bags-accessories',
    brand: 'northline-carry',
    name: 'Golden Hour Sunglasses',
    description:
      'Classic everyday sunglasses with a lightweight frame and a protective storage sleeve.',
    priceRupees: 1190,
    compareAtRupees: 1390,
    option: 'One size · tortoise',
    material: 'Acetate-style frame',
    color: 'Tortoise',
    highlights: ['Lightweight frame', 'Includes soft sleeve', 'Classic rounded shape'],
    photo: '1590874103328-eac38a683ce7',
  },
  {
    category: 'bags-accessories',
    brand: 'northline-carry',
    name: 'Meridian Analog Watch',
    description: 'A clean analog watch with a simple dial and a comfortable everyday strap.',
    priceRupees: 2990,
    compareAtRupees: 3490,
    option: 'One size · silver',
    material: 'Stainless steel',
    color: 'Silver',
    highlights: ['Minimal analog dial', 'Adjustable strap', 'Gift box included'],
    photo: '1548036328-c9fa89d128fa',
  },
  {
    category: 'electronics',
    brand: 'daymark-electronics',
    name: 'Daymark Studio Headphones',
    description:
      'Over-ear wireless headphones with padded cups and straightforward on-ear controls.',
    priceRupees: 4990,
    compareAtRupees: 5690,
    option: 'One size · charcoal',
    material: 'ABS and padded fabric',
    color: 'Charcoal',
    highlights: ['Over-ear fit', 'Bluetooth connectivity', 'Fold-flat storage'],
    photo: '1505740420928-5e560c06d30e',
  },
  {
    category: 'electronics',
    brand: 'daymark-electronics',
    name: 'Pocket Frame Digital Camera',
    description:
      'A compact digital camera with a simple body layout for everyday photos and travel.',
    priceRupees: 7990,
    compareAtRupees: 8990,
    option: 'Compact · black',
    material: 'ABS and glass',
    color: 'Black',
    highlights: ['Compact body', 'Rechargeable battery', 'Includes wrist strap'],
    photo: '1516035069371-29a1b244cc32',
  },
  {
    category: 'electronics',
    brand: 'daymark-electronics',
    name: 'Workday USB-C Hub',
    description: 'A compact USB-C hub with a tidy aluminum shell for desks and travel bags.',
    priceRupees: 1490,
    compareAtRupees: 1790,
    option: '6-in-1 · space grey',
    material: 'Aluminum alloy',
    color: 'Space grey',
    highlights: ['Six connection ports', 'Compact travel size', 'USB-C host connection'],
    photo: '1496181133206-80ce9b88a853',
  },
  {
    category: 'electronics',
    brand: 'daymark-electronics',
    name: 'Northbound Smart Watch',
    description:
      'A lightweight smart watch with a bright display, changeable strap, and daily activity views.',
    priceRupees: 3990,
    compareAtRupees: 4590,
    option: 'One size · black',
    material: 'Aluminum and silicone',
    color: 'Black',
    highlights: ['Changeable strap', 'Daily activity views', 'Magnetic charging cable'],
    photo: '1523275335684-37898b6baf30',
  },
  {
    category: 'electronics',
    brand: 'daymark-electronics',
    name: 'Pocket Sound Bluetooth Speaker',
    description:
      'A small portable speaker with a fabric-wrapped shell and a convenient carry loop.',
    priceRupees: 2490,
    compareAtRupees: 2890,
    option: 'One size · graphite',
    material: 'Fabric and ABS',
    color: 'Graphite',
    highlights: ['Portable format', 'Bluetooth pairing', 'USB-C charging'],
    photo: '1511707171634-5f897ff02aa9',
  },
  {
    category: 'fitness-wellness',
    brand: 'stride-common',
    name: 'Grounded Grip Yoga Mat',
    description: 'A supportive exercise mat with a textured surface and a roll-up carry strap.',
    priceRupees: 1790,
    compareAtRupees: 2090,
    option: '183 × 61 cm · sage',
    material: 'TPE foam',
    color: 'Sage',
    highlights: ['Textured grip surface', 'Carry strap included', 'Wipes clean'],
    photo: '1571019613454-1cb2f99b2d8b',
  },
  {
    category: 'fitness-wellness',
    brand: 'stride-common',
    name: 'Open Range Stretch Strap',
    description:
      'A simple stretching strap with multiple loops for warm-up, cool-down, and mobility work.',
    priceRupees: 390,
    compareAtRupees: 490,
    option: 'One size · teal',
    material: 'Woven polyester',
    color: 'Teal',
    highlights: ['Multiple grip loops', 'Lightweight', 'Drawstring pouch included'],
    photo: '1518611012118-696072aa579a',
  },
  {
    category: 'fitness-wellness',
    brand: 'stride-common',
    name: 'Move Better Resistance Bands',
    description:
      'A set of three resistance bands with varied tension levels for home movement sessions.',
    priceRupees: 590,
    compareAtRupees: 690,
    option: 'Set of 3',
    material: 'Latex blend',
    color: 'Three tones',
    highlights: ['Three tension levels', 'Includes storage pouch', 'Compact home workout kit'],
    photo: '1517836357463-d25dfeac3438',
  },
  {
    category: 'fitness-wellness',
    brand: 'stride-common',
    name: 'Restore Foam Roller',
    description:
      'A firm textured roller for post-session recovery and gentle muscle release routines.',
    priceRupees: 990,
    compareAtRupees: 1190,
    option: '33 cm · charcoal',
    material: 'EVA foam',
    color: 'Charcoal',
    highlights: ['33 cm length', 'Textured surface', 'Easy-clean finish'],
    photo: '1544367567-0f2fcb009e0b',
  },
  {
    category: 'fitness-wellness',
    brand: 'stride-common',
    name: 'Active Loop Training Bands',
    description:
      'A pack of fabric loop bands for warm-ups, lower-body training, and travel workouts.',
    priceRupees: 790,
    compareAtRupees: 950,
    option: 'Pack of 3',
    material: 'Woven elastic',
    color: 'Mixed neutral',
    highlights: ['Three resistance levels', 'Non-slip woven feel', 'Storage pouch included'],
    photo: '1534438327276-14e5300c3a48',
  },
  {
    category: 'books-stationery',
    brand: 'paper-orbit',
    name: 'Daybook Clothbound Journal',
    description: 'A clothbound journal with smooth paper, a ribbon marker, and a lay-flat opening.',
    priceRupees: 590,
    compareAtRupees: 690,
    option: 'A5 · 192 pages',
    material: 'Paper and cloth',
    color: 'Forest green',
    highlights: ['192 ruled pages', 'Ribbon page marker', 'Lay-flat binding'],
    photo: '1455390582262-044cdead277a',
  },
  {
    category: 'books-stationery',
    brand: 'paper-orbit',
    name: 'Finepoint Rollerball Pen',
    description:
      'A balanced rollerball pen with a fine point and a smooth barrel for everyday writing.',
    priceRupees: 290,
    compareAtRupees: 390,
    option: '0.5 mm · black ink',
    material: 'Metal and resin',
    color: 'Matte black',
    highlights: ['0.5 mm tip', 'Replaceable refill', 'Balanced barrel'],
    photo: '1544816155-12df9643f363',
  },
  {
    category: 'books-stationery',
    brand: 'paper-orbit',
    name: 'Modular Desk Organizer',
    description:
      'A compact organizer with open compartments for pens, notes, clips, and small desk tools.',
    priceRupees: 890,
    compareAtRupees: 1050,
    option: 'One size · natural',
    material: 'Wood composite',
    color: 'Natural',
    highlights: ['Four open compartments', 'Compact desk footprint', 'Easy-access layout'],
    photo: '1499951360447-b19be8fe80f5',
  },
  {
    category: 'books-stationery',
    brand: 'paper-orbit',
    name: 'Weekly Orbit Planner',
    description:
      'An undated weekly planner with spacious writing areas and a simple habit-tracking page.',
    priceRupees: 690,
    compareAtRupees: 790,
    option: 'A5 · 160 pages',
    material: 'Recycled paper',
    color: 'Warm white',
    highlights: ['Undated weekly spreads', 'Habit tracker pages', 'Elastic closure band'],
    photo: '1453738773917-9c3eff1db985',
  },
  {
    category: 'books-stationery',
    brand: 'paper-orbit',
    name: 'Studio Sketch Pad',
    description:
      'A sturdy sketch pad with a smooth, heavyweight paper surface for pencils and light ink work.',
    priceRupees: 490,
    compareAtRupees: 590,
    option: 'A4 · 80 sheets',
    material: 'Heavyweight paper',
    color: 'Natural white',
    highlights: ['80 sheets', 'Top-bound pad', 'Pencil and light ink use'],
    photo: '1517842645767-c639042777db',
  },
];

if (products.length !== 50)
  throw new Error(`Expected exactly 50 product entries; got ${products.length}.`);

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials:
    process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
});

if (
  !process.env.S3_ENDPOINT ||
  !process.env.S3_BUCKET ||
  !process.env.S3_ACCESS_KEY_ID ||
  !process.env.S3_SECRET_ACCESS_KEY ||
  !process.env.S3_PUBLIC_BASE_URL
) {
  throw new Error('All target S3 settings are required before seeding catalog images.');
}

const uploaded: Array<{ key: string; productId: string }> = [];
let databaseCommitted = false;
const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function eachLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++]!;
        await run(item);
      }
    }),
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}

try {
  const now = new Date();
  const [vendors, activeTax, activeCommission] = await Promise.all([
    prisma.vendor.findMany({
      where: { slug: { in: ['northstar-goods', 'field-and-form'] }, status: 'APPROVED' },
      select: { id: true, slug: true, ownerId: true },
    }),
    prisma.taxRule.findFirst({
      where: {
        taxCode: 'DEV_ZERO',
        jurisdictionCode: 'IN-DEFAULT',
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      select: { id: true },
    }),
    prisma.commissionRule.findFirst({
      where: {
        active: true,
        vendorId: null,
        categoryId: null,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      select: { id: true },
    }),
  ]);
  if (vendors.length !== 2)
    throw new Error('Expected both approved catalog vendors in the target database.');
  if (!activeTax)
    throw new Error('The live DEV_ZERO tax rule is unavailable; no product rows were written.');
  if (!activeCommission)
    throw new Error(
      'The live default commission rule is unavailable; no product rows were written.',
    );

  const vendorBySlug = new Map(vendors.map((vendor) => [vendor.slug, vendor]));
  const prepared = products.map((product, index) => {
    const slug = slugify(product.name);
    const vendor = vendors[index % vendors.length]!;
    const skuPrefix = vendor.slug === 'northstar-goods' ? 'NORTH' : 'FIELD';
    const id = randomUUID();
    return {
      ...product,
      id,
      variantId: randomUUID(),
      inventoryId: randomUUID(),
      imageId: randomUUID(),
      vendor,
      vendorSlug: vendor.slug,
      slug,
      sku: `${skuPrefix}-${slug.toUpperCase()}`,
      optionValues: { size: product.option, color: product.color },
      pricePaise: BigInt(product.priceRupees * 100),
      compareAtPricePaise: BigInt(product.compareAtRupees * 100),
      objectKey: `products/${vendor.id}/${id}/${randomUUID()}.jpg`,
      sourceUrl: `https://images.unsplash.com/photo-${product.photo}?fit=crop&crop=entropy&w=1200&h=1200&q=85&fm=jpg`,
      imageUrl: '',
      imageSize: 0,
    };
  });
  const existing = await prisma.product.findMany({
    where: { OR: prepared.map((product) => ({ vendorId: product.vendor.id, slug: product.slug })) },
    select: { id: true, slug: true, vendorId: true },
  });
  if (existing.length)
    throw new Error(
      `Refusing duplicate or partial seed: ${existing.length} of the requested slugs already exist.`,
    );

  console.info(
    `Preparing 50 products for ${vendors.length} approved vendors in ${database.hostname}/${database.pathname.slice(1)}.`,
  );
  await eachLimit(prepared, 5, async (product) => {
    const response = await fetch(product.sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok)
      throw new Error(`Image source returned HTTP ${response.status} for ${product.photo}.`);
    const mimeType = response.headers.get('content-type')?.split(';')[0];
    if (mimeType !== 'image/jpeg')
      throw new Error(`Expected JPEG source for ${product.photo}; got ${mimeType}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 20_000 || bytes.length > 12_000_000)
      throw new Error(
        `Image size is outside the accepted range for ${product.photo}: ${bytes.length} bytes.`,
      );
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff))
      throw new Error(`Image signature is not JPEG for ${product.photo}.`);
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: product.objectKey,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    uploaded.push({ key: product.objectKey, productId: product.id });
    product.imageUrl = `${process.env.S3_PUBLIC_BASE_URL!.replace(/\/$/, '')}/${product.objectKey
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    product.imageSize = bytes.length;
  });

  await eachLimit(prepared, 8, async (product) => {
    const response = await fetch(product.imageUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Error(`Uploaded product image is not publicly readable (HTTP ${response.status}).`);
  });

  await prisma.$transaction(async (tx) => {
    const categoryIds = new Map<string, string>();
    const brandIds = new Map<string, string>();
    for (const category of categories) {
      const parent = 'parentSlug' in category ? category.parentSlug : undefined;
      const saved = await tx.category.upsert({
        where: { slug: category.slug },
        create: {
          name: category.name,
          slug: category.slug,
          description: category.description,
          active: true,
          ...(parent ? { parent: { connect: { slug: parent } } } : {}),
        },
        update: {},
      });
      categoryIds.set(category.slug, saved.id);
    }
    for (const brand of brands) {
      const saved = await tx.brand.upsert({
        where: { slug: brand.slug },
        create: { name: brand.name, slug: brand.slug, active: true },
        update: {},
      });
      brandIds.set(brand.slug, saved.id);
    }
    for (const [index, product] of prepared.entries()) {
      const vendor = vendorBySlug.get(product.vendorSlug)!;
      const categoryId = categoryIds.get(product.category);
      const brandId = brandIds.get(product.brand);
      if (!categoryId || !brandId) throw new Error(`Catalog relation missing for ${product.slug}.`);
      await tx.product.create({
        data: {
          id: product.id,
          vendorId: vendor.id,
          categoryId,
          brandId,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          description: product.description,
          pricePaise: product.pricePaise,
          compareAtPricePaise: product.compareAtPricePaise,
          taxCode: 'DEV_ZERO',
          status: 'ACTIVE',
          statusReason: null,
          attributes: {
            material: product.material,
            color: product.color,
            sizeOrFormat: product.option,
            highlights: product.highlights,
            imageSource: 'Unsplash',
            sourcePhotoId: product.photo,
          },
          submittedAt: now,
          approvedAt: now,
          archivedAt: null,
          variants: {
            create: {
              id: product.variantId,
              sku: product.sku,
              name: product.option,
              optionValues: product.optionValues,
              pricePaise: product.pricePaise,
              compareAtPricePaise: product.compareAtPricePaise,
              active: true,
              isDefault: true,
              inventory: {
                create: {
                  id: product.inventoryId,
                  onHand: 20,
                  reserved: 0,
                  version: 0,
                },
              },
            },
          },
          images: {
            create: {
              id: product.imageId,
              objectKey: product.objectKey,
              url: product.imageUrl,
              mimeType: 'image/jpeg',
              sizeBytes: product.imageSize,
              altText: `${product.name} product photograph`,
              sortOrder: 0,
              isPrimary: true,
            },
          },
        },
      });
      const inventory = await tx.inventory.findUnique({
        where: { id: product.inventoryId },
        select: { id: true },
      });
      if (!inventory) throw new Error(`Inventory was not created for ${product.slug}.`);
      await tx.inventoryMovement.create({
        data: {
          inventoryId: product.inventoryId,
          actorId: vendor.ownerId,
          type: 'RECEIPT',
          quantity: 20,
          reference: `CATALOG-50-${product.sku}`,
          reason: 'Initial stock for requested product catalog.',
        },
      });
      if (index % 10 === 9) console.info(`Inserted ${index + 1}/50 product rows.`);
    }
  });
  databaseCommitted = true;

  const slugs = prepared.map((product) => product.slug);
  const inserted = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    include: {
      images: true,
      variants: { include: { inventory: true } },
      category: true,
      brand: true,
    },
  });
  const valid =
    inserted.length === 50 &&
    inserted.every(
      (product) =>
        product.status === 'ACTIVE' &&
        product.images.some(
          (image) => image.isPrimary && image.url.includes(process.env.S3_BUCKET!),
        ) &&
        product.variants.some((variant) => variant.isDefault && variant.inventory?.onHand === 20),
    );
  if (!valid)
    throw new Error(
      `Post-insert verification failed: found ${inserted.length}/50 complete products.`,
    );
  console.info(
    JSON.stringify({
      inserted: inserted.length,
      categories: new Set(inserted.map((product) => product.category.slug)).size,
      brands: new Set(inserted.map((product) => product.brand?.slug)).size,
      vendors: [...new Set(inserted.map((product) => product.vendorId))].length,
      images: inserted.reduce((count, product) => count + product.images.length, 0),
      s3Objects: uploaded.length,
      database: `${database.hostname}/${database.pathname.slice(1)}`,
    }),
  );
} catch (error) {
  if (!databaseCommitted && uploaded.length) {
    await eachLimit(uploaded, 8, async ({ key }) => {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    }).catch((cleanupError) =>
      console.error('S3 cleanup failed; inspect uploaded catalog keys.', cleanupError),
    );
  }
  throw error;
} finally {
  s3.destroy();
  await prisma.$disconnect();
}
