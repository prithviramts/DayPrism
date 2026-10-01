import { describe, expect, test } from '@jest/globals';

import { FOODS, NUTRIENTS, foodById, scale } from '../lib/nutrition/foods';
import { parseMeal, readAmount, search } from '../lib/nutrition/parse';

describe('food table', () => {
  test('every food has finite, non-negative values', () => {
    for (const f of FOODS) for (const n of NUTRIENTS) {
      expect(Number.isFinite(f.per100g[n]) && f.per100g[n] >= 0).toBe(true);
    }
  });

  test('ids are unique', () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
  });

  test('macros roughly account for the calories (Atwater, fibre at 2 kcal/g)', () => {
    for (const f of FOODS) {
      const p = f.per100g;
      const atwater = 4 * p.protein + 4 * (p.carbs - p.fiber) + 2 * p.fiber + 9 * p.fat;
      // Very low-energy foods are dominated by rounding; alcohol's energy isn't in the macros.
      if (p.kcal < 40 || ['beer', 'wine'].includes(f.id)) continue;
      expect(Math.abs(atwater - p.kcal) / p.kcal).toBeLessThan(0.2);
    }
  });

  test('recipes are computed from their parts', () => {
    const dalRice = foodById('dal_rice')!;
    const dal = foodById('dal')!;
    const rice = foodById('rice')!;
    expect(dalRice.per100g.kcal).toBeCloseTo((dal.per100g.kcal + rice.per100g.kcal) / 2, 5);
    expect(scale(rice.per100g, 200).kcal).toBeCloseTo(260, 5);
  });
});

describe('meal parser', () => {
  test('the example from the brief', () => {
    const items = parseMeal('100g of Dal rice, 50g of potato fries, 200ml watermelon juice');
    expect(items.map((i) => i.food?.id)).toEqual(['dal_rice', 'fries', 'watermelon_juice']);
    expect(items[0].grams).toBe(100);
    expect(items[1].grams).toBe(50);
    expect(items[2].grams).toBeCloseTo(206, 0);
  });

  test('amount formats', () => {
    expect(readAmount('2 idli')).toMatchObject({ quantity: 2, unit: 'piece', rest: 'idli' });
    expect(readAmount('half bowl rice')).toMatchObject({ quantity: 0.5, unit: 'bowl', rest: 'rice' });
    expect(readAmount('rice 150 g')).toMatchObject({ quantity: 150, unit: 'g', rest: 'rice' });
    expect(readAmount('1.5kg watermelon')).toMatchObject({ quantity: 1500, unit: 'g' });
  });

  test('pieces use the food piece weight', () => {
    const [item] = parseMeal('2 roti');
    expect(item.food?.id).toBe('roti');
    expect(item.grams).toBe(80);
  });

  test('and / commas split items', () => {
    expect(parseMeal('1 banana and a glass of milk').map((i) => i.food?.id)).toEqual(['banana', 'milk']);
  });

  test('search prefers exact names', () => {
    expect(search('dal')[0].id).toBe('dal');
    expect(search('chicken curry')[0].id).toBe('chicken_curry');
    expect(search('tea')[0].id).toBe('chai');
  });
});
