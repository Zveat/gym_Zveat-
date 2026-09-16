import { describe, expect, it } from 'vitest';
import { pauseClock, resetClock, resumeClock, workoutElapsedSeconds } from './session';
import type { WorkoutSession } from '@/domain/types';

/**
 * Часы тренировки считаются от отметок времени, а не тикающим счётчиком.
 *
 * Тренировка длится час, и за это время экран блокируется, приложение
 * сворачивается, страница перезагружается. Счётчик после каждого такого
 * события врёт, и проверить это в браузере без ожидания реального времени
 * нельзя — поэтому арифметика проверяется здесь.
 */
const at = (ms: number) => new Date(ms).toISOString();
const START = Date.parse('2026-09-16T09:00:00.000Z');
const session = (patch: Partial<WorkoutSession> = {}) =>
  ({ startedAt: at(START), ...patch }) as WorkoutSession;

describe('часы тренировки', () => {
  it('идут от начала тренировки', () => {
    expect(workoutElapsedSeconds(session(), START + 61_000)).toBe(61);
  });

  it('не уходят в минус при часах, съехавших назад', () => {
    // Переход на зимнее время, правка часов вручную — время может «вернуться».
    expect(workoutElapsedSeconds(session(), START - 5_000)).toBe(0);
  });

  it('на паузе замирают на моменте её начала', () => {
    const paused = pauseClock(session(), at(START + 30_000));
    // Проходит ещё минута реального времени — число не меняется.
    expect(workoutElapsedSeconds(paused, START + 90_000)).toBe(30);
    expect(workoutElapsedSeconds(paused, START + 600_000)).toBe(30);
  });

  it('после снятия с паузы не учитывают простой', () => {
    let s = pauseClock(session(), at(START + 30_000));
    s = resumeClock(s, at(START + 90_000)); // минута простоя
    expect(workoutElapsedSeconds(s, START + 120_000)).toBe(60);
  });

  it('копят несколько пауз', () => {
    let s = pauseClock(session(), at(START + 10_000));
    s = resumeClock(s, at(START + 40_000)); // 30 с простоя
    s = pauseClock(s, at(START + 50_000));
    s = resumeClock(s, at(START + 70_000)); // ещё 20 с
    expect(workoutElapsedSeconds(s, START + 100_000)).toBe(50);
  });

  it('повторная пауза не сдвигает точку отсчёта', () => {
    const once = pauseClock(session(), at(START + 30_000));
    const twice = pauseClock(once, at(START + 90_000));
    expect(twice.clockPausedAt).toBe(once.clockPausedAt);
  });

  it('снятие с паузы, когда её не было, ничего не меняет', () => {
    const s = session();
    expect(resumeClock(s, at(START + 10_000))).toBe(s);
  });

  it('обнуление трогает только время, не подходы', () => {
    const s = session({ exercises: [{ id: 'e1' }] } as Partial<WorkoutSession>);
    const reset = resetClock(s, at(START + 600_000));
    expect(workoutElapsedSeconds(reset, START + 600_000)).toBe(0);
    expect(reset.exercises).toBe(s.exercises);
  });

  it('обнуление снимает и накопленную паузу', () => {
    let s = pauseClock(session(), at(START + 10_000));
    s = resumeClock(s, at(START + 40_000));
    const reset = resetClock(s, at(START + 60_000));
    expect(reset.clockPausedMs).toBe(0);
    expect(reset.clockPausedAt).toBeNull();
  });
});
