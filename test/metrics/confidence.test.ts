import { describe, it, expect } from 'vitest';
import { extractConfidence, histogram } from '@/lib/metrics/confidence';
import {
  errorAttempt,
  letterPassAttempt,
  nullAudioAttempt,
  wordPassAttempt,
} from '../fixtures/attempts';

describe('extractConfidence', () => {
  it('extracts letter probabilities and confidence (0..1 vs 0..100)', () => {
    expect(extractConfidence(letterPassAttempt.modelOutput, 'letter')).toEqual({
      kind: 'letter',
      targetProbability: 0.93,
      predictedProbability: 0.93,
      confidence: 96,
    });
  });

  it('extracts word similarity and (uncalibrated) confidence', () => {
    expect(extractConfidence(wordPassAttempt.modelOutput, 'word')).toEqual({
      kind: 'word',
      similarity: 0.91,
      confidence: 88,
    });
    expect(extractConfidence(nullAudioAttempt.modelOutput, 'word')).toEqual({
      kind: 'word',
      similarity: 0.42,
      confidence: 35,
    });
  });

  it('returns the requested shape with all-null fields for error payloads', () => {
    expect(extractConfidence(errorAttempt.modelOutput, 'word')).toEqual({
      kind: 'word',
      similarity: null,
      confidence: null,
    });
    expect(extractConfidence(errorAttempt.modelOutput, 'letter')).toEqual({
      kind: 'letter',
      targetProbability: null,
      predictedProbability: null,
      confidence: null,
    });
  });

  it('is null-safe for null/undefined and non-object inputs', () => {
    expect(extractConfidence(null, 'letter')).toEqual({
      kind: 'letter',
      targetProbability: null,
      predictedProbability: null,
      confidence: null,
    });
    expect(extractConfidence(undefined, 'word')).toEqual({
      kind: 'word',
      similarity: null,
      confidence: null,
    });
    expect(extractConfidence('not-an-object', 'word')).toEqual({
      kind: 'word',
      similarity: null,
      confidence: null,
    });
  });

  it('selects the shape by attemptType, never by payload content', () => {
    // A word-shaped payload requested as a letter yields nulls for the
    // letter-only probability fields (they must never be blended).
    const result = extractConfidence(wordPassAttempt.modelOutput, 'letter');
    expect(result).toEqual({
      kind: 'letter',
      targetProbability: null,
      predictedProbability: null,
      confidence: 88,
    });
  });

  it('treats missing numeric fields as null', () => {
    expect(extractConfidence({ result: true }, 'letter')).toEqual({
      kind: 'letter',
      targetProbability: null,
      predictedProbability: null,
      confidence: null,
    });
  });
});

describe('histogram', () => {
  it('buckets values into equal-width bins over an explicit range', () => {
    const bins = histogram([0.1, 0.2, 0.5, 0.93, 0.93], 4, { min: 0, max: 1 });
    expect(bins.map((b) => b.count)).toEqual([2, 0, 1, 2]);
    expect(bins[0]).toEqual({ start: 0, end: 0.25, count: 2 });
    expect(bins[3].end).toBe(1);
  });

  it('places values equal to max in the final (closed) bin', () => {
    const bins = histogram([1], 4, { min: 0, max: 1 });
    expect(bins.map((b) => b.count)).toEqual([0, 0, 0, 1]);
  });

  it('clamps out-of-range values into the nearest edge bucket', () => {
    const bins = histogram([-5, 50], 2, { min: 0, max: 10 });
    expect(bins.map((b) => b.count)).toEqual([1, 1]);
  });

  it('derives the range from the data when none is provided', () => {
    const bins = histogram([1, 2, 3, 4], 4);
    expect(bins.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    expect(bins[0].start).toBe(1);
    expect(bins[3].end).toBe(4);
  });

  it('puts every value in the first bin when the range has zero width', () => {
    const bins = histogram([5, 5, 5], 2, { min: 5, max: 5 });
    expect(bins.map((b) => b.count)).toEqual([3, 0]);
  });

  it('ignores non-finite values', () => {
    const bins = histogram([0.2, Number.NaN, Number.POSITIVE_INFINITY], 2, {
      min: 0,
      max: 1,
    });
    expect(bins.map((b) => b.count)).toEqual([1, 0]);
  });

  it('returns [] for non-positive bin counts', () => {
    expect(histogram([1, 2, 3], 0)).toEqual([]);
    expect(histogram([1, 2, 3], -2)).toEqual([]);
  });

  it('returns [] for empty values with no explicit range', () => {
    expect(histogram([], 4)).toEqual([]);
  });

  it('returns empty (zero-count) bins for empty values when a range is given', () => {
    const bins = histogram([], 3, { min: 0, max: 1 });
    expect(bins).toHaveLength(3);
    expect(bins.every((b) => b.count === 0)).toBe(true);
  });
});
