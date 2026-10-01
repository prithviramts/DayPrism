import { describe, expect, test } from '@jest/globals';

import { mealTypeFor } from '../services/quick';

describe('repeat meal picks the meal for the time of day', () => {
  test('breakfast, lunch, snack, dinner boundaries', () => {
    expect(mealTypeFor('07:30')).toBe('Breakfast');
    expect(mealTypeFor('10:59')).toBe('Breakfast');
    expect(mealTypeFor('11:00')).toBe('Lunch');
    expect(mealTypeFor('15:30')).toBe('Snack');
    expect(mealTypeFor('19:00')).toBe('Dinner');
  });
});
