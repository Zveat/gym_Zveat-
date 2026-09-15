/**
 * End-to-end coverage for the features around the workout loop: notes, pain,
 * body weight, custom exercises, the program editor and manual history entry.
 *
 *   npx next build && node e2e/features.mjs
 */
import {
  assertNoHorizontalOverflow,
  buildXlsx,
  openApp,
  reporter,
  startServer,
  textHelpers,
} from './harness.mjs';

const PORT = Number(process.env.SMOKE_PORT ?? 4320);

/** A real .xlsx (ZIP + deflate), built here so the test needs no fixture file. */
const XLSX_FIXTURE = buildXlsx([
  ['Date', 'Exercise', 'Weight', 'Reps'],
  ['46235', 'Жим штанги лежа', '50', '12'],
  ['46235', 'Жим штанги лежа', '50', '12'],
]);

async function main() {
  const external = process.env.SMOKE_BASE_URL;
  const server = external ? null : await startServer(PORT);
  const base = external ?? `http://localhost:${PORT}`;
  const { browser, page, consoleErrors } = await openApp(base);
  const { text, has } = textHelpers(page);
  const { check, finish } = reporter();
  await page.waitForSelector('text=START WORKOUT');
  let body;

  console.log('\nPINNED NOTES');
  await page.goto(`${base}/workout/start`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("START WORKOUT")');
  await page.waitForURL(/\/workout$/);
  await page.click('a:has-text("Жим штанги лежа")');
  await page.waitForSelector('button:has-text("COMPLETE SET")');
  await page.click('button:has-text("Инфо")');
  await page.click('button:has-text("Заметки")');
  await page.waitForSelector('text=Новая заметка');
  await page.click('button:has-text("Важная")');
  await page.fill('textarea', 'Не увеличивать вес, пока не 12 во всех подходах.');
  await page.click('button:has-text("СОХРАНИТЬ")');
  await page.waitForSelector('text=Важное');
  body = await text();
  check('saves a pinned note', has(body, 'Не увеличивать вес'));

  await page.click('button[aria-label="Закрыть"] >> nth=1');
  await page.waitForSelector('button:has-text("COMPLETE SET")');
  body = await text();
  check('shows the pinned note on the exercise screen', has(body, 'Важно', 'Не увеличивать вес'));

  console.log('\nOBSERVATIONS DRIVE THE RECOMMENDATION');
  // Close the plan at the rep target, but report pain: pain must win.
  for (let i = 0; i < 4; i += 1) {
    await page.click('button:has-text("COMPLETE SET")');
    const skip = page.locator('button:text-is("ПРОПУСТИТЬ")');
    if (await skip.count()) await skip.click();
    await page.waitForTimeout(200);
  }
  await page.click('button:has-text("Боль")');
  await page.waitForTimeout(200);
  body = await text();
  check('marks the observation as selected', has(body, 'Боль'));

  await page.click('a[aria-label="К списку упражнений"]');
  await page.waitForURL(/\/workout$/);
  await page.click('button:has-text("ЗАВЕРШИТЬ ТРЕНИРОВКУ")');
  await page.waitForSelector('text=Завершить тренировку?');
  await page.click('div[role="dialog"] button:has-text("Завершить")');
  await page.waitForURL(/\/workout\/review/);
  await page.waitForSelector('text=Progression review');
  body = await text();
  check('pain outranks a closed rep target', has(body, 'Лучше снизить', 'боль'));

  console.log('\nACCEPTING A RECOMMENDATION CHANGES THE PLAN, NOT HISTORY');
  await page.goto(`${base}/programs`, { waitUntil: 'networkidle' });
  await page.click('a:has-text("Редактировать")');
  await page.waitForURL(/\/programs\/editor/);
  await page.waitForTimeout(400);
  body = await text();
  check('the plan is untouched by the workout', has(body, '50 kg × 12 × 4'));

  console.log('\nPROGRAM EDITOR');
  await page.click('button:has-text("Настроить") >> nth=0');
  await page.waitForSelector('text=Подходы');
  await page.fill('input[aria-label="Вес, подход 1"]', '55');
  await page.click('button:has-text("ГОТОВО")');
  await page.waitForTimeout(400);
  body = await text();
  check('editing a set weight sticks', has(body, '55 kg × 12 × 4'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  body = await text();
  check('the edit survives a reload', has(body, '55 kg × 12 × 4'));

  await page.click('button:has-text("+ день")');
  await page.waitForTimeout(400);
  body = await text();
  check('adds a training day', has(body, 'DAY 6', 'Новый день'));
  check('a new day starts empty', has(body, 'В этом дне пока нет упражнений'));

  await page.click('button:has-text("ДОБАВИТЬ УПРАЖНЕНИЕ")');
  await page.waitForSelector('text=Добавить упражнение');
  await page.fill('input[placeholder="Поиск по названию"]', 'ногами');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Жим ногами")');
  await page.waitForTimeout(400);
  body = await text();
  check('adds an exercise from the library', has(body, 'Жим ногами'));

  console.log('\nCUSTOM EXERCISE');
  await page.goto(`${base}/more/exercises`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="Поиск"]');
  await page.click('button[aria-label="Добавить"], header button');
  await page.waitForSelector('text=Новое упражнение');
  await page.fill('input[placeholder="Тяга верхнего блока — тренажёр №2"]', 'Тяга блока — тренажёр №2');
  await page.fill('textarea', 'Рукоятки на уровне груди\nЛопатки вниз');
  await page.click('button:has-text("СОЗДАТЬ")');
  await page.waitForTimeout(500);
  body = await text();
  check('creates a custom exercise', has(body, 'Тяга блока — тренажёр №2'));
  check('marks it as custom', has(body, 'Своё'));

  console.log('\nBODY WEIGHT');
  await page.goto(`${base}/more/body-weight`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("ДОБАВИТЬ")');
  await page.fill('input[placeholder="80.2"]', '80.2');
  await page.click('button:has-text("ДОБАВИТЬ")');
  await page.waitForTimeout(400);
  body = await text();
  check('records a body weight entry', has(body, '80.2 kg'));
  check('offers bulk / maintain / cut', has(body, 'Набор', 'Поддержание', 'Сушка'));

  console.log('\nPAIN TRACKING');
  await page.goto(`${base}/more/pain`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Новая отметка');
  await page.click('button:has-text("Колено")');
  await page.click('button[aria-label="4 из 10"]');
  await page.fill('textarea', 'Тянет при жиме ногами.');
  await page.click('button:has-text("СОХРАНИТЬ")');
  await page.waitForSelector('text=Активные');
  body = await text();
  check('logs pain with a severity', has(body, 'Колено', '4/10'));

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=START WORKOUT');
  body = await text();
  check('surfaces active pain on Home', has(body, 'Активная заметка', 'knee'));

  await page.goto(`${base}/workout/start`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("START WORKOUT")');
  body = await text();
  check('warns before the next workout', has(body, 'Активная заметка', 'LIGHT'));

  await page.goto(`${base}/more/pain`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("БОЛЬШЕ НЕ БОЛИТ")');
  await page.waitForTimeout(400);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=START WORKOUT');
  body = await text();
  check('a resolved entry stops warning', !has(body, 'Активная заметка'));

  console.log('\nCHECK-IN');
  await page.goto(`${base}/workout/start`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Заполнить")');
  await page.waitForSelector('text=Сон');
  await page.click('button[aria-pressed="false"] >> nth=0');
  await page.waitForTimeout(200);
  body = await text();
  check('offers the optional condition check-in', has(body, 'Сон', 'Энергия', 'Усталость'));

  console.log('\nMANUAL HISTORY ENTRY');
  await page.goto(`${base}/history/add`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("ЗАПОЛНИТЬ ПОДХОДЫ")');
  await page.fill('input[type="date"]', '2026-09-01');
  await page.click('button:has-text("ЗАПОЛНИТЬ ПОДХОДЫ")');
  await page.waitForSelector('button:has-text("СОХРАНИТЬ В ИСТОРИЮ")');
  body = await text();
  check('prefills the sets from the program', has(body, 'План: 55 kg × 12'));

  const saveButton = page.locator('button:has-text("СОХРАНИТЬ В ИСТОРИЮ")');
  // The button sits at the very bottom of a long form: settle the scroll
  // before clicking, or the hit test races the layout.
  await saveButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await saveButton.click();
  await page.waitForSelector('text=Тренировка внесена');
  await page.goto(`${base}/history`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  body = await text();
  check('the entered workout lands in history', has(body, 'Импорт'));

  console.log('\nRECORDS & SETTINGS');
  await page.goto(`${base}/records`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  body = await text();
  check('records exist after two sessions', has(body, 'Жим штанги лежа'));
  check('explains what "best" means', has(body, 'Эпли'));

  await page.goto(`${base}/more/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Режимы тренировок');
  await page.fill('input[value="85"]', '80');
  await page.waitForTimeout(400);
  await page.goto(`${base}/workout/start`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Light")');
  await page.waitForSelector('text=Что изменится');
  body = await text();
  check('an edited mode multiplier is used (55 × 0.8 = 44)', has(body, '44 kg'));

  console.log('\nBACKUP');
  await page.goto(`${base}/more/settings`, { waitUntil: 'networkidle' });
  const download = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
  await page.click('button:has-text("Сохранить резервную копию")');
  const file = await download;
  check('exports a backup file', file !== null && /gym-os-backup-.*\.json/.test(file?.suggestedFilename() ?? ''));

  console.log('\nMUSCLE GROUP HEADING IS EDITABLE');
  await page.goto(`${base}/programs`, { waitUntil: 'networkidle' });
  await page.click('a:has-text("Редактировать")');
  await page.waitForURL(/\/programs\/editor/);
  await page.waitForTimeout(400);
  await page.click('button:has-text("Настроить") >> nth=0');
  await page.waitForSelector('text=Группа мышц');
  await page.fill('input[placeholder="Например: ГРУДЬ"]', 'ЖИМЫ');
  await page.click('button:has-text("ГОТОВО")');
  await page.waitForTimeout(500);
  body = await text();
  check('the section heading can be renamed', has(body, 'ЖИМЫ'));

  console.log('\nPHOTO OF THE USER\'S OWN MACHINE');
  await page.goto(`${base}/more/exercises`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="Поиск"]');
  await page.click('header button');
  await page.waitForSelector('text=Фото тренажёра');
  body = await text();
  check('the exercise form offers a photo picker', has(body, 'Выбрать фото', 'Или ссылка'));

  // A 2000x1200 PNG stands in for a phone photo: it must be downscaled to
  // 1280 on the long edge and stored as a JPEG data URL.
  await page.setInputFiles('input[type="file"][accept="image/*"]', {
    name: 'machine.png',
    mimeType: 'image/png',
    buffer: await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2000;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#b6ff3b';
      ctx.fillRect(0, 0, 2000, 1200);
      ctx.fillStyle = '#0b0b0d';
      ctx.fillRect(100, 100, 600, 400);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }).then((bytes) => Buffer.from(bytes)),
  });
  await page.waitForSelector('text=Сохранено:', { timeout: 15_000 });
  body = await text();
  check('downscales the photo to the long-edge cap', has(body, '1280×768'));
  check('reports the stored size', /СОХРАНЕНО: 1280×768, \d+ КБ/.test(body));

  await page.fill('input[placeholder="Тяга верхнего блока — тренажёр №2"]', 'Тяга блока — тренажёр №3');
  await page.click('button:has-text("СОЗДАТЬ")');
  await page.waitForTimeout(600);
  const storedPhoto = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')].find((i) => i.src.startsWith('data:image/jpeg'));
    return img ? img.src.length : 0;
  });
  await page.goto(`${base}/more/exercises`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('button:has-text("Тяга блока — тренажёр №3")');
  await page.waitForSelector('text=Фото тренажёра');
  const persisted = await page.evaluate(
    () => !![...document.querySelectorAll('img')].find((i) => i.src.startsWith('data:image/jpeg')),
  );
  check('the photo survives a reload as a jpeg', persisted, `stored length ${storedPhoto}`);

  console.log('\nEXCEL IMPORT');
  await page.goto(`${base}/more/import`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("ВЫБРАТЬ ФАЙЛ")');
  await page.setInputFiles('input[type="file"]', {
    name: 'history.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX_FIXTURE,
  });
  await page.waitForSelector('text=Загружен:');
  body = await text();
  check('loads an xlsx file', has(body, 'history.xlsx'));
  await page.click('button:has-text("РАЗОБРАТЬ")');
  await page.waitForSelector('text=Предпросмотр');
  body = await text();
  check('reads the excel rows', has(body, 'Жим штанги лежа', '50×12'));
  // The parsed date lands in a date input, whose value is not page text.
  const parsedDate = await page.locator('input[type="date"]').first().inputValue();
  check('converts the excel date serial 46235 to 2026-08-01', parsedDate === '2026-08-01', parsedDate);
  await page.click('button:text-is("ИМПОРТИРОВАТЬ")');
  await page.waitForSelector('text=Импорт завершён');
  body = await text();
  check('imports from excel', has(body, 'Добавлено тренировок: 1'));

  console.log('\nNO HORIZONTAL OVERFLOW ON ANY SCREEN');
  // Includes the manual-entry form in its filled state, where a full-width
  // class on a shrink-0 field once pushed the row past the screen.
  const screens = [
    '/',
    '/programs',
    '/programs/new',
    '/progress',
    '/progress/exercise',
    '/history',
    '/records',
    '/more',
    '/more/settings',
    '/more/exercises',
    '/more/import',
    '/more/body-weight',
    '/more/pain',
    '/workout/start',
  ];
  for (const url of screens) {
    await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const overflow = await assertNoHorizontalOverflow(page);
    check(`${url} fits the screen`, overflow === null, overflow ?? '');
  }

  await page.goto(`${base}/history/add`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("ЗАПОЛНИТЬ ПОДХОДЫ")');
  await page.click('button:has-text("ЗАПОЛНИТЬ ПОДХОДЫ")');
  await page.waitForSelector('button:has-text("СОХРАНИТЬ В ИСТОРИЮ")');
  const addOverflow = await assertNoHorizontalOverflow(page);
  check('/history/add fits the screen with sets filled in', addOverflow === null, addOverflow ?? '');

  console.log('\nCONSOLE');
  const real = consoleErrors.filter((e) => !/favicon|manifest|Failed to load resource/i.test(e));
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  server?.close();
  finish();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
