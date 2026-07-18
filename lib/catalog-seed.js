const CATALOG_BATCH = "ONE_TEN_AI_CATALOG_2026";

const CATALOG_CATEGORIES = [
  { key: "shirts", name: "Shirts", description: "Tailored and casual men's shirts.", price_mode: "range", sort_order: 10 },
  { key: "polos", name: "Polos & T-Shirts", description: "Clean everyday polos and premium tees.", price_mode: "range", sort_order: 20 },
  { key: "trousers", name: "Trousers", description: "Formal trousers, chinos and modern pants.", price_mode: "range", sort_order: 30 },
  { key: "suits", name: "Suits & Sets", description: "Sharp coordinated suits and evening sets.", price_mode: "range", sort_order: 40 },
  { key: "khamiis", name: "Khamiis", description: "Classic and modern men's khamiis styles.", price_mode: "range", sort_order: 50 },
  { key: "shoes", name: "Shoes", description: "Formal shoes, sneakers, loafers and boots.", price_mode: "range", sort_order: 60 },
  { key: "watches", name: "Watches", description: "Minimal and statement men's watches.", price_mode: "range", sort_order: 70 },
  { key: "accessories", name: "Accessories", description: "Caps, belts, bags and sunglasses.", price_mode: "range", sort_order: 80 },
  { key: "outerwear", name: "Outerwear", description: "Jackets and coats for a finished outfit.", price_mode: "range", sort_order: 90 },
];

const PRODUCT_SPECS = [
  ["Midnight Black Tailored Shirt", "shirts", 8, 10, "black long-sleeve tailored dress shirt", "top", "alpha"],
  ["Crisp White Oxford Shirt", "shirts", 7, 10, "crisp white Oxford cotton shirt", "top", "alpha"],
  ["Scarlet Red Dress Shirt", "shirts", 8, 10, "deep scarlet red formal shirt", "top", "alpha"],
  ["Charcoal Micro-Pattern Shirt", "shirts", 7, 9, "charcoal micro-pattern slim shirt", "top", "alpha"],
  ["Sky Blue Office Shirt", "shirts", 6, 9, "sky blue office shirt with clean collar", "top", "alpha"],
  ["Olive Casual Overshirt", "shirts", 9, 10, "olive green structured casual overshirt", "top", "alpha"],
  ["Essential Black Polo", "polos", 6, 9, "minimal black premium polo shirt", "top", "alpha"],
  ["Clean White Polo", "polos", 6, 9, "clean white premium polo shirt", "top", "alpha"],
  ["Crimson Premium Polo", "polos", 7, 10, "crimson red knit polo shirt", "top", "alpha"],
  ["Graphite Crew T-Shirt", "polos", 5, 8, "graphite gray heavyweight crew-neck T-shirt", "top", "alpha"],
  ["Stone Slim Trousers", "trousers", 7, 10, "light stone gray slim tailored trousers", "pants", "waist"],
  ["Jet Black Formal Trousers", "trousers", 8, 10, "jet black formal tailored trousers", "pants", "waist"],
  ["Navy Smart Chinos", "trousers", 7, 9, "deep navy smart chinos", "pants", "waist"],
  ["Khaki Everyday Chinos", "trousers", 6, 9, "warm khaki everyday chinos", "pants", "waist"],
  ["Charcoal Pleated Trousers", "trousers", 9, 10, "charcoal pleated wide-tailored trousers", "pants", "waist"],
  ["Black Executive Suit", "suits", 10, null, "black two-piece executive suit with white shirt", "outfit", "alpha"],
  ["Deep Navy Two-Piece Suit", "suits", 10, null, "deep navy two-piece tailored suit", "outfit", "alpha"],
  ["Light Gray Modern Suit", "suits", 10, null, "light gray modern two-piece suit", "outfit", "alpha"],
  ["Burgundy Evening Set", "suits", 9, 10, "burgundy evening blazer and black trouser set", "outfit", "alpha"],
  ["Snow White Classic Khamiis", "khamiis", 8, 10, "snow white classic ankle-length khamiis", "outfit", "khamiis"],
  ["Ivory Embroidered Khamiis", "khamiis", 9, 10, "ivory khamiis with restrained tonal embroidery", "outfit", "khamiis"],
  ["Midnight Black Khamiis", "khamiis", 9, 10, "midnight black modern khamiis", "outfit", "khamiis"],
  ["Sand Beige Khamiis", "khamiis", 8, 10, "sand beige minimal khamiis", "outfit", "khamiis"],
  ["Slate Gray Khamiis", "khamiis", 8, 10, "slate gray structured khamiis", "outfit", "khamiis"],
  ["Black Leather Oxford Shoes", "shoes", 9, 10, "polished black leather Oxford shoes", "shoes", "shoe"],
  ["White Minimal Sneakers", "shoes", 8, 10, "minimal clean white leather sneakers", "shoes", "shoe"],
  ["Brown Leather Loafers", "shoes", 8, 10, "dark brown polished leather loafers", "shoes", "shoe"],
  ["Black Chelsea Boots", "shoes", 10, null, "black leather Chelsea boots", "shoes", "shoe"],
  ["Red Accent Trainers", "shoes", 7, 10, "black athletic trainers with restrained red accents", "shoes", "shoe"],
  ["Onyx Steel Watch", "watches", 10, null, "onyx black steel minimalist wristwatch", "watch", "one"],
  ["Silver Minimal Watch", "watches", 9, 10, "silver steel minimalist wristwatch with white dial", "watch", "one"],
  ["Black Chronograph Watch", "watches", 10, null, "black steel chronograph wristwatch", "watch", "one"],
  ["Brown Leather Classic Watch", "watches", 8, 10, "classic watch with brown leather strap", "watch", "one"],
  ["Black Structured Cap", "accessories", 5, 8, "structured matte black men's cap", "accessory", "one"],
  ["Red Leather Belt", "accessories", 5, 8, "deep red leather belt with minimal black buckle", "accessory", "one"],
  ["Minimal Black Crossbody Bag", "accessories", 7, 10, "minimal matte black crossbody bag", "accessory", "one"],
  ["Black Polarized Sunglasses", "accessories", 6, 9, "black polarized square-frame sunglasses", "accessory", "one"],
  ["Black Bomber Jacket", "outerwear", 9, 10, "matte black modern bomber jacket", "top", "alpha"],
  ["Red Track Jacket", "outerwear", 8, 10, "scarlet red athletic track jacket with black trim", "top", "alpha"],
  ["Charcoal Wool Overcoat", "outerwear", 10, null, "charcoal wool knee-length tailored overcoat", "top", "alpha"],
];

const SIZE_LABELS = {
  alpha: ["S", "M", "L", "XL", "XXL"],
  waist: ["30", "32", "34", "36", "38"],
  khamiis: ["52", "54", "56", "58", "60"],
  shoe: ["40", "41", "42", "43", "44"],
  one: ["ONE SIZE"],
};

const MODEL_DESCRIPTION = "the same stylish adult Black East African male model from the references, athletic build, short dense curls, neatly groomed full beard, confident understated expression";

function padProduct(index) {
  return String(index + 1).padStart(2, "0");
}

function sizeInventory(group, index) {
  return SIZE_LABELS[group].map((size, position) => ({
    size,
    stock: group === "one" ? 12 + (index % 5) : 3 + ((index + position * 2) % 5),
  }));
}

function panelImages(index) {
  const base = `/assets/catalog-ai/product-${padProduct(index)}.webp`;
  return [1, 2, 3, 4].map((panel) => `${base}#panel=${panel}`);
}

function subjectDirection(aiType, item) {
  if (aiType === "pants") return `Focus on ${item}. Frame waist-to-shoes for three panels and use one full-body panel; upper clothing must be plain black and visually secondary.`;
  if (aiType === "shoes") return `Focus tightly on ${item}. Use clean foot-level product framing, one on-foot lifestyle view and material close-ups; clothing stays secondary.`;
  if (aiType === "watch") return `Focus tightly on ${item}. Use one isolated gray product view, two wrist close-ups and one refined lifestyle wrist view.`;
  if (aiType === "accessory") return `Focus on ${item}. Use one isolated gray product view, two close details and one on-model lifestyle view.`;
  if (aiType === "outfit") return `Show the complete ${item} from collar to footwear with an elegant full-body stance.`;
  return `Make ${item} the clear hero. Keep trousers neutral black or light gray and visually secondary.`;
}

function contactSheetPrompt(product) {
  return [
    "Use case: product-mockup",
    "Asset type: ONE TEN ecommerce product contact sheet",
    `Primary request: create four consistent professional catalog views of ${product.item}.`,
    `Subject: ${MODEL_DESCRIPTION}. ${subjectDirection(product.ai_type, product.item)}`,
    "Composition: exact 2 by 2 grid of four equal square panels. Panel 1 clean light-gray studio front view. Panel 2 clean gray three-quarter view. Panel 3 premium material/detail close-up. Panel 4 black, white and red architectural lifestyle scene.",
    "Lighting: crisp luxury ecommerce lighting, realistic skin and fabric texture, sharp product detail.",
    "Consistency: the product color, construction and model identity must remain identical in all four panels.",
    "Constraints: no words, no letters, no numbers, no logo, no watermark, no price graphics, no borders, no captions. Do not include the ONE TEN logo inside the image.",
  ].join("\n");
}

function individualPrompts(product) {
  const base = `${MODEL_DESCRIPTION}. Advertise ${product.item}. ${subjectDirection(product.ai_type, product.item)} Photorealistic luxury men's ecommerce photography. Keep product construction and color exact. No words, letters, numbers, logos, watermark, price, caption or graphic overlay.`;
  return [
    `${base} Clean light-gray seamless studio, clear catalog front view, balanced square composition.`,
    `${base} Clean gray studio, refined three-quarter view, square composition.`,
    `${base} Premium detail close-up showing material, finish and construction, square composition.`,
    `${base} Sophisticated black, white and red architectural lifestyle scene, square composition.`,
  ];
}

const CATALOG_PRODUCTS = PRODUCT_SPECS.map(([name, category_key, price, old_price, item, ai_type, size_group], index) => {
  const product_sizes = sizeInventory(size_group, index);
  const images = panelImages(index);
  const product = {
    catalog_index: index + 1,
    category_key,
    name,
    price,
    old_price,
    badge: "AI EDIT",
    rating: (4.6 + (index % 4) * 0.1).toFixed(1),
    product_sizes,
    stock: product_sizes.reduce((sum, row) => sum + row.stock, 0),
    image: images[0],
    images,
    crop: "center",
    description: `${name} brings a clean ONE TEN finish to everyday men's style with premium-looking details and an accessible price.`,
    ai_type,
    item,
    ai_images: [],
    active: true,
    seed_batch: CATALOG_BATCH,
  };
  product.ai_prompts = individualPrompts(product);
  product.contact_sheet_prompt = contactSheetPrompt(product);
  return product;
});

const CATALOG_ADS = [
  { title: "Sharp Shirts. Clean Prices.", subtitle: "Tailored men's shirts from $5 to $10.", button_text: "Shop Shirts", link: "/shop", image: CATALOG_PRODUCTS[0].images[3], active: true, sort_order: 10, seed_batch: CATALOG_BATCH },
  { title: "Modern Khamiis Collection", subtitle: "Refined classics made for every occasion.", button_text: "View Khamiis", link: "/shop", image: CATALOG_PRODUCTS[19].images[0], active: true, sort_order: 20, seed_batch: CATALOG_BATCH },
  { title: "Shoes That Finish The Look", subtitle: "Formal, casual and street-ready pairs under $10.", button_text: "Shop Shoes", link: "/shop", image: CATALOG_PRODUCTS[24].images[3], active: true, sort_order: 30, seed_batch: CATALOG_BATCH },
  { title: "Time. Style. ONE TEN.", subtitle: "Minimal men's watches with a premium edge.", button_text: "View Watches", link: "/shop", image: CATALOG_PRODUCTS[29].images[2], active: true, sort_order: 40, seed_batch: CATALOG_BATCH },
];

module.exports = {
  CATALOG_ADS,
  CATALOG_BATCH,
  CATALOG_CATEGORIES,
  CATALOG_PRODUCTS,
};
