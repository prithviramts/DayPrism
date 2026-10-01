// The offline food table. Everything is per 100 g (per 100 ml for drinks is derived from density).
//
// Base foods are approximations of USDA FoodData Central (SR Legacy / FNDDS, public domain) and,
// for Indian staples, the Indian Food Composition Tables (IFCT 2017). Home-cooked dishes vary a lot
// with recipe and oil, so they are computed from a typical recipe of base foods (see RECIPES) and
// the app always labels results as estimates.
//
// Values, in order (see NUTRIENTS):
//   kcal, protein g, carbs g, fat g, fiber g, sugars g, saturated fat g,
//   sodium mg, potassium mg, calcium mg, iron mg, magnesium mg, zinc mg,
//   vitamin A µg RAE, vitamin C mg, vitamin D µg, vitamin B12 µg, folate µg DFE

export const NUTRIENTS = [
  'kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat',
  'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc',
  'vitA', 'vitC', 'vitD', 'vitB12', 'folate',
] as const;
export type Nutrient = (typeof NUTRIENTS)[number];
export type Nutrients = Record<Nutrient, number>;

export interface NutrientInfo { label: string; unit: string; dv: number | null; group: 'energy' | 'macro' | 'mineral' | 'vitamin' }

/** Labels and adult Daily Values (US FDA, 2,000 kcal reference diet). */
export const NUTRIENT_INFO: Record<Nutrient, NutrientInfo> = {
  kcal: { label: 'Calories', unit: 'kcal', dv: 2000, group: 'energy' },
  protein: { label: 'Protein', unit: 'g', dv: 50, group: 'macro' },
  carbs: { label: 'Carbohydrates', unit: 'g', dv: 275, group: 'macro' },
  fat: { label: 'Fat', unit: 'g', dv: 78, group: 'macro' },
  fiber: { label: 'Fibre', unit: 'g', dv: 28, group: 'macro' },
  sugar: { label: 'Sugars', unit: 'g', dv: null, group: 'macro' },
  satFat: { label: 'Saturated fat', unit: 'g', dv: 20, group: 'macro' },
  sodium: { label: 'Sodium', unit: 'mg', dv: 2300, group: 'mineral' },
  potassium: { label: 'Potassium', unit: 'mg', dv: 4700, group: 'mineral' },
  calcium: { label: 'Calcium', unit: 'mg', dv: 1300, group: 'mineral' },
  iron: { label: 'Iron', unit: 'mg', dv: 18, group: 'mineral' },
  magnesium: { label: 'Magnesium', unit: 'mg', dv: 420, group: 'mineral' },
  zinc: { label: 'Zinc', unit: 'mg', dv: 11, group: 'mineral' },
  vitA: { label: 'Vitamin A', unit: 'µg', dv: 900, group: 'vitamin' },
  vitC: { label: 'Vitamin C', unit: 'mg', dv: 90, group: 'vitamin' },
  vitD: { label: 'Vitamin D', unit: 'µg', dv: 20, group: 'vitamin' },
  vitB12: { label: 'Vitamin B12', unit: 'µg', dv: 2.4, group: 'vitamin' },
  folate: { label: 'Folate', unit: 'µg', dv: 400, group: 'vitamin' },
};

export interface FoodOptions {
  /** A drink: amounts in ml are converted with this density (g per ml). */
  density?: number;
  /** Grams in one piece / slice / serving, when "1 banana" or "2 idli" makes sense. */
  piece?: number;
  /** Grams in a typical bowl (katori). */
  bowl?: number;
  /** Grams in a cup (solids) — drinks use 240 ml. */
  cup?: number;
}

export interface Food extends FoodOptions {
  id: string;
  name: string;
  aliases: string[];
  per100g: Nutrients;
  /** Built from a recipe of other foods. */
  recipe?: [string, number][];
}

type V = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
type BaseRow = [id: string, name: string, aliases: string[], values: V, opts?: FoodOptions];
type RecipeRow = [id: string, name: string, aliases: string[], parts: [string, number][], opts?: FoodOptions];

const LIQUID = 1.03;

const BASE: BaseRow[] = [
  // ---- basics used in recipes
  ['water', 'Water', [], [0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 1, 0, 0, 0, 0, 0, 0], { density: 1 }],
  ['salt', 'Salt', [], [0, 0, 0, 0, 0, 0, 0, 38758, 8, 24, 0.3, 1, 0.1, 0, 0, 0, 0, 0], { piece: 1 }],
  ['oil', 'Vegetable oil', ['oil', 'cooking oil', 'sunflower oil', 'refined oil'], [884, 0, 0, 100, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { density: 0.92 }],
  ['ghee', 'Ghee', ['clarified butter'], [900, 0.3, 0, 99.5, 0, 0, 61.9, 2, 5, 4, 0, 0, 0, 684, 0, 1.5, 0, 0], { density: 0.91 }],
  ['butter', 'Butter', ['salted butter'], [717, 0.9, 0.1, 81.1, 0, 0.1, 51.4, 643, 24, 24, 0, 2, 0.1, 684, 0, 1.5, 0.2, 3], { piece: 10 }],
  ['sugar', 'Sugar', ['white sugar'], [387, 0, 100, 0, 0, 99.8, 0, 1, 2, 1, 0.1, 0, 0, 0, 0, 0, 0, 0], { piece: 5 }],
  ['jaggery', 'Jaggery', ['gur', 'gud'], [383, 0.4, 98, 0.1, 0, 85, 0, 30, 1050, 80, 2.6, 70, 0.2, 0, 0, 0, 0, 0], { piece: 10 }],
  ['honey', 'Honey', [], [304, 0.3, 82.4, 0, 0.2, 82.1, 0, 4, 52, 6, 0.4, 2, 0.2, 0, 0.5, 0, 0, 2], { piece: 21 }],
  ['lemon_juice', 'Lemon juice', ['lime juice', 'nimbu'], [22, 0.4, 6.9, 0.2, 0.3, 2.5, 0, 1, 103, 6, 0.1, 6, 0.1, 1, 38.7, 0, 0, 20], { density: 1.03 }],

  // ---- grains
  ['rice', 'Rice, white, cooked', ['rice', 'white rice', 'plain rice', 'steamed rice', 'boiled rice', 'chawal', 'basmati rice', 'sona masoori'], [130, 2.7, 28.2, 0.3, 0.4, 0.1, 0.1, 1, 35, 10, 0.2, 12, 0.5, 0, 0, 0, 0, 3], { bowl: 160, cup: 158 }],
  ['brown_rice', 'Rice, brown, cooked', ['brown rice'], [123, 2.7, 25.6, 1.0, 1.6, 0.2, 0.3, 4, 86, 3, 0.6, 39, 0.7, 0, 0, 0, 0, 9], { bowl: 160, cup: 195 }],
  ['roti', 'Roti / chapati (whole wheat)', ['roti', 'chapati', 'chapathi', 'phulka', 'fulka'], [264, 9.0, 48.0, 3.7, 7.0, 1.5, 0.6, 250, 250, 30, 2.6, 80, 1.8, 0, 0, 0, 0, 30], { piece: 40 }],
  ['paratha', 'Paratha, plain', ['paratha', 'parotta', 'parantha'], [326, 6.4, 45.4, 14.3, 4.0, 1.2, 3.5, 450, 130, 25, 2.0, 30, 0.7, 0, 0, 0, 0, 40], { piece: 80 }],
  ['naan', 'Naan', ['naan', 'nan'], [291, 9.6, 50.6, 5.7, 2.2, 3.6, 1.4, 465, 125, 75, 3.3, 22, 0.8, 0, 0.1, 0, 0.1, 99], { piece: 90 }],
  ['bread_white', 'Bread, white', ['bread', 'white bread', 'toast', 'pav', 'bun'], [266, 7.6, 50.6, 3.3, 2.4, 5.0, 0.7, 477, 117, 144, 3.6, 25, 0.8, 0, 0, 0, 0, 105], { piece: 28 }],
  ['bread_brown', 'Bread, whole wheat', ['brown bread', 'whole wheat bread', 'wheat bread', 'multigrain bread'], [252, 12.4, 42.7, 3.5, 6.0, 4.4, 0.7, 450, 254, 161, 2.5, 76, 1.8, 0, 0, 0, 0, 42], { piece: 32 }],
  ['idli', 'Idli', ['idli', 'idly'], [132, 4.5, 27.0, 0.6, 1.5, 0.3, 0.1, 280, 75, 15, 0.8, 20, 0.6, 0, 0, 0, 0, 15], { piece: 40 }],
  ['dosa', 'Dosa, plain', ['dosa', 'plain dosa', 'dosai'], [168, 3.9, 29.0, 3.7, 1.0, 0.4, 0.6, 250, 80, 15, 0.9, 20, 0.6, 0, 0, 0, 0, 12], { piece: 80 }],
  ['poha', 'Poha', ['poha', 'aval', 'beaten rice'], [180, 3.3, 30.0, 5.0, 1.4, 1.5, 0.7, 300, 110, 15, 1.8, 25, 0.5, 10, 4, 0, 0, 10], { bowl: 150, cup: 150 }],
  ['upma', 'Upma', ['upma', 'rava upma', 'uppittu'], [170, 4.0, 25.0, 6.0, 1.5, 1.0, 1.2, 330, 100, 15, 0.8, 20, 0.5, 15, 2, 0, 0, 12], { bowl: 180, cup: 180 }],
  ['oats_cooked', 'Oats porridge (with water)', ['oats', 'oatmeal', 'porridge', 'oat porridge'], [71, 2.5, 12.0, 1.5, 1.7, 0.3, 0.3, 4, 70, 9, 0.9, 27, 0.6, 0, 0, 0, 0, 6], { bowl: 234, cup: 234 }],
  ['oats_dry', 'Oats, dry (rolled)', ['rolled oats', 'raw oats', 'dry oats'], [379, 13.2, 67.7, 6.5, 10.1, 1.0, 1.1, 6, 362, 52, 4.3, 138, 3.6, 0, 0, 0, 0, 32], { cup: 81 }],
  ['pasta', 'Pasta, cooked', ['pasta', 'spaghetti', 'macaroni', 'penne'], [158, 5.8, 30.9, 0.9, 1.8, 0.6, 0.2, 1, 44, 7, 1.3, 18, 0.5, 0, 0, 0, 0, 72], { bowl: 200, cup: 140 }],
  ['instant_noodles', 'Instant noodles, prepared', ['maggi', 'instant noodles', 'noodles', 'ramen'], [138, 3.3, 19.0, 5.3, 0.9, 0.5, 2.4, 400, 40, 9, 1.2, 10, 0.3, 0, 0, 0, 0, 20], { bowl: 250, piece: 250 }],
  ['quinoa', 'Quinoa, cooked', ['quinoa'], [120, 4.4, 21.3, 1.9, 2.8, 0.9, 0.2, 7, 172, 17, 1.5, 64, 1.1, 0, 0, 0, 0, 42], { bowl: 185, cup: 185 }],

  // ---- pulses (boiled)
  ['toor', 'Toor dal, boiled', ['toor dal', 'arhar dal', 'pigeon peas', 'tuvar dal'], [121, 6.8, 23.3, 0.4, 6.7, 0, 0.1, 5, 384, 43, 1.1, 46, 0.9, 0, 0, 0, 0, 111], { bowl: 150 }],
  ['masoor', 'Lentils (masoor), boiled', ['masoor dal', 'lentils', 'red lentils'], [116, 9.0, 20.1, 0.4, 7.9, 1.8, 0.1, 2, 369, 19, 3.3, 36, 1.3, 0, 1.5, 0, 0, 181], { bowl: 150 }],
  ['moong', 'Moong (mung), boiled', ['moong dal', 'mung dal', 'mung beans', 'green gram'], [105, 7.0, 19.2, 0.4, 7.6, 2.0, 0.1, 2, 266, 27, 1.4, 48, 0.8, 1, 1, 0, 0, 159], { bowl: 150 }],
  ['chickpeas', 'Chickpeas, boiled', ['chickpeas', 'chana', 'kabuli chana', 'garbanzo'], [164, 8.9, 27.4, 2.6, 7.6, 4.8, 0.3, 7, 291, 49, 2.9, 48, 1.5, 1, 1.3, 0, 0, 172], { bowl: 150, cup: 164 }],
  ['kidney_beans', 'Kidney beans, boiled', ['kidney beans', 'rajma beans'], [127, 8.7, 22.8, 0.5, 6.4, 0.3, 0.1, 1, 405, 35, 2.9, 45, 1.0, 0, 1.2, 0, 0, 130], { bowl: 150, cup: 177 }],
  ['tofu', 'Tofu, firm', ['tofu'], [144, 17.3, 2.8, 8.7, 2.3, 0.6, 1.3, 14, 237, 683, 2.7, 58, 1.6, 0, 0.2, 0, 0, 29], { piece: 85 }],

  // ---- vegetables
  ['potato', 'Potato, boiled', ['potato', 'boiled potato', 'aloo boiled'], [87, 1.9, 20.1, 0.1, 1.8, 0.9, 0, 4, 379, 5, 0.3, 22, 0.3, 0, 13, 0, 0, 10], { piece: 150 }],
  ['fries', 'French fries', ['fries', 'french fries', 'potato fries', 'chips (fries)', 'finger chips'], [312, 3.4, 41.4, 14.7, 3.8, 0.3, 2.3, 210, 579, 18, 0.8, 35, 0.5, 0, 4.7, 0, 0, 30], { bowl: 120 }],
  ['sweet_potato', 'Sweet potato, boiled', ['sweet potato', 'shakarkandi'], [76, 1.4, 17.7, 0.1, 2.5, 5.7, 0, 27, 230, 27, 0.7, 18, 0.2, 787, 12.8, 0, 0, 6], { piece: 150 }],
  ['onion', 'Onion, raw', ['onion', 'pyaz'], [40, 1.1, 9.3, 0.1, 1.7, 4.2, 0, 4, 146, 23, 0.2, 10, 0.2, 0, 7.4, 0, 0, 19], { piece: 110 }],
  ['tomato', 'Tomato, raw', ['tomato', 'tamatar'], [18, 0.9, 3.9, 0.2, 1.2, 2.6, 0, 5, 237, 10, 0.3, 11, 0.2, 42, 13.7, 0, 0, 15], { piece: 120 }],
  ['spinach', 'Spinach, cooked', ['spinach', 'palak', 'cooked spinach'], [23, 3.0, 3.8, 0.3, 2.4, 0.4, 0, 70, 466, 136, 3.6, 87, 0.8, 524, 9.8, 0, 0, 146], { bowl: 180 }],
  ['carrot', 'Carrot, raw', ['carrot', 'gajar'], [41, 0.9, 9.6, 0.2, 2.8, 4.7, 0, 69, 320, 33, 0.3, 12, 0.2, 835, 5.9, 0, 0, 19], { piece: 60 }],
  ['cucumber', 'Cucumber', ['cucumber', 'kheera'], [15, 0.7, 3.6, 0.1, 0.5, 1.7, 0, 2, 147, 16, 0.3, 13, 0.2, 5, 2.8, 0, 0, 7], { piece: 200 }],
  ['broccoli', 'Broccoli', ['broccoli'], [34, 2.8, 6.6, 0.4, 2.6, 1.7, 0, 33, 316, 47, 0.7, 21, 0.4, 31, 89.2, 0, 0, 63], { cup: 91 }],
  ['cauliflower', 'Cauliflower', ['cauliflower', 'gobi'], [25, 1.9, 5.0, 0.3, 2.0, 1.9, 0.1, 30, 299, 22, 0.4, 15, 0.3, 0, 48.2, 0, 0, 57], { cup: 107 }],
  ['peas', 'Green peas, cooked', ['peas', 'green peas', 'matar'], [84, 5.4, 15.6, 0.2, 5.5, 5.9, 0, 3, 271, 27, 1.5, 39, 1.2, 40, 14.2, 0, 0, 63], { cup: 160 }],
  ['okra', 'Okra', ['okra', 'bhindi', 'ladies finger', 'lady finger'], [33, 1.9, 7.5, 0.2, 3.2, 1.5, 0, 7, 299, 82, 0.6, 57, 0.6, 36, 23, 0, 0, 60], { cup: 100 }],
  ['cabbage', 'Cabbage', ['cabbage', 'patta gobi'], [25, 1.3, 5.8, 0.1, 2.5, 3.2, 0, 18, 170, 40, 0.5, 12, 0.2, 5, 36.6, 0, 0, 43], { cup: 89 }],
  ['lettuce', 'Lettuce / salad greens', ['lettuce', 'salad', 'green salad', 'salad greens'], [15, 1.4, 2.9, 0.2, 1.3, 0.8, 0, 28, 194, 36, 0.9, 13, 0.2, 370, 9.2, 0, 0, 38], { bowl: 100, cup: 47 }],

  // ---- fruit
  ['apple', 'Apple', ['apple', 'seb'], [52, 0.3, 13.8, 0.2, 2.4, 10.4, 0, 1, 107, 6, 0.1, 5, 0, 3, 4.6, 0, 0, 3], { piece: 180 }],
  ['banana', 'Banana', ['banana', 'kela'], [89, 1.1, 22.8, 0.3, 2.6, 12.2, 0.1, 1, 358, 5, 0.3, 27, 0.2, 3, 8.7, 0, 0, 20], { piece: 118 }],
  ['orange', 'Orange', ['orange', 'santra', 'mosambi', 'sweet lime'], [47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, 0, 181, 40, 0.1, 10, 0.1, 11, 53.2, 0, 0, 30], { piece: 130 }],
  ['mango', 'Mango', ['mango', 'aam'], [60, 0.8, 15.0, 0.4, 1.6, 13.7, 0.1, 1, 168, 11, 0.2, 10, 0.1, 54, 36.4, 0, 0, 43], { piece: 200, cup: 165 }],
  ['watermelon', 'Watermelon', ['watermelon', 'tarbooz', 'tarbuj'], [30, 0.6, 7.6, 0.2, 0.4, 6.2, 0, 1, 112, 7, 0.2, 10, 0.1, 28, 8.1, 0, 0, 3], { cup: 152, bowl: 150 }],
  ['grapes', 'Grapes', ['grapes', 'angoor'], [69, 0.7, 18.1, 0.2, 0.9, 15.5, 0.1, 2, 191, 10, 0.4, 7, 0.1, 3, 3.2, 0, 0, 2], { cup: 151 }],
  ['papaya', 'Papaya', ['papaya', 'papita'], [43, 0.5, 10.8, 0.3, 1.7, 7.8, 0.1, 8, 182, 20, 0.3, 21, 0.1, 47, 60.9, 0, 0, 37], { cup: 145, bowl: 150 }],
  ['pomegranate', 'Pomegranate', ['pomegranate', 'anar'], [83, 1.7, 18.7, 1.2, 4.0, 13.7, 0.1, 3, 236, 10, 0.3, 12, 0.4, 0, 10.2, 0, 0, 38], { cup: 174, piece: 280 }],
  ['guava', 'Guava', ['guava', 'amrood', 'peru'], [68, 2.6, 14.3, 1.0, 5.4, 8.9, 0.3, 2, 417, 18, 0.3, 22, 0.2, 31, 228.3, 0, 0, 49], { piece: 100 }],
  ['pineapple', 'Pineapple', ['pineapple', 'ananas'], [50, 0.5, 13.1, 0.1, 1.4, 9.9, 0, 1, 109, 13, 0.3, 12, 0.1, 3, 47.8, 0, 0, 18], { cup: 165 }],
  ['strawberries', 'Strawberries', ['strawberry', 'strawberries'], [32, 0.7, 7.7, 0.3, 2.0, 4.9, 0, 1, 153, 16, 0.4, 13, 0.1, 1, 58.8, 0, 0, 24], { cup: 152, piece: 12 }],
  ['dates', 'Dates (dried)', ['dates', 'date', 'khajur', 'medjool'], [277, 1.8, 75.0, 0.2, 6.7, 66.5, 0, 1, 696, 64, 0.9, 54, 0.4, 7, 0, 0, 0, 15], { piece: 24 }],

  // ---- drinks
  ['orange_juice', 'Orange juice', ['orange juice', 'oj', 'mosambi juice'], [45, 0.7, 10.4, 0.2, 0.2, 8.4, 0, 1, 200, 11, 0.2, 11, 0.1, 10, 50, 0, 0, 30], { density: 1.04 }],
  ['apple_juice', 'Apple juice', ['apple juice'], [46, 0.1, 11.3, 0.1, 0.2, 9.6, 0, 4, 101, 8, 0.1, 5, 0, 1, 0.9, 0, 0, 0], { density: 1.04 }],
  ['coconut_water', 'Coconut water', ['coconut water', 'tender coconut', 'nariyal pani'], [19, 0.7, 3.7, 0.2, 1.1, 2.6, 0.2, 105, 250, 24, 0.3, 25, 0.1, 0, 2.4, 0, 0, 3], { density: 1.02 }],
  ['coffee_black', 'Coffee, black', ['black coffee', 'americano', 'espresso', 'filter decoction'], [2, 0.3, 0, 0, 0, 0, 0, 2, 49, 2, 0, 3, 0, 0, 0, 0, 0, 2], { density: 1 }],
  ['tea_black', 'Tea, black (no milk)', ['black tea', 'green tea', 'tea without milk'], [1, 0, 0.3, 0, 0, 0, 0, 3, 37, 0, 0, 3, 0, 0, 0, 0, 0, 5], { density: 1 }],
  ['cola', 'Cola / soft drink', ['coke', 'cola', 'pepsi', 'soft drink', 'soda', 'thums up', 'sprite'], [37, 0, 9.6, 0, 0, 9.0, 0, 4, 2, 2, 0.1, 0, 0, 0, 0, 0, 0, 0], { density: 1.04 }],
  ['beer', 'Beer', ['beer', 'lager'], [43, 0.5, 3.6, 0, 0, 0, 0, 4, 27, 4, 0, 6, 0, 0, 0, 0, 0, 6], { density: 1.01 }],
  ['wine', 'Wine', ['wine', 'red wine', 'white wine'], [85, 0.1, 2.6, 0, 0, 0.6, 0, 4, 127, 8, 0.5, 12, 0.1, 0, 0, 0, 0, 1], { density: 0.99 }],

  // ---- dairy & eggs
  ['milk', 'Milk, whole', ['milk', 'whole milk', 'full cream milk', 'doodh'], [61, 3.2, 4.8, 3.3, 0, 5.1, 1.9, 43, 132, 113, 0, 10, 0.4, 46, 0, 1.3, 0.5, 5], { density: LIQUID }],
  ['milk_toned', 'Milk, low-fat / toned', ['toned milk', 'low fat milk', 'skimmed milk', 'skim milk', 'double toned milk'], [42, 3.4, 5.0, 1.0, 0, 5.2, 0.6, 44, 150, 125, 0, 11, 0.4, 58, 0, 1.2, 0.5, 5], { density: LIQUID }],
  ['curd', 'Curd / plain yogurt', ['curd', 'yogurt', 'yoghurt', 'dahi', 'thayir'], [61, 3.5, 4.7, 3.3, 0, 4.7, 2.1, 46, 155, 121, 0.1, 12, 0.6, 27, 0.5, 0.1, 0.4, 7], { bowl: 150, cup: 245 }],
  ['paneer', 'Paneer', ['paneer', 'cottage cheese'], [265, 18.3, 1.2, 20.8, 0, 1.2, 13, 18, 100, 480, 0.2, 25, 2.7, 180, 0, 0.3, 0.8, 9], { piece: 20 }],
  ['cheese', 'Cheese, cheddar', ['cheese', 'cheddar', 'cheese slice'], [403, 24.9, 1.3, 33.1, 0, 0.5, 21.1, 621, 98, 721, 0.7, 28, 3.1, 265, 0, 0.6, 0.8, 18], { piece: 20 }],
  ['egg', 'Egg, boiled', ['egg', 'eggs', 'boiled egg', 'anda'], [155, 12.6, 1.1, 10.6, 0, 1.1, 3.3, 124, 126, 50, 1.2, 10, 1.1, 149, 0, 2.2, 1.1, 44], { piece: 50 }],
  ['ice_cream', 'Ice cream, vanilla', ['ice cream', 'icecream', 'kulfi'], [207, 3.5, 23.6, 11.0, 0.7, 21.2, 6.8, 80, 199, 128, 0.1, 14, 0.7, 118, 0.6, 0.2, 0.4, 5], { piece: 70, cup: 132 }],

  // ---- meat & fish (cooked)
  ['chicken', 'Chicken breast, cooked', ['chicken', 'chicken breast', 'grilled chicken', 'boiled chicken'], [165, 31.0, 0, 3.6, 0, 0, 1.0, 74, 256, 15, 1.0, 29, 1.0, 6, 0, 0.1, 0.3, 4], { piece: 120 }],
  ['mutton', 'Mutton (goat), cooked', ['mutton', 'goat', 'goat meat', 'lamb'], [143, 27.1, 0, 3.0, 0, 0, 0.9, 86, 405, 17, 3.7, 24, 5.3, 0, 0, 0, 1.2, 5]],
  ['fish', 'Fish, white, cooked', ['fish', 'rohu', 'tilapia', 'basa', 'pomfret', 'white fish'], [128, 26.2, 0, 2.7, 0, 0, 0.9, 56, 380, 14, 0.7, 34, 0.4, 0, 0, 3.7, 1.9, 6], { piece: 100 }],
  ['salmon', 'Salmon, cooked', ['salmon'], [206, 22.1, 0, 12.4, 0, 0, 2.5, 61, 384, 15, 0.3, 30, 0.4, 15, 3.7, 13.1, 2.8, 34], { piece: 150 }],
  ['prawns', 'Prawns / shrimp, cooked', ['prawns', 'prawn', 'shrimp', 'jhinga'], [99, 24.0, 0.2, 0.3, 0, 0, 0.1, 111, 259, 70, 0.5, 39, 1.6, 0, 0, 0, 1.5, 18]],

  // ---- nuts
  ['almonds', 'Almonds', ['almond', 'almonds', 'badam'], [579, 21.2, 21.6, 49.9, 12.5, 4.4, 3.8, 1, 733, 269, 3.7, 270, 3.1, 0, 0, 0, 0, 44], { piece: 1.2 }],
  ['peanuts', 'Peanuts', ['peanut', 'peanuts', 'groundnut', 'moongphali'], [567, 25.8, 16.1, 49.2, 8.5, 4.7, 6.3, 18, 705, 92, 4.6, 168, 3.3, 0, 0, 0, 0, 240]],
  ['cashews', 'Cashews', ['cashew', 'cashews', 'kaju'], [553, 18.2, 30.2, 43.9, 3.3, 5.9, 7.8, 12, 660, 37, 6.7, 292, 5.8, 0, 0.5, 0, 0, 25], { piece: 1.5 }],
  ['walnuts', 'Walnuts', ['walnut', 'walnuts', 'akhrot'], [654, 15.2, 13.7, 65.2, 6.7, 2.6, 6.1, 2, 441, 98, 2.9, 158, 3.1, 1, 1.3, 0, 0, 98], { piece: 4 }],
  ['peanut_butter', 'Peanut butter', ['peanut butter'], [588, 25.1, 20.0, 50.4, 6.0, 9.2, 10.3, 426, 649, 43, 1.7, 154, 2.5, 0, 0, 0, 0, 87], { piece: 16 }],

  // ---- snacks, sweets & fast food
  ['samosa', 'Samosa', ['samosa'], [308, 4.7, 32.0, 17.9, 2.6, 1.5, 3.3, 420, 230, 22, 1.5, 22, 0.5, 10, 4, 0, 0, 20], { piece: 80 }],
  ['potato_chips', 'Potato chips (crisps)', ['chips', 'crisps', 'lays', 'potato chips', 'wafers'], [536, 7.0, 53.0, 34.6, 4.4, 0.3, 3.1, 525, 1275, 24, 1.6, 67, 1.1, 0, 19.7, 0, 0, 27], { piece: 2 }],
  ['pizza', 'Pizza, cheese', ['pizza', 'margherita', 'cheese pizza'], [266, 11.4, 33.3, 9.7, 2.3, 3.6, 4.5, 598, 172, 201, 2.4, 24, 1.6, 70, 0.4, 0.2, 0.4, 80], { piece: 107 }],
  ['burger', 'Burger', ['burger', 'hamburger', 'veg burger'], [250, 12.6, 29.7, 9.0, 1.5, 6.0, 3.3, 500, 230, 120, 2.5, 22, 2.0, 5, 0.5, 0.1, 0.9, 50], { piece: 150 }],
  ['dark_chocolate', 'Dark chocolate (70%)', ['dark chocolate'], [598, 7.8, 45.9, 42.6, 10.9, 24.0, 24.5, 20, 715, 73, 11.9, 228, 3.3, 2, 0, 0, 0.3, 0], { piece: 10 }],
  ['milk_chocolate', 'Milk chocolate', ['chocolate', 'milk chocolate', 'dairy milk'], [535, 7.7, 59.4, 29.7, 3.4, 51.5, 18.5, 79, 372, 189, 2.4, 63, 2.3, 50, 0, 0, 0.8, 11], { piece: 10 }],
  ['gulab_jamun', 'Gulab jamun', ['gulab jamun', 'jamun'], [323, 4.5, 50.0, 12.0, 0.6, 38.0, 6.0, 60, 120, 120, 0.8, 12, 0.4, 50, 0.5, 0, 0.2, 8], { piece: 40 }],
  ['biscuits', 'Biscuits / cookies', ['biscuit', 'biscuits', 'cookie', 'cookies', 'marie'], [480, 6.5, 70.0, 19.0, 2.0, 22.0, 9.0, 350, 120, 30, 2.0, 18, 0.5, 0, 0, 0, 0, 20], { piece: 8 }],
];

// Typical home recipes, as grams per 100 g of the finished dish (they need not sum to exactly 100).
const RECIPES: RecipeRow[] = [
  ['dal', 'Dal (toor, tadka)', ['dal', 'daal', 'dhal', 'dal tadka', 'dal fry', 'toor dal curry', 'paruppu'],
    [['toor', 60], ['water', 28], ['tomato', 5], ['onion', 4], ['oil', 2.5], ['salt', 0.5]], { bowl: 150 }],
  ['dal_rice', 'Dal rice', ['dal rice', 'daal chawal', 'dal chawal', 'rice and dal', 'rice dal', 'paruppu sadam'],
    [['dal', 50], ['rice', 50]], { bowl: 250 }],
  ['curd_rice', 'Curd rice', ['curd rice', 'thayir sadam', 'dahi chawal', 'yogurt rice'],
    [['rice', 55], ['curd', 40], ['water', 2.5], ['oil', 2], ['salt', 0.5]], { bowl: 250 }],
  ['sambar', 'Sambar', ['sambar', 'sambhar'],
    [['toor', 25], ['tomato', 10], ['onion', 8], ['carrot', 6], ['potato', 6], ['oil', 2.5], ['water', 41.5], ['salt', 1]], { bowl: 150 }],
  ['sambar_rice', 'Sambar rice', ['sambar rice', 'sambar sadam'], [['sambar', 50], ['rice', 50]], { bowl: 250 }],
  ['rajma', 'Rajma (kidney bean curry)', ['rajma', 'rajma curry'],
    [['kidney_beans', 55], ['tomato', 15], ['onion', 10], ['water', 15], ['oil', 4], ['salt', 1]], { bowl: 150 }],
  ['rajma_rice', 'Rajma chawal', ['rajma chawal', 'rajma rice'], [['rajma', 50], ['rice', 50]], { bowl: 250 }],
  ['chole', 'Chole (chickpea curry)', ['chole', 'chana masala', 'chhole', 'channa'],
    [['chickpeas', 55], ['tomato', 15], ['onion', 10], ['water', 14], ['oil', 5], ['salt', 1]], { bowl: 150 }],
  ['khichdi', 'Khichdi', ['khichdi', 'khichri', 'pongal'],
    [['rice', 40], ['moong', 30], ['water', 25], ['ghee', 3], ['tomato', 1.2], ['salt', 0.8]], { bowl: 200 }],
  ['jeera_rice', 'Jeera rice', ['jeera rice', 'fried rice plain'], [['rice', 94], ['oil', 5], ['salt', 1]], { bowl: 160 }],
  ['lemon_rice', 'Lemon rice', ['lemon rice', 'chitranna'],
    [['rice', 88], ['oil', 6], ['peanuts', 3], ['lemon_juice', 2], ['salt', 1]], { bowl: 160 }],
  ['veg_biryani', 'Veg biryani / pulao', ['veg biryani', 'vegetable biryani', 'pulao', 'pulav', 'veg pulao'],
    [['rice', 60], ['carrot', 8], ['peas', 8], ['potato', 8], ['onion', 6], ['oil', 5], ['curd', 4], ['salt', 1]], { bowl: 200 }],
  ['chicken_biryani', 'Chicken biryani', ['chicken biryani', 'biryani', 'biriyani'],
    [['rice', 55], ['chicken', 25], ['onion', 8], ['oil', 6], ['curd', 5], ['salt', 1]], { bowl: 250 }],
  ['fried_rice', 'Vegetable fried rice', ['fried rice', 'veg fried rice'],
    [['rice', 75], ['carrot', 6], ['peas', 6], ['cabbage', 5], ['oil', 6], ['onion', 1], ['salt', 1]], { bowl: 200 }],
  ['palak_paneer', 'Palak paneer', ['palak paneer', 'saag paneer'],
    [['spinach', 50], ['paneer', 25], ['onion', 8], ['tomato', 7], ['water', 5.2], ['oil', 4], ['salt', 0.8]], { bowl: 150 }],
  ['paneer_curry', 'Paneer curry (butter masala)', ['paneer butter masala', 'paneer curry', 'shahi paneer', 'kadai paneer'],
    [['paneer', 35], ['tomato', 30], ['onion', 10], ['butter', 5], ['oil', 4], ['water', 15], ['salt', 1]], { bowl: 150 }],
  ['aloo_sabzi', 'Aloo sabzi (potato curry)', ['aloo sabzi', 'potato curry', 'aloo curry', 'potato fry', 'aloo fry', 'aloo'],
    [['potato', 70], ['onion', 10], ['tomato', 8], ['oil', 6], ['water', 5], ['salt', 1]], { bowl: 150 }],
  ['mixed_veg', 'Mixed vegetable curry', ['mixed veg', 'mix veg', 'vegetable curry', 'sabzi', 'sabji', 'poriyal', 'veg curry'],
    [['potato', 20], ['carrot', 15], ['peas', 15], ['cauliflower', 15], ['onion', 10], ['tomato', 10], ['water', 9], ['oil', 5], ['salt', 1]], { bowl: 150 }],
  ['bhindi', 'Bhindi fry', ['bhindi fry', 'bhindi masala', 'okra fry', 'vendakkai'],
    [['okra', 85], ['onion', 7], ['oil', 7], ['salt', 1]], { bowl: 120 }],
  ['egg_curry', 'Egg curry', ['egg curry', 'anda curry'],
    [['egg', 45], ['tomato', 20], ['onion', 15], ['water', 13], ['oil', 6], ['salt', 1]], { bowl: 200 }],
  ['omelette', 'Omelette', ['omelette', 'omelet', 'egg omelette', 'masala omelette'],
    [['egg', 90], ['oil', 5], ['onion', 4], ['tomato', 0.5], ['salt', 0.5]], { piece: 110 }],
  ['chicken_curry', 'Chicken curry', ['chicken curry', 'chicken masala', 'butter chicken', 'chicken gravy'],
    [['chicken', 50], ['onion', 15], ['tomato', 15], ['curd', 8], ['oil', 6], ['water', 5.5], ['salt', 0.5]], { bowl: 200 }],
  ['mutton_curry', 'Mutton curry', ['mutton curry', 'goat curry', 'lamb curry'],
    [['mutton', 50], ['onion', 15], ['tomato', 15], ['curd', 5], ['oil', 7], ['water', 7], ['salt', 1]], { bowl: 200 }],
  ['fish_curry', 'Fish curry', ['fish curry', 'meen curry', 'machli'],
    [['fish', 50], ['tomato', 15], ['onion', 12], ['water', 16], ['oil', 6], ['salt', 1]], { bowl: 200 }],
  ['masala_dosa', 'Masala dosa', ['masala dosa'], [['dosa', 55], ['aloo_sabzi', 45]], { piece: 180 }],
  ['raita', 'Raita', ['raita', 'cucumber raita', 'pachadi'],
    [['curd', 80], ['cucumber', 15], ['onion', 4], ['salt', 1]], { bowl: 100 }],
  ['veg_sandwich', 'Veg sandwich', ['sandwich', 'veg sandwich', 'cheese sandwich'],
    [['bread_white', 50], ['cheese', 10], ['cucumber', 10], ['tomato', 10], ['potato', 10], ['butter', 5], ['onion', 5]], { piece: 150 }],
  ['chai', 'Tea with milk and sugar (chai)', ['tea', 'chai', 'masala chai', 'milk tea', 'cutting chai'],
    [['water', 55], ['milk', 40], ['sugar', 5]], { density: LIQUID }],
  ['coffee_milk', 'Coffee with milk', ['coffee', 'filter coffee', 'cappuccino', 'latte', 'milk coffee'],
    [['milk', 60], ['coffee_black', 36], ['sugar', 4]], { density: LIQUID }],
  ['lassi', 'Sweet lassi', ['lassi', 'sweet lassi'], [['curd', 70], ['water', 22], ['sugar', 8]], { density: LIQUID }],
  ['buttermilk', 'Buttermilk (chaas)', ['buttermilk', 'chaas', 'chaach', 'majjige', 'mor', 'neer mor'],
    [['curd', 30], ['water', 69], ['salt', 0.6]], { density: 1.01 }],
  ['lemonade', 'Lemonade (nimbu pani)', ['lemonade', 'nimbu pani', 'lemon water', 'lime juice drink', 'shikanji'],
    [['water', 87], ['sugar', 8], ['lemon_juice', 5], ['salt', 0.3]], { density: 1.03 }],
  ['watermelon_juice', 'Watermelon juice (fresh, no sugar)', ['watermelon juice'], [['watermelon', 100]], { density: 1.03 }],
  ['mango_shake', 'Mango milkshake', ['mango shake', 'mango milkshake', 'mango lassi'],
    [['milk', 60], ['mango', 30], ['sugar', 10]], { density: 1.05 }],
  ['banana_shake', 'Banana milkshake', ['banana shake', 'banana milkshake', 'banana smoothie'],
    [['milk', 60], ['banana', 35], ['sugar', 5]], { density: 1.05 }],
];

// ---------------------------------------------------------------- build

const zero = (): Nutrients => Object.fromEntries(NUTRIENTS.map((n) => [n, 0])) as Nutrients;

function build(): Food[] {
  const byId = new Map<string, Food>();
  for (const [id, name, aliases, v, opts] of BASE) {
    const per100g = zero();
    NUTRIENTS.forEach((n, i) => { per100g[n] = v[i]; });
    byId.set(id, { id, name, aliases, per100g, ...opts });
  }
  for (const [id, name, aliases, parts, opts] of RECIPES) {
    const total = parts.reduce((s, [, g]) => s + g, 0);
    const per100g = zero();
    for (const [part, grams] of parts) {
      const f = byId.get(part);
      if (!f) throw new Error(`Recipe ${id} uses unknown food ${part}`);
      for (const n of NUTRIENTS) per100g[n] += (f.per100g[n] * grams) / total;
    }
    byId.set(id, { id, name, aliases, per100g, recipe: parts, ...opts });
  }
  return [...byId.values()];
}

export const FOODS: Food[] = build();
export const foodById = (id: string) => FOODS.find((f) => f.id === id);

/** Scales per-100 g values to an amount in grams. */
export function scale(per100g: Nutrients, grams: number): Nutrients {
  const out = zero();
  for (const n of NUTRIENTS) out[n] = (per100g[n] * grams) / 100;
  return out;
}

export function sum(list: Nutrients[]): Nutrients {
  const out = zero();
  for (const x of list) for (const n of NUTRIENTS) out[n] += x[n] ?? 0;
  return out;
}
