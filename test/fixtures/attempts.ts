import type { Attempt } from '@/types/domain';

/**
 * Realistic {@link Attempt} fixtures for metric unit tests.
 *
 * Payloads mirror the documented `model_output` / `client_context` shapes
 * (letter API, word API, and the `{ error }` failure shape). Each fixture keeps
 * `outcome` consistent with `isCorrect` (pass=true, fail=false, error=null) and
 * `hasAudio` consistent with `audioStoragePath`, so the fixtures double as a
 * sanity check on the taxonomy.
 */

/** First test child. */
const CHILD_A = '11111111-1111-4111-8111-111111111111';
/** Second test child (exercises multi-child aggregates). */
const CHILD_B = '22222222-2222-4222-8222-222222222222';

/** Single-attempt session resolved on the first try: a correct "Alif" letter. */
export const letterPassAttempt: Attempt = {
  id: 'a1111111-0000-4000-8000-000000000001',
  childId: CHILD_A,
  sessionId: 'pron-1782121407706-aaaaaa',
  attemptNumber: 1,
  attemptType: 'letter',
  outcome: 'pass',
  isCorrect: true,
  targetLabel: 'ا Alif',
  targetSentToApi: 'Alif',
  targetDisplay: 'ا',
  audioStoragePath: `${CHILD_A}/pron-1782121407706-aaaaaa/1.wav`,
  hasAudio: true,
  modelOutput: {
    result: true,
    predicted_letter: 'Alif',
    predicted_probability: 0.93,
    target_probability: 0.93,
    confidence: 96,
    transcription: 'ا',
    similarity: 0.98,
    message: 'Correct!',
    processing_time_ms: 412,
    model: 'letter-v3',
    variant: 'default',
  },
  clientContext: {
    endpoint: 'https://api.kutuby.com/verify_letter',
    httpStatus: 200,
    apiLatencyMs: 642,
    targetTextApp: 'ا',
    requestPayload: { target_letter: 'Alif', threshold: 0.5 },
    recordingDurationMs: 1320,
    speechDetected: true,
    peakMeteringDb: -12.4,
    stopReason: 'silence',
    platform: 'ios',
    appVersion: '2.7.1',
    deviceModel: 'iPhone14,5',
    isRealDevice: true,
    isSimulator: false,
  },
  recordedAt: '2026-06-20T09:00:00.000Z',
  createdAt: '2026-06-20T09:00:01.000Z',
};

/** Single-attempt session, never resolved: an incorrect "Baa" letter. */
export const letterFailAttempt: Attempt = {
  id: 'a1111111-0000-4000-8000-000000000002',
  childId: CHILD_A,
  sessionId: 'pron-1782121407706-bbbbbb',
  attemptNumber: 1,
  attemptType: 'letter',
  outcome: 'fail',
  isCorrect: false,
  targetLabel: 'ب Baa',
  targetSentToApi: 'Baa',
  targetDisplay: 'ب',
  audioStoragePath: `${CHILD_A}/pron-1782121407706-bbbbbb/1.wav`,
  hasAudio: true,
  modelOutput: {
    result: false,
    predicted_letter: 'Ayn',
    predicted_probability: 0.61,
    target_probability: 0.12,
    confidence: 41,
    transcription: 'ع',
    similarity: 0.3,
    message: 'Try again',
    processing_time_ms: 388,
    model: 'letter-v3',
    variant: 'default',
  },
  clientContext: {
    endpoint: 'https://api.kutuby.com/verify_letter',
    httpStatus: 200,
    apiLatencyMs: 590,
    targetTextApp: 'ب',
    requestPayload: { target_letter: 'Baa', threshold: 0.5 },
    recordingDurationMs: 1100,
    speechDetected: true,
    peakMeteringDb: -10.1,
    stopReason: 'silence',
    platform: 'android',
    appVersion: '2.7.1',
    deviceModel: 'Pixel 7',
    isRealDevice: true,
    isSimulator: false,
  },
  recordedAt: '2026-06-20T09:05:00.000Z',
  createdAt: '2026-06-20T09:05:01.000Z',
};

/** Single-attempt session resolved on the first try: a correct word "كتاب". */
export const wordPassAttempt: Attempt = {
  id: 'a1111111-0000-4000-8000-000000000003',
  childId: CHILD_B,
  sessionId: 'pron-1782121407706-cccccc',
  attemptNumber: 1,
  attemptType: 'word',
  outcome: 'pass',
  isCorrect: true,
  targetLabel: 'كتاب',
  targetSentToApi: 'كتاب',
  targetDisplay: 'كتاب',
  audioStoragePath: `${CHILD_B}/pron-1782121407706-cccccc/1.wav`,
  hasAudio: true,
  modelOutput: {
    result: true,
    similarity: 0.91,
    confidence: 88,
    transcription: 'كتاب',
    message: 'Great job!',
    decision_basis: 'similarity',
    decision_threshold: 0.75,
    threshold_param_applied: true,
  },
  clientContext: {
    endpoint: 'https://api.kutuby.com/verify_word',
    httpStatus: 200,
    apiLatencyMs: 880,
    targetTextApp: 'كتاب',
    requestPayload: {
      target_word: 'كتاب',
      threshold: 0.75,
      fuzzy_match: true,
      fuzzy_threshold: 0.8,
    },
    recordingDurationMs: 1850,
    speechDetected: true,
    peakMeteringDb: -9.2,
    stopReason: 'manual',
    platform: 'ios',
    appVersion: '2.7.1',
    deviceModel: 'iPhone14,5',
    isRealDevice: true,
    isSimulator: false,
  },
  recordedAt: '2026-06-20T09:10:00.000Z',
  createdAt: '2026-06-20T09:10:01.000Z',
};

/**
 * Single-attempt session that failed at the infrastructure level: `is_correct`
 * is null, `model_output` is the `{ error }` shape, and audio upload also failed
 * so `audioStoragePath` is null.
 */
export const errorAttempt: Attempt = {
  id: 'a1111111-0000-4000-8000-000000000004',
  childId: CHILD_A,
  sessionId: 'pron-1782121407706-dddddd',
  attemptNumber: 1,
  attemptType: 'word',
  outcome: 'error',
  isCorrect: null,
  targetLabel: 'بيت',
  targetSentToApi: 'بيت',
  targetDisplay: 'بيت',
  audioStoragePath: null,
  hasAudio: false,
  modelOutput: { error: 'Audio processing failed: upstream timeout' },
  clientContext: {
    endpoint: 'https://api.kutuby.com/verify_word',
    httpStatus: 504,
    apiLatencyMs: 30000,
    targetTextApp: 'بيت',
    requestPayload: { target_word: 'بيت', threshold: 0.75 },
    recordingDurationMs: 1700,
    speechDetected: true,
    peakMeteringDb: -11.0,
    stopReason: 'silence',
    platform: 'android',
    appVersion: '2.7.0',
    deviceModel: 'SM-G991B',
    isRealDevice: true,
    isSimulator: false,
  },
  recordedAt: '2026-06-20T09:15:00.000Z',
  createdAt: '2026-06-20T09:15:01.000Z',
};

/**
 * A FAIL whose audio upload failed (`audioStoragePath` null) even though the
 * verification call itself returned a verdict — distinguishes "attempts" from
 * "attempts with audio".
 */
export const nullAudioAttempt: Attempt = {
  id: 'a1111111-0000-4000-8000-000000000005',
  childId: CHILD_B,
  sessionId: 'pron-1782121407706-eeeeee',
  attemptNumber: 1,
  attemptType: 'word',
  outcome: 'fail',
  isCorrect: false,
  targetLabel: 'شمس',
  targetSentToApi: 'شمس',
  targetDisplay: 'شمس',
  audioStoragePath: null,
  hasAudio: false,
  modelOutput: {
    result: false,
    similarity: 0.42,
    confidence: 35,
    transcription: '',
    message: 'Could not understand',
    decision_basis: 'similarity',
    decision_threshold: 0.75,
    threshold_param_applied: true,
  },
  clientContext: {
    endpoint: 'https://api.kutuby.com/verify_word',
    httpStatus: 200,
    apiLatencyMs: 910,
    targetTextApp: 'شمس',
    requestPayload: { target_word: 'شمس', threshold: 0.75 },
    recordingDurationMs: 600,
    speechDetected: false,
    peakMeteringDb: -38.0,
    stopReason: 'silence',
    platform: 'ios',
    appVersion: '2.7.1',
    deviceModel: 'iPhone13,2',
    isRealDevice: true,
    isSimulator: false,
  },
  recordedAt: '2026-06-20T09:20:00.000Z',
  createdAt: '2026-06-20T09:20:01.000Z',
};

/**
 * A multi-attempt session for the word "قمر": two FAILs then a PASS on the third
 * attempt. Resolved within 3 (but not within 1 or 2).
 */
export const multiSessionAttempts: readonly Attempt[] = [
  {
    id: 'a1111111-0000-4000-8000-000000000006',
    childId: CHILD_A,
    sessionId: 'pron-1782121407706-ffffff',
    attemptNumber: 1,
    attemptType: 'word',
    outcome: 'fail',
    isCorrect: false,
    targetLabel: 'قمر',
    targetSentToApi: 'قمر',
    targetDisplay: 'قمر',
    audioStoragePath: `${CHILD_A}/pron-1782121407706-ffffff/1.wav`,
    hasAudio: true,
    modelOutput: {
      result: false,
      similarity: 0.4,
      confidence: 30,
      transcription: 'قم',
      message: 'Try again',
      decision_basis: 'similarity',
      decision_threshold: 0.75,
      threshold_param_applied: true,
    },
    clientContext: {
      endpoint: 'https://api.kutuby.com/verify_word',
      httpStatus: 200,
      apiLatencyMs: 870,
      requestPayload: { target_word: 'قمر', threshold: 0.75 },
      platform: 'android',
      appVersion: '2.7.1',
      isRealDevice: true,
      isSimulator: false,
    },
    recordedAt: '2026-06-20T09:25:00.000Z',
    createdAt: '2026-06-20T09:25:01.000Z',
  },
  {
    id: 'a1111111-0000-4000-8000-000000000007',
    childId: CHILD_A,
    sessionId: 'pron-1782121407706-ffffff',
    attemptNumber: 2,
    attemptType: 'word',
    outcome: 'fail',
    isCorrect: false,
    targetLabel: 'قمر',
    targetSentToApi: 'قمر',
    targetDisplay: 'قمر',
    audioStoragePath: `${CHILD_A}/pron-1782121407706-ffffff/2.wav`,
    hasAudio: true,
    modelOutput: {
      result: false,
      similarity: 0.66,
      confidence: 58,
      transcription: 'قمر',
      message: 'Almost!',
      decision_basis: 'similarity',
      decision_threshold: 0.75,
      threshold_param_applied: true,
    },
    clientContext: {
      endpoint: 'https://api.kutuby.com/verify_word',
      httpStatus: 200,
      apiLatencyMs: 845,
      requestPayload: { target_word: 'قمر', threshold: 0.75 },
      platform: 'android',
      appVersion: '2.7.1',
      isRealDevice: true,
      isSimulator: false,
    },
    recordedAt: '2026-06-20T09:25:30.000Z',
    createdAt: '2026-06-20T09:25:31.000Z',
  },
  {
    id: 'a1111111-0000-4000-8000-000000000008',
    childId: CHILD_A,
    sessionId: 'pron-1782121407706-ffffff',
    attemptNumber: 3,
    attemptType: 'word',
    outcome: 'pass',
    isCorrect: true,
    targetLabel: 'قمر',
    targetSentToApi: 'قمر',
    targetDisplay: 'قمر',
    audioStoragePath: `${CHILD_A}/pron-1782121407706-ffffff/3.wav`,
    hasAudio: true,
    modelOutput: {
      result: true,
      similarity: 0.89,
      confidence: 84,
      transcription: 'قمر',
      message: 'Great job!',
      decision_basis: 'similarity',
      decision_threshold: 0.75,
      threshold_param_applied: true,
    },
    clientContext: {
      endpoint: 'https://api.kutuby.com/verify_word',
      httpStatus: 200,
      apiLatencyMs: 902,
      requestPayload: { target_word: 'قمر', threshold: 0.75 },
      platform: 'android',
      appVersion: '2.7.1',
      isRealDevice: true,
      isSimulator: false,
    },
    recordedAt: '2026-06-20T09:26:00.000Z',
    createdAt: '2026-06-20T09:26:01.000Z',
  },
];

/**
 * The full fixture set: four single-attempt sessions (letter pass, letter fail,
 * word pass, error), one single-attempt null-audio fail, and one three-attempt
 * session ending in a pass.
 *
 * Derived totals (asserted by the tests):
 * - attempts: 8; sessions: 6
 * - outcomes: pass 3, fail 4, error 1
 * - attempts with audio: 6 (errorAttempt and nullAudioAttempt have none)
 */
export const allAttempts: readonly Attempt[] = [
  letterPassAttempt,
  letterFailAttempt,
  wordPassAttempt,
  errorAttempt,
  nullAudioAttempt,
  ...multiSessionAttempts,
];
