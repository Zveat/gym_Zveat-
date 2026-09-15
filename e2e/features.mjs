/**
 * End-to-end coverage for the features around the workout loop: notes, pain,
 * body weight, custom exercises, the program editor and manual history entry.
 *
 *   npx next build && node e2e/features.mjs
 */
import {
  assertNoHorizontalOverflow,
  assertReadableText,
  buildXlsx,
  openApp,
  reporter,
  startServer,
  textHelpers,
  VIEWPORTS,
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
  await page.waitForSelector('text=НАЧАТЬ ТРЕНИРОВКУ');
  let body;

  console.log('\nPINNED NOTES');
  await page.goto(`${base}/workout/start`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("НАЧАТЬ ТРЕНИРОВКУ")');
  await page.waitForURL(/\/workout$/);
  await page.click('a:has-text("Жим штанги лежа")');
  await page.waitForSelector('button:has-text("СОХРАНИТЬ ПОДХОД")');
  await page.click('button:has-text("Инфо")');
  await page.click('button:has-text("Заметки")');
  await page.waitForSelector('text=Новая заметка');
  await page.click('button:has-text("Важная")');
  await page.fill('textarea', 'Не увеличивать вес, пока не 12 во всех подходах.');
  await page.click('button:text-is("СОХРАНИТЬ")');
  await page.waitForSelector('text=Важное');
  body = await text();
  check('saves a pinned note', has(body, 'Не увеличивать вес'));

  await page.click('button[aria-label="Закрыть"] >> nth=1');
  await page.waitForSelector('button:has-text("СОХРАНИТЬ ПОДХОД")');
  body = await text();
  check('shows the pinned note on the exercise screen', has(body, 'Важно', 'Не увеличивать вес'));

  console.log('\nOBSERVATIONS DRIVE THE RECOMMENDATION');
  // Close the plan at the rep target, but report pain: pain must win.
  for (let i = 0; i < 4; i += 1) {
    await page.click('button:has-text("СОХРАНИТЬ ПОДХОД")');
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
  await page.waitForSelector('text=Что дальше с весами');
  body = await text();
  check('pain outranks a closed rep target', has(body, 'Лучше снизить', 'боль'));

  console.log('\nACCEPTING A RECOMMENDATION CHANGES THE PLAN, NOT HISTORY');
  await page.goto(`${base}/programs`, { waitUntil: 'networkidle' });
  await page.click('a:has-text("Редактировать")');
  await page.waitForURL(/\/programs\/editor/);
  await page.waitForTimeout(400);
  body = await text();
  check('the plan is untouched by the workout', has(body, '50 кг × 12 × 4'));

  console.log('\nPROGRAM EDITOR');
  await page.click('button:has-text("Настроить") >> nth=0');
  await page.waitForSelector('text=Подходы');
  await page.fill('input[aria-label="Вес, подход 1"]', '55');
  await page.click('button:has-text("ГОТОВО")');
  await page.waitForTimeout(400);
  body = await text();
  check('editing a set weight sticks', has(body, '55 кг × 12 × 4'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  body = await text();
  check('the edit survives a reload', has(body, '55 кг × 12 × 4'));

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
  check('records a body weight entry', has(body, '80.2 кг'));
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
  await page.waitForSelector('text=НАЧАТЬ ТРЕНИРОВКУ');
  body = await text();
  check('surfaces active pain on Home', has(body, 'Активная заметка', 'knee'));

  await page.goto(`${base}/workout/start`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("НАЧАТЬ ТРЕНИРОВКУ")');
  body = await text();
  check('warns before the next workout', has(body, 'Активная заметка', 'LIGHT'));

  await page.goto(`${base}/more/pain`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("БОЛЬШЕ НЕ БОЛИТ")');
  await page.waitForTimeout(400);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=НАЧАТЬ ТРЕНИРОВКУ');
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
  check('prefills the sets from the program', has(body, 'План: 55 кг × 12'));

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
  check('the entered workout lands in history', has(body, 'Внесено вручную'));

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
  await page.click('button:has-text("Легкая")');
  await page.waitForSelector('text=Что изменится');
  body = await text();
  check('an edited mode multiplier is used (55 × 0.8 = 44)', has(body, '44 кг'));

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

  console.log('\nA DATABASE WITH NO PROGRAM REPAIRS ITSELF');
  // A half-finished seed once left an account with exercises but no program,
  // and the app parked on "no active program" with no way back. Deleting the
  // program reproduces that state exactly.
  await page.goto(`${base}/programs`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Ещё")');
  await page.waitForSelector('text=Удалить программу');
  await page.click('button:has-text("Удалить программу")');
  await page.waitForSelector('text=Удалить программу?');
  await page.click('div[role="dialog"] button:has-text("Удалить")');
  await page.waitForTimeout(600);
  body = await text();
  check('the program can be deleted', !has(body, 'СПЛИТ — НАБОР МАССЫ'));

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=НАЧАТЬ ТРЕНИРОВКУ', { timeout: 15_000 });
  body = await text();
  check('a reload restores a usable program', has(body, 'СПЛИТ — НАБОР МАССЫ'));
  check('never parks on "no active program"', !has(body, 'Нет активной программы'));

  await page.goto(`${base}/programs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('a:has-text("Редактировать")');
  await page.waitForTimeout(600);
  body = await text();
  check('the restored program keeps day 1 intact', has(body, '50 кг × 12 × 4', 'Position: 2'));

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

  console.log('\nEVERY SCREEN IS READABLE');
  // A stray unlayered rule in globals.css once beat every Tailwind text-colour
  // utility, so the lime button had white text and no chip showed its selected
  // state. Nothing in the markup shows that — only computed styles do.
  for (const url of screens) {
    await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const unreadable = await assertReadableText(page);
    check(`${url} has readable text`, unreadable === null, unreadable ?? '');
  }

  console.log('\nRUNS AS A HOME-SCREEN APP, NOT IN A BROWSER VIEW');
  // Without `apple-mobile-web-app-capable` iOS opens the home-screen icon in a
  // browser view and keeps the Safari toolbar on screen, which pushes the whole
  // bottom nav ~80pt up off the edge. Next emits only the standardised
  // `mobile-web-app-capable` from `appleWebApp.capable`, so the Apple-prefixed
  // one is added by hand and has to stay added.
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const shell = await page.evaluate(() => {
    const meta = (name) =>
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
    return {
      appleCapable: meta('apple-mobile-web-app-capable'),
      capable: meta('mobile-web-app-capable'),
      statusBar: meta('apple-mobile-web-app-status-bar-style'),
      viewport: meta('viewport'),
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
    };
  });
  check('iOS is told to run it standalone', shell.appleCapable === 'yes', String(shell.appleCapable));
  check('the standardised flag is set too', shell.capable === 'yes', String(shell.capable));
  check('the status bar is drawn through', shell.statusBar === 'black-translucent', String(shell.statusBar));
  check(
    'the viewport covers the safe areas',
    (shell.viewport ?? '').includes('viewport-fit=cover'),
    shell.viewport ?? '',
  );
  check('the manifest is linked', shell.manifest !== null, String(shell.manifest));

  const manifest = await page.evaluate(async (href) => {
    const res = await fetch(href);
    return res.json();
  }, shell.manifest);
  check('the manifest asks for standalone', manifest.display === 'standalone', String(manifest.display));

  // The nav must sit flush against the bottom of the viewport: anything the
  // layout adds below it reads as the bar floating up off the edge.
  const navGap = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    return Math.round(window.innerHeight - nav.getBoundingClientRect().bottom);
  });
  check('the bottom nav is flush with the viewport edge', navGap === 0, `${navGap}px below it`);

  console.log('\nTHE PRIMARY BUTTON CARRIES ITS OWN COLOUR');
  await page.goto(`${base}/more/body-weight`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("ДОБАВИТЬ")');
  const primary = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) =>
      /ДОБАВИТЬ/i.test(b.innerText),
    );
    if (!el) return null;
    const style = getComputedStyle(el);
    return { color: style.color, background: style.backgroundColor, weight: style.fontWeight };
  });
  check('the primary button is lime', primary?.background === 'rgb(182, 255, 59)', primary?.background ?? 'missing');
  check(
    'its label is ink, not white',
    primary?.color === 'rgb(11, 11, 13)',
    `got ${primary?.color ?? 'nothing'}`,
  );
  check('its label keeps its weight', primary?.weight === '600', primary?.weight ?? '');

  // Selected state is carried by colour as well as background; when the text
  // colour silently stopped applying, every option in a row looked identical.
  const goalColours = await page.evaluate(() =>
    ['Набор', 'Поддержание'].map((label) => {
      const el = [...document.querySelectorAll('button')].find(
        (b) => b.innerText.trim() === label,
      );
      return el ? getComputedStyle(el).color : null;
    }),
  );
  check(
    'the selected goal reads differently from the others',
    goalColours[0] !== null && goalColours[0] !== goalColours[1],
    goalColours.join(' vs '),
  );

  await page.goto(`${base}/history/add`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("ЗАПОЛНИТЬ ПОДХОДЫ")');
  await page.click('button:has-text("ЗАПОЛНИТЬ ПОДХОДЫ")');
  await page.waitForSelector('button:has-text("СОХРАНИТЬ В ИСТОРИЮ")');
  const addOverflow = await assertNoHorizontalOverflow(page);
  check('/history/add fits the screen with sets filled in', addOverflow === null, addOverflow ?? '');

  // The spec names both iPhone Pro and Pro Max as test targets; the wider one
  // is where a `max-w` column can leave the layout looking unanchored.
  console.log('\nIPHONE PRO MAX (430×932)');
  await page.setViewportSize(VIEWPORTS.proMax);
  for (const url of ['/', '/workout/start', '/progress', '/more/settings']) {
    await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const wide = await assertNoHorizontalOverflow(page);
    check(`${url} fits Pro Max`, wide === null, wide ?? '');
  }
  // On a phone the column fills the screen; what must hold is the side gutter,
  // so nothing sits against the glass edge.
  const gutter = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return null;
    const style = getComputedStyle(main);
    const box = main.getBoundingClientRect();
    return {
      left: Math.round(box.left + parseFloat(style.paddingLeft)),
      right: Math.round(innerWidth - box.right + parseFloat(style.paddingRight)),
    };
  });
  check(
    'keeps a side gutter on Pro Max',
    gutter !== null && gutter.left >= 12 && gutter.right >= 12,
    JSON.stringify(gutter),
  );

  // Above the column's max width it should centre instead of stretching.
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  const centred = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return null;
    const box = main.getBoundingClientRect();
    return { left: Math.round(box.left), width: Math.round(box.width), vw: innerWidth };
  });
  check(
    'centres the column on a wide screen instead of stretching',
    centred !== null && centred.width <= 520 && centred.left > 100,
    JSON.stringify(centred),
  );
  await page.setViewportSize(VIEWPORTS.pro);

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
