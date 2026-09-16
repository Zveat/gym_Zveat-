/**
 * End-to-end smoke test: drives the built app in a real browser through the
 * path that matters — open, start a workout, complete sets, finish, review.
 *
 * Needs a `next build` output in ./out and Playwright available:
 *   npx next build && node e2e/smoke.mjs
 *
 * Set SMOKE_BASE_URL to test against an already-running server.
 */
import { assertReadableText, openApp, reporter, startServer, textHelpers } from './harness.mjs';

const PORT = Number(process.env.SMOKE_PORT ?? 4319);

async function main() {
  const external = process.env.SMOKE_BASE_URL;
  const server = external ? null : await startServer(PORT);
  const base = external ?? `http://localhost:${PORT}`;
  const { browser, context, page, consoleErrors } = await openApp(base);
  const { text, has } = textHelpers(page);
  const { check, finish } = reporter();

  console.log('\nHOME');
  await page.waitForSelector('text=НАЧАТЬ ТРЕНИРОВКУ', { timeout: 15_000 });
  let body = await text();
  check('greets the user', /ДОБР(ОЕ УТРО|ЫЙ ДЕНЬ|ЫЙ ВЕЧЕР|ОЙ НОЧИ), ZVEAT/.test(body), body.slice(0, 80));
  check('shows the preloaded program', has(body, 'СПЛИТ — НАБОР МАССЫ'));
  check('offers a next workout day', /DAY [1-5]/.test(body));
  check('counts exercises and sets', /\d+ УПРАЖНЕНИ\S* · \d+ РАБОЧ\S* ПОДХОД\S*/.test(body));

  console.log('\nSTART WORKOUT');
  await page.click('text=НАЧАТЬ ТРЕНИРОВКУ');
  await page.waitForURL(/\/workout\/start/);
  body = await text();
  check('lists all five training days', (body.match(/DAY [1-5]/g) ?? []).length >= 5);
  check('offers all four modes', has(body, 'Обычная', 'Легкая', 'Тяжелая', 'Восстановление'));

  console.log('\nLIGHT MODE PREVIEW');
  await page.click('button:has-text("Легкая")');
  await page.waitForSelector('text=Что изменится');
  body = await text();
  // 50 kg at 85% = 42.5, and one set fewer: exactly the spec's preview.
  check('previews the light-mode weight (50 → 42.5)', has(body, '42.5 кг'));
  check('previews fewer sets', /50 КГ × 12 × 4[\s\S]*42\.5 КГ × 12 × 3/.test(body));

  console.log('\nACTIVE WORKOUT (normal)');
  await page.click('button:has-text("Обычная")');
  await page.click('button:has-text("НАЧАТЬ ТРЕНИРОВКУ")');
  await page.waitForURL(/\/workout$/);
  await page.waitForSelector('text=подходов · упражнений');
  body = await text();
  check('shows the workout clock', /\d\d:\d\d/.test(body));
  check('lists day 1 exercises', has(body, 'Жим штанги лежа', 'Разводка в тренажере'));
  check('marks the current exercise', has(body, 'Сейчас'));
  // §3: счётчик подходов рядом с упражнениями — «8 / 28» конкретнее, чем
  // «выполнено 2 из 7»: человек между подходами думает подходами.
  check('starts at zero progress', has(body, '0 / 21 подходов', 'упражнений 0 из 5'), body.slice(0, 160));
  check('hides the bottom nav during a workout', (await page.locator('nav a:has-text("Programs")').count()) === 0);

  console.log('\nEXERCISE SCREEN');
  await page.click('a:has-text("Жим штанги лежа")');
  await page.waitForURL(/\/workout\/exercise/);
  await page.waitForSelector('text=СОХРАНИТЬ ПОДХОД');
  body = await text();
  // Номер подхода и план — одной строкой: раньше это были три строки подряд,
  // и они съедали место у веса, который должен быть главным объектом экрана.
  check('shows the set number and the plan in one line', has(body, 'Подход 1 · план 50 кг × 12'), body.slice(0, 160));
  check('offers the exercise detail sheet', has(body, 'Инфо'));
  check('shows "first time" with no history', has(body, 'Первый раз'));
  check('offers the difficulty picker', has(body, 'ЛЕГКО', 'НОРМА', 'ТЯЖЕЛО', 'ОТКАЗ'));

  await page.click('button:has-text("Инфо")');
  await page.waitForSelector('text=Ключевые моменты');
  body = await text();
  check('inherits technique from the library', has(body, 'Лопатки сведены'));
  check('shows the machine settings tab content', has(body, 'Техника', 'Заметки', 'История'));
  await page.click('button[aria-label="Закрыть"] >> nth=1');
  await page.waitForSelector('button:has-text("СОХРАНИТЬ ПОДХОД")');

  console.log('\nCOMPLETE A SET');
  await page.click('button[aria-label="Плюс 2.5"]'); // 50 -> 52.5
  await page.click('button:has-text("НОРМА")');
  await page.click('button:has-text("СОХРАНИТЬ ПОДХОД")');
  await page.waitForSelector('button:text-is("+15 СЕК")', { timeout: 5000 });
  body = await text();
  check('starts the rest timer automatically', has(body, 'Отдых'));
  check('counts the rest down from the exercise rest time', /0[12]:\d\d/.test(body));
  // §5: подрезать и удлинять одинаково быстро, плюс готовые длительности —
  // менять отдых под упражнение, не уходя в настройки.
  check('offers minus and plus fifteen', has(body, '−15 СЕК', '+15 СЕК'));
  check('offers the rest presets', has(body, '60 с', '90 с', '120 с', '180 с'));
  check('offers skip', has(body, 'ПРОПУСТИТЬ'));

  // Готовое значение ставит отсчёт заново от этого момента.
  await page.click('button:has-text("120 с")');
  await page.waitForTimeout(250);
  body = await text();
  check('a preset restarts the countdown at that length', /01:5\d|02:0[01]/.test(body), body.match(/0\d:\d\d/)?.[0] ?? '');

  await page.click('button:text-is("ПРОПУСТИТЬ")');
  await page.waitForSelector('button:has-text("СОХРАНИТЬ ПОДХОД")');
  body = await text();
  check('records the actual weight, not the plan', has(body, '52.5 × 12'));
  check('moves on to set 2', has(body, 'Подход 2 · план'), body.slice(0, 140));

  // ГЛАВНАЯ МЕТРИКА ТЗ: сколько действий на обычный подход. Цель — один тап,
  // и всё ломалось здесь: следующий подход заполнялся из ПЛАНА, поэтому
  // поставленные 52.5 кг возвращались к 50 и вес приходилось выставлять заново
  // на каждом подходе. Проверяем сам счётчик, а не текст истории.
  const stepper = await page.evaluate(() =>
    [...document.querySelectorAll('span')]
      .filter((el) => /^\d+(\.\d+)?$/.test(el.innerText.trim()) && parseFloat(getComputedStyle(el).fontSize) > 40)
      .map((el) => el.innerText.trim())
      .slice(0, 2),
  );
  check('set 2 opens with what was actually lifted, not the plan', stepper[0] === '52.5', stepper.join(' × '));

  // Экран прокручивается почти на два окна, поэтому главный тап обязан
  // оставаться под пальцем: раньше кнопка уезжала вместе с содержимым.
  const sticky = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const save = [...document.querySelectorAll('button')].find((b) => /СОХРАНИТЬ ПОДХОД/.test(b.innerText));
    if (!save) return null;
    const box = save.getBoundingClientRect();
    return { inView: box.bottom <= window.innerHeight + 1, fixed: getComputedStyle(save.closest('div[class*=fixed]') ?? save).position };
  });
  check('the save button stays put when the screen is scrolled', sticky?.inView === true && sticky.fixed === 'fixed', JSON.stringify(sticky));
  await page.evaluate(() => window.scrollTo(0, 0));

  // The screen the user actually stares at between sets, with real numbers on
  // it. Checked here rather than on an empty screen because the set history,
  // the plan line and the logged weight only exist once a set is done.
  const setUnreadable = await assertReadableText(page);
  check('every number on the exercise screen is readable', setUnreadable === null, setUnreadable ?? '');

  console.log('\nFINISH THE EXERCISE');
  for (let i = 0; i < 3; i += 1) {
    await page.click('button:has-text("СОХРАНИТЬ ПОДХОД")');
    const skip = page.locator('button:text-is("ПРОПУСТИТЬ")');
    if (await skip.count()) await skip.click();
    await page.waitForTimeout(200);
  }
  body = await text();
  check('completes every set in the plan', has(body, 'Все подходы выполнены'));
  // With sets done, "next exercise" becomes the primary action.
  check(
    'promotes moving on once the exercise is done',
    await page.locator('button:has-text("ДАЛЕЕ")').first().evaluate((el) => el.className.includes('bg-accent')),
  );

  await page.click('a[aria-label="К списку упражнений"]');
  await page.waitForURL(/\/workout$/);
  body = await text();
  check('workout progress reflects the finished exercise', has(body, 'упражнений 1 из 5'));

  console.log('\nRELOAD MID-WORKOUT');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=подходов · упражнений');
  body = await text();
  check('a live workout survives a reload', has(body, 'упражнений 1 из 5'));

  console.log('\nFINISH THE WORKOUT');
  await page.click('button:has-text("ЗАВЕРШИТЬ ТРЕНИРОВКУ")');
  await page.waitForSelector('text=Завершить тренировку?');
  await page.click('div[role="dialog"] button:has-text("Завершить")');
  await page.waitForURL(/\/workout\/review/);
  await page.waitForSelector('text=Что дальше с весами');
  body = await text();
  check('summarises the workout', has(body, 'Длительность', 'Рабочих подходов'));
  check(
    'recommends a weight change for the exercise trained',
    /МОЖНО ПРИБАВИТЬ|ДЕРЖИМ ВЕС|ЛУЧШЕ СНИЗИТЬ/.test(body),
  );
  check('offers accept / edit / ignore', has(body, 'ПРИНЯТЬ', 'ИЗМЕНИТЬ', 'ОСТАВИТЬ'));

  // §39: итоги — это не «готово», а цифры. §44: вес тела предлагается, но не
  // требуется — «Пропустить» должно быть рядом, иначе это уже принуждение.
  check(
    'the summary counts exercises, sets, volume and difficulty',
    has(body, 'Упражнений', 'Рабочих подходов', 'Объём', 'Средняя тяжесть', 'Новых рекордов'),
    body.slice(0, 200),
  );
  check('it offers body weight without insisting', has(body, 'Вес тела сегодня?', 'ПРОПУСТИТЬ'));
  const reviewUnreadable = await assertReadableText(page);
  check('the review screen is readable', reviewUnreadable === null, reviewUnreadable ?? '');

  console.log('\nHISTORY');
  await page.goto(`${base}/history`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=История');
  body = await text();
  check('lists the finished workout', has(body, 'ГРУДЬ + ТРИЦЕПС'));
  check('shows the mode badge', has(body, 'ОБЫЧНАЯ'));

  await page.click('a:has-text("ГРУДЬ + ТРИЦЕПС")');
  await page.waitForURL(/\/history\/session/);
  body = await text();
  check('workout summary shows the sets performed', has(body, '52.5 × 12'));
  check('keeps untouched exercises visible as skipped', has(body, 'Пропущено'));

  console.log('\nPROGRESS');
  await page.goto(`${base}/progress`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Сводка');
  body = await text();
  check('overview counts the workout', /ТРЕНИРОВОК[\s\S]{0,12}1/.test(body));
  check('reports total volume', has(body, 'Всего поднято'));
  check('breaks volume down by muscle group', has(body, 'Грудь', 'Трицепс'));

  console.log('\nPROGRAMS');
  await page.goto(`${base}/programs`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Программы');
  body = await text();
  check('shows the active program', has(body, 'Активная', 'СПЛИТ — НАБОР МАССЫ'));
  check('counts days, exercises and sets', /5 ДНЕЙ · \d+ УПРАЖНЕНИ\S* · \d+ ПОДХОД\S*/.test(body));

  await page.click('a:has-text("Редактировать")');
  await page.waitForURL(/\/programs\/editor/);
  body = await text();
  check('editor opens on day 1', has(body, 'ГРУДЬ + ТРИЦЕПС'));
  check('shows the prescribed sets', has(body, '50 кг × 12 × 4'));
  check('shows machine settings from the program', has(body, 'Position: 2'));

  console.log('\nIMPORT');
  await page.goto(`${base}/more/import`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=ПРИМЕР');
  await page.click('button:has-text("ПРИМЕР")');
  await page.click('button:has-text("РАЗОБРАТЬ")');
  await page.waitForSelector('text=Предпросмотр');
  body = await text();
  check('parses the pasted notes', has(body, 'Предпросмотр'));
  check('matches exercises to the library', has(body, 'Жим штанги лежа'));
  check('shows the parsed sets', has(body, '50×12'));

  await page.click('button:text-is("ИМПОРТИРОВАТЬ")');
  await page.waitForSelector('text=Импорт завершён');
  body = await text();
  check('imports the workouts', has(body, 'Добавлено тренировок: 1'));

  console.log('\nOFFLINE');
  await context.setOffline(true);
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForSelector('text=НАЧАТЬ ТРЕНИРОВКУ', { timeout: 15_000 }).catch(() => undefined);
  body = await text().catch(() => '');
  check('the app opens with no network', has(body, 'НАЧАТЬ ТРЕНИРОВКУ'), body.slice(0, 120));
  check('data survives offline', has(body, 'СПЛИТ — НАБОР МАССЫ'));
  await context.setOffline(false);

  console.log('\nCONSOLE');
  const real = consoleErrors.filter(
    (e) => !/favicon|manifest|Failed to load resource/i.test(e),
  );
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  server?.close();
  finish();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
