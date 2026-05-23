import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { formatTemperature, formatVolume, formatWeight } from './conversion.ts';

describe('formatWeight (TDS)', () => {
  it('returns grams with one decimal for metric', () => {
    expect(formatWeight(0, 'metric')).toBe('0.0 g');
    expect(formatWeight(18, 'metric')).toBe('18.0 g');
    expect(formatWeight(15.5, 'metric')).toBe('15.5 g');
    expect(formatWeight(100, 'metric')).toBe('100.0 g');
  });

  it('returns ounces with one decimal for imperial', () => {
    expect(formatWeight(0, 'imperial')).toBe('0.0 oz');
    expect(formatWeight(28.3495, 'imperial')).toBe('1.0 oz');
    expect(formatWeight(56.699, 'imperial')).toBe('2.0 oz');
  });

  it('handles small weights in imperial', () => {
    expect(formatWeight(10, 'imperial')).toBe('0.4 oz');
    expect(formatWeight(5, 'imperial')).toBe('0.2 oz');
  });
});

describe('formatVolume (TDS)', () => {
  it('returns ml with zero decimals for metric', () => {
    expect(formatVolume(0, 'metric')).toBe('0 ml');
    expect(formatVolume(36, 'metric')).toBe('36 ml');
    expect(formatVolume(250, 'metric')).toBe('250 ml');
    expect(formatVolume(500, 'metric')).toBe('500 ml');
  });

  it('returns fl oz with one decimal for imperial', () => {
    expect(formatVolume(0, 'imperial')).toBe('0.0 fl oz');
    expect(formatVolume(29.5735, 'imperial')).toBe('1.0 fl oz');
    expect(formatVolume(250, 'imperial')).toBe('8.5 fl oz');
  });

  it('handles rounding for metric volume', () => {
    expect(formatVolume(36.7, 'metric')).toBe('37 ml');
    expect(formatVolume(249.4, 'metric')).toBe('249 ml');
  });
});

describe('formatTemperature (TDS)', () => {
  it('returns Celsius with degree symbol and one decimal', () => {
    expect(formatTemperature(0, 'celsius')).toBe('0.0\u00B0C');
    expect(formatTemperature(93, 'celsius')).toBe('93.0\u00B0C');
    expect(formatTemperature(100, 'celsius')).toBe('100.0\u00B0C');
  });

  it('returns Fahrenheit with degree symbol and one decimal', () => {
    expect(formatTemperature(0, 'fahrenheit')).toBe('32.0\u00B0F');
    expect(formatTemperature(93, 'fahrenheit')).toBe('199.4\u00B0F');
    expect(formatTemperature(100, 'fahrenheit')).toBe('212.0\u00B0F');
  });

  it('handles boiling and freezing points correctly', () => {
    expect(formatTemperature(100, 'celsius')).toBe('100.0\u00B0C');
    expect(formatTemperature(0, 'celsius')).toBe('0.0\u00B0C');
    expect(formatTemperature(100, 'fahrenheit')).toBe('212.0\u00B0F');
    expect(formatTemperature(0, 'fahrenheit')).toBe('32.0\u00B0F');
  });

  it('handles typical coffee brewing temperatures', () => {
    expect(formatTemperature(88, 'celsius')).toBe('88.0\u00B0C');
    expect(formatTemperature(96, 'celsius')).toBe('96.0\u00B0C');
    expect(formatTemperature(88, 'fahrenheit')).toBe('190.4\u00B0F');
    expect(formatTemperature(96, 'fahrenheit')).toBe('204.8\u00B0F');
  });
});
