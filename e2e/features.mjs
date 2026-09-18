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
  const exerciseUrl = page.url();
  for (let i = 0; i < 4; i += 1) {
    await page.click('button:has-text("СОХРАНИТЬ ПОДХОД")');
    const skip = page.locator('button:text-is("ПРОПУСТИТЬ")');
    if (await skip.count()) await skip.click();
    await page.waitForTimeout(200);
  }

  // §37: закрыт последний подход — приложение само уходит на следующее
  // упражнение. Проверяем это здесь же, раз оно всё равно происходит, и
  // возвращаемся, потому что дальше нужна отметка именно на этом упражнении.
  await page.waitForTimeout(1200);
  check('the last set hands over to the next exercise on its own', page.url() !== exerciseUrl, page.url());
  await page.goto(exerciseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Боль")');

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

  console.log('\nWORKOUT CLOCK AND THE ACTIONS MENU');
  // §Таймер: пауза и завершение нужны прямо из тренировки, а не с отдельного
  // экрана. §18: редкие действия — в одном меню, чтобы не занимать экран и
  // при этом быть доступными без прокрутки.
  // Предыдущий раздел тренировку завершил, поэтому начинаем новую: часы и
  // меню существуют только внутри живой тренировки.
  await page.goto(`${base}/workout/start`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("НАЧАТЬ ТРЕНИРОВКУ")');
  await page.waitForURL(/\/workout$/);
  await page.waitForSelector('button[aria-label="Часы тренировки"]');
  await page.click('button[aria-label="Часы тренировки"]');
  await page.waitForSelector('text=Часы тренировки');
  body = await text();
  check('the clock opens pause / reset / finish', has(body, 'ПАУЗА', 'ОБНУЛИТЬ ЧАСЫ', 'ЗАВЕРШИТЬ ТРЕНИРОВКУ'));

  await page.click('button:has-text("ПАУЗА")');
  await page.waitForTimeout(300);
  body = await text();
  check('pausing is visible in the header', /пауза/i.test(body), body.slice(0, 80));

  // На паузе часы стоят: два замера с интервалом дают одно и то же число.
  const readClock = () => page.locator('button[aria-label="Часы тренировки"]').innerText();
  const first = await readClock();
  await page.waitForTimeout(1400);
  check('a paused clock does not advance', (await readClock()) === first, `${first} → ${await readClock()}`);

  await page.click('button[aria-label="Часы тренировки"]');
  await page.waitForSelector('button:has-text("ПРОДОЛЖИТЬ")');
  await page.click('button:has-text("ПРОДОЛЖИТЬ")');
  await page.waitForTimeout(300);
  check('resuming clears the paused marker', !/пауза/i.test(await text()));

  await page.locator('a:has-text("Жим штанги лежа")').first().click();
  await page.waitForURL(/\/workout\/exercise/);
  await page.click('button[aria-label="Действия с упражнением"]');
  await page.waitForTimeout(250);
  body = await text();
  check(
    'the menu gathers the rare actions',
    has(body, 'Добавить подход', 'Заметка к упражнению', 'Прошлый результат', 'Пропустить упражнение'),
    body.slice(0, 120),
  );

  // §23: пропуск меняет то, что уйдёт в историю, поэтому подтверждается.
  // Строго внутри шита: тот же текст есть и на самом экране под сгибом, и
  // Playwright брал ту кнопку, перекрытую подложкой.
  await page.click('div[role="dialog"] >> text=Пропустить упражнение');
  await page.waitForSelector('text=Пропустить Жим штанги лежа?');
  check('skipping asks first', true);
  await page.click('div[role="dialog"] button:has-text("Отмена")');
  await page.waitForTimeout(200);
  check('cancelling leaves the exercise alone', !/Вернуть в тренировку/i.test(await text()));

  // §58: режим меняется на ходу, но выполненные подходы остаются как были —
  // это главное, что здесь может сломаться.
  //
  // Сначала нужен ЗАПИСАННЫЙ подход, иначе проверять нечего: делаем один на
  // весе, отличном от плана (52.5 против 50), чтобы его нельзя было спутать с
  // пересчитанным планом.
  //
  // Возвращаемся к списку явно: предыдущая проверка оставила нас на экране
  // упражнения, где ссылок на упражнения нет.
  await page.goto(`${base}/workout`, { waitUntil: 'networkidle' });
  await page.locator('a:has-text("Жим штанги лежа")').first().click();
  await page.waitForURL(/\/workout\/exercise/);
  await page.waitForSelector('button[aria-label="Плюс 2.5"]');
  await page.click('button[aria-label="Плюс 2.5"]');
  await page.click('button:has-text("СОХРАНИТЬ ПОДХОД")');
  await page.waitForTimeout(400);
  const skipRest = page.locator('button:text-is("ПРОПУСТИТЬ")');
  if (await skipRest.count()) await skipRest.click();
  await page.waitForTimeout(300);
  check('a set is recorded above the planned weight', has(await text(), '52.5'), (await text()).slice(0, 140));

  await page.goto(`${base}/workout`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button[aria-label="Режим тренировки"]');
  await page.click('button[aria-label="Режим тренировки"]');
  await page.waitForSelector('text=Режим тренировки');
  body = await text();
  check('the mode sheet explains what gets recalculated', /только у подходов, которых ещё не было/i.test(body));

  await page.click('div[role="dialog"] >> text=ЛЕГКАЯ');
  await page.waitForTimeout(400);
  body = await text();
  check('the header shows the new mode', has(body, 'ЛЕГКАЯ'), body.slice(0, 100));

  await page.locator('a:has-text("Жим штанги лежа")').first().click();
  await page.waitForURL(/\/workout\/exercise/);
  await page.waitForTimeout(400);
  body = await text();
  // Записанный подход остался, а план следующего пересчитался на 42.5.
  check('the recorded set survives a mode change', has(body, '52.5'), body.slice(0, 220));
  check('the pending set picks up the lighter plan', has(body, '42.5'), body.slice(0, 220));

  // §47: на экране тренировки часы тикают раз в секунду. Пока тикер стоял в
  // компоненте экрана, каждую секунду перерисовывались все карточки
  // упражнений — замер показывал 20 перерисовок за 4 секунды простоя. Часы
  // вынесены в свой компонент; здесь проверяется, что за секунду простоя
  // меняется ровно одно место в DOM, а не дерево.
  console.log('\nIDLE COSTS ALMOST NOTHING');
  await page.goto(`${base}/workout`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button[aria-label="Часы тренировки"]');
  const churn = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let nodes = new Set();
        const observer = new MutationObserver((records) => {
          for (const record of records) nodes.add(record.target);
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(nodes.size);
        }, 2200);
      }),
  );
  check('idle only touches the clock', churn <= 2, `${churn} узлов изменилось`);

  // Убираем за собой: незавершённая тренировка меняет главный экран
  // («ПРОДОЛЖИТЬ» вместо «НАЧАТЬ»), и следующие разделы падали бы на этом.
  await page.goto(`${base}/workout`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("ОТМЕНИТЬ ТРЕНИРОВКУ")');
  await page.waitForSelector('text=Отменить тренировку?');
  await page.click('div[role="dialog"] button:has-text("Удалить")');
  await page.waitForTimeout(400);

  console.log('\nPROGRAM EDITOR');
  // Явная навигация, а не «мы и так тут»: раздел не должен падать из-за того,
  // что предыдущий закончился на другом экране.
  await page.goto(`${base}/programs`, { waitUntil: 'networkidle' });
  await page.click('a:has-text("Редактировать")');
  await page.waitForURL(/\/programs\/editor/);
  await page.waitForTimeout(400);
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
  // Ждём поле, а не кнопку: её подпись зависит от того, пусто ли поле
  // («ВВЕДИТЕ ВЕС» → «ДОБАВИТЬ»), поэтому по подписи ждать нельзя.
  await page.waitForSelector('input[placeholder="80.2"]');

  // Пустое поле показывает пример «80.2», который читается как введённое
  // значение — на это и жаловались: «ничего добавить нельзя». Кнопка обязана
  // сама объяснять, чего ждёт.
  const addBtn = page.locator('button:has-text("ВВЕДИТЕ ВЕС"), button:has-text("ДОБАВИТЬ")').first();
  check('the button says what it wants while the field is empty', (await addBtn.innerText()).includes('ВВЕДИТЕ'), (await addBtn.innerText()).trim());
  check('and it is not tappable yet', await addBtn.isDisabled());

  await page.fill('input[placeholder="80.2"]', '80.2');
  check('typing a weight turns it into ДОБАВИТЬ', (await addBtn.innerText()).includes('ДОБАВИТЬ'), (await addBtn.innerText()).trim());
  await page.click('button:has-text("ДОБАВИТЬ")');
  await page.waitForTimeout(400);
  body = await text();
  check('records a body weight entry', has(body, '80.2 кг'));
  check('offers bulk / maintain / cut', has(body, 'Набор', 'Поддержание', 'Сушка'));

  // Seeing the entry proves nothing: the store updates optimistically, so the
  // number appears whether or not the write landed. Entries were being lost
  // exactly here — the record built `notes: undefined`, the write was refused,
  // and it was gone on the next launch. Only a reload tells the truth.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="80.2"]');
  await page.waitForTimeout(400);
  body = await text();
  check('the entry is still there after a reload', has(body, '80.2 кг'), body.slice(0, 120));
  // A refused write raises this banner, so its absence is part of the proof.
  const failed = await page.locator('text=Не сохранилось').count();
  check('nothing reported a failed write', failed === 0, `${failed} shown`);

  // «Нажимаю — ничего не меняется. В чём смысл того что она есть?» Цель
  // подкрашивала две цифры изменения, а при одном взвешивании там прочерки —
  // то есть переключатель не влиял ни на что видимое. Теперь он даёт вердикт,
  // и вердикт обязан меняться вместе с целью.
  console.log('\nTHE GOAL ACTUALLY SAYS SOMETHING');
  const goalBlock = async () =>
    page.evaluate(() => {
      const heading = [...document.querySelectorAll('*')].find(
        (el) => el.textContent.trim() === 'Цель' && el.children.length === 0,
      );
      return heading?.closest('section')?.innerText ?? '';
    });

  await page.goto(`${base}/more/body-weight`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Цель');
  await page.waitForTimeout(300);
  check('it says what is missing before it can judge', /нечего оценивать/i.test(await goalBlock()), (await goalBlock()).slice(0, 70));

  // Второе взвешивание двумя неделями раньше: +0.8 кг за 14 дней = +0.4 кг/нед.
  await page.fill('input[type="date"]', '2026-09-02');
  await page.fill('input[placeholder="80.2"]', '79.4');
  await page.click('button:has-text("ДОБАВИТЬ")');
  await page.waitForTimeout(400);

  const said = {};
  for (const goal of ['Набор', 'Поддержание', 'Сушка']) {
    await page.click(`button:has-text("${goal}")`);
    await page.waitForTimeout(250);
    said[goal] = await goalBlock();
  }
  check('the verdict carries the weekly rate', /кг\/нед/.test(said['Набор']), said['Набор'].slice(0, 90));
  check(
    'each goal reaches a different verdict on the same data',
    new Set(Object.values(said)).size === 3,
    Object.entries(said).map(([k, v]) => `${k}: ${v.split('\n').slice(-2, -1)}`).join(' | '),
  );

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
  await page.click('button:text-is("РАЗОБРАТЬ")');
  await page.waitForSelector('text=Предпросмотр');
  body = await text();
  check('reads the excel rows', has(body, 'Жим штанги лежа', '50×12'));
  // Точная подпись, а не подстрока: на этом экране есть вторая кнопка, и
  // `has-text("РАЗОБРАТЬ")` цеплялась за неё, подставляя другие данные.
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

  console.log('\nEVERY SCREEN CAN SCROLL A BROWSER TOOLBAR AWAY');
  // Safari only retracts its bottom toolbar on a page that can scroll, so a
  // short screen kept the toolbar out and its tab bar sat ~79pt above the
  // screen edge while the long screens looked right. Sizing every screen to a
  // large viewport gives the short ones exactly the scroll needed to retract
  // it. Chromium has no such toolbar (lvh == vh), so what is checked here is
  // the min-height that produces the behaviour, not the scroll itself.
  for (const url of screens) {
    await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    const tall = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return { ok: false, why: 'no main' };
      const declared = parseFloat(getComputedStyle(main).minHeight);
      return { ok: declared >= window.innerHeight, declared, viewport: window.innerHeight };
    });
    check(
      `${url} is at least a large viewport tall`,
      tall.ok,
      `min-height ${tall.declared}px vs viewport ${tall.viewport}px`,
    );
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

  // "The menu sits too high" has two indistinguishable causes in a screenshot:
  // our own padding, or browser chrome below the viewport. Settings reports the
  // measurement so it stops being a guess.
  await page.goto(`${base}/more/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Как открыто');
  await page.waitForTimeout(300);
  const diag = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('*')].find(
      (el) => el.textContent.trim() === 'Как открыто' && el.children.length === 0,
    );
    return heading?.closest('section')?.innerText ?? '';
  });
  check('settings reports how the app was opened', /Режим/.test(diag) && /В браузере|Как приложение/.test(diag), diag.slice(0, 60));
  check('it reports what the browser takes', /Занято браузером\s*\n?\s*\d+ pt/.test(diag), diag.replace(/\n/g, ' | ').slice(0, 150));
  check('it reports the iOS bottom inset', /Отступ снизу \(iOS\)/.test(diag));

  // With nothing below the viewport there is nothing to advise, so the install
  // hint must stay away — otherwise it nags on every desktop and in CI.
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const nag = await page.locator('text=панель браузера').count();
  check('no install hint when the browser takes nothing', nag === 0, `${nag} shown`);

  console.log('\nWIPING EVERYTHING TAKES MORE THAN ONE TAP');
  // One tap on a phone erases every workout with no undo. Typing the word is
  // awkward on purpose: the action must not be reachable by accident.
  await page.goto(`${base}/more/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Сбросить всё и вернуть программу');
  await page.click('text=Сбросить всё и вернуть программу');
  await page.waitForSelector('text=Сбросить все данные?');
  const confirmBtn = page.locator('div[role="dialog"] button:has-text("Сбросить")');
  check('the confirm button starts disabled', await confirmBtn.isDisabled());

  await page.fill('div[role="dialog"] input', 'СБРОС');
  check('a near miss still does not arm it', await confirmBtn.isDisabled());

  await page.fill('div[role="dialog"] input', 'сбросить');
  check('the right word arms it, case aside', !(await confirmBtn.isDisabled()));

  // Leave without wiping: the rest of the suite needs the data.
  await page.click('div[role="dialog"] button:has-text("Отмена")');
  await page.waitForTimeout(200);
  const stillThere = await page.locator('text=Сбросить все данные?').count();
  check('cancelling closes it and changes nothing', stillThere === 0);

  console.log('\nTHE BUILD IT IS RUNNING IS VISIBLE AND CHECKED');
  // On a phone the app is never reloaded — it is minimised and restored — so a
  // deployed fix can fail to reach the user for weeks with nobody able to tell.
  // A screenshot does not show the build either, so both sides argue blind.
  const version = await page.evaluate(async () => {
    const res = await fetch('/version.json', { cache: 'no-store' });
    return res.ok ? res.json() : null;
  });
  check('the server publishes a build fingerprint', typeof version?.build === 'string' && version.build.length > 0, JSON.stringify(version));

  await page.goto(`${base}/more/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Как открыто');
  await page.waitForTimeout(300);
  const shown = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('*')].find(
      (el) => el.textContent.trim() === 'Как открыто' && el.children.length === 0,
    );
    return heading?.closest('section')?.innerText ?? '';
  });
  check('settings shows the build first', /Сборка/.test(shown) && shown.includes(version.build), shown.slice(0, 60));

  // Matching builds must stay silent, or the banner cries wolf on every launch.
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const quiet = await page.locator('text=Есть новая версия').count();
  check('no update banner when the builds match', quiet === 0, `${quiet} shown`);

  // And it has to actually fire when the server moves on.
  await page.route('**/version.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"build":"deadbee"}' }),
  );
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Есть новая версия', { timeout: 5000 }).catch(() => undefined);
  const raised = await page.locator('text=Есть новая версия').count();
  check('the banner appears when the server has another build', raised > 0, `${raised} shown`);
  await page.unroute('**/version.json*');

  console.log('\nTHE PRIMARY BUTTON CARRIES ITS OWN COLOUR');
  await page.goto(`${base}/more/body-weight`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="80.2"]');
  // Кнопка окрашена одинаково в любом состоянии, но брать надо включённую:
  // выключенная идёт под `opacity-35` и цвет фона читался бы приглушённым.
  await page.fill('input[placeholder="80.2"]', '84');
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
  // Выбираем явно: какая цель стоит, зависит от предыдущих проверок, а смысл
  // здесь — что ВЫБРАННАЯ читается иначе, чем невыбранные, а не какая именно.
  await page.click('button:has-text("Набор")');
  await page.waitForTimeout(200);
  const goalColours = await page.evaluate(() =>
    ['Набор', 'Поддержание', 'Сушка'].map((label) => {
      const el = [...document.querySelectorAll('button')].find(
        (b) => b.innerText.trim() === label,
      );
      return el ? getComputedStyle(el).color : null;
    }),
  );
  check(
    'the selected goal reads differently from the others',
    goalColours[0] !== null && goalColours[0] !== goalColours[1] && goalColours[1] === goalColours[2],
    goalColours.join(' vs '),
  );

  await page.goto(`${base}/history/add`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("ЗАПОЛНИТЬ ПОДХОДЫ")');
  await page.click('button:has-text("ЗАПОЛНИТЬ ПОДХОДЫ")');
  await page.waitForSelector('button:has-text("СОХРАНИТЬ В ИСТОРИЮ")');
  const addOverflow = await assertNoHorizontalOverflow(page);
  check('/history/add fits the screen with sets filled in', addOverflow === null, addOverflow ?? '');

  console.log('\nРАЗМИНКА И ЗАМИНКА');
  // Кардио — часть тренировки, но не подходы: минуты и подъём дорожки. Главное
  // здесь — один тап пишет ровно план, и запись доживает до перезагрузки:
  // оптимистичное обновление показало бы «готово» и со сломанной записью.
  await page.setViewportSize(VIEWPORTS.pro);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  if (await page.locator('a:has-text("ПРОДОЛЖИТЬ")').count()) {
    await page.click('a:has-text("ПРОДОЛЖИТЬ")');
  } else {
    await page.goto(`${base}/workout/start`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("НАЧАТЬ ТРЕНИРОВКУ")');
  }
  await page.waitForURL(/\/workout$/);
  await page.waitForSelector('text=РАЗМИНКА');
  body = await text();
  check('the workout screen shows the warm-up', has(body, 'РАЗМИНКА', '10 мин · подъём 0'), '');

  /*
   * Ширина колонки с названием и временем. Три кнопки в одной строке с
   * текстом сжимали её до НУЛЯ: на телефоне подписи не было видно, при том
   * что по горизонтали ничего не уезжало и проверка на переполнение молчала.
   * Поэтому меряем ширину, а не наличие текста в разметке.
   */
  const cardioLabel = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find(
      (n) => n.textContent.trim() === 'РАЗМИНКА',
    );
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { width: Math.round(box.width), height: Math.round(box.height) };
  });
  check(
    'its label has real width, not a column squeezed to nothing',
    cardioLabel !== null && cardioLabel.width > 80,
    JSON.stringify(cardioLabel),
  );
  check('and the cool-down', has(body, 'ЗАМИНКА', '5 мин · подъём 0'), '');
  check(
    'the warm-up sits above the first exercise, the cool-down below it',
    body.indexOf('РАЗМИНКА') < body.indexOf('ЖИМ ШТАНГИ ЛЕЖА') &&
      body.indexOf('ЗАМИНКА') > body.indexOf('ЖИМ ШТАНГИ ЛЕЖА'),
    '',
  );

  // Один тап. Кнопка на карточке разминки — первая «ГОТОВО» на экране.
  await page.locator('button:text-is("ГОТОВО")').first().click();
  await page.waitForTimeout(250);
  check(
    'one tap marks it done and offers an undo',
    (await page.locator('button:text-is("ОТМЕНИТЬ")').count()) === 1,
    '',
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=РАЗМИНКА');
  check(
    'the mark survives a reload — the write really happened',
    (await page.locator('button:text-is("ОТМЕНИТЬ")').count()) === 1,
    '',
  );

  await page.click('button:text-is("ОТМЕНИТЬ")');
  await page.waitForTimeout(250);
  check(
    'and it can be taken back — a stray tap in the gym is normal',
    (await page.locator('button:text-is("ГОТОВО")').count()) === 2,
    '',
  );

  /*
   * Таймер. Десять минут в тесте не ждём — проверяем то, что ломается:
   * отсчёт пошёл, и отметка после запуска пишет РЕАЛЬНОЕ время, а не план.
   * Сойти с дорожки на седьмой минуте и записать десять — значит испортить
   * себе историю, и поймать это можно только здесь.
   */
  await page.locator('button:text-is("НАЧАТЬ")').first().click();
  await page.waitForTimeout(400);
  body = await text();
  check(
    'tapping start begins a countdown from the planned minutes',
    /0?9:[0-5]\d/.test(body) || /10:00/.test(body),
    body.slice(0, 120),
  );
  check(
    'the reset button appears while it runs',
    (await page.locator('button:text-is("СБРОС")').count()) === 1,
    '',
  );

  await page.locator('button:text-is("ГОТОВО")').first().click();
  await page.waitForTimeout(300);
  body = await text();
  check(
    'stopping early records the real minutes, not the plan',
    has(body, '1 мин · подъём 0') && !has(body, '10 мин · подъём 0'),
    body.slice(0, 160),
  );

  await page.click('button:text-is("ОТМЕНИТЬ")');
  await page.waitForTimeout(250);

  // Сброс гасит таймер и НЕ отмечает выполненным.
  await page.locator('button:text-is("НАЧАТЬ")').first().click();
  await page.waitForTimeout(250);
  await page.click('button:text-is("СБРОС")');
  await page.waitForTimeout(250);
  body = await text();
  check(
    'reset stops the clock without marking it done',
    has(body, '10 мин · подъём 0') && (await page.locator('button:text-is("НАЧАТЬ")').count()) === 2,
    '',
  );

  // Правка минут: план остаётся прежним, меняется только эта тренировка.
  await page.locator('button:text-is("ИЗМЕНИТЬ")').first().click();
  await page.waitForSelector('div[role="dialog"] >> text=Минуты');
  await page.click('div[role="dialog"] >> button[aria-label="Минус 1"] >> nth=0');
  await page.click('button:has-text("ОТМЕТИТЬ ВЫПОЛНЕННЫМ")');
  await page.waitForTimeout(300);
  body = await text();
  check('an edited warm-up records what was actually done', has(body, '9 мин · подъём 0'), '');

  await page.reload({ waitUntil: 'networkidle' });
  body = await text();
  check('the edit survives a reload too', has(body, '9 мин · подъём 0'), '');

  // Заминка идёт уже после последнего подхода, поэтому она есть и в итогах.
  await page.click('button:has-text("ЗАВЕРШИТЬ ТРЕНИРОВКУ")');
  await page.waitForSelector('div[role="dialog"] >> text=Завершить тренировку');
  await page.click('div[role="dialog"] >> button:has-text("ЗАВЕРШИТЬ")');
  await page.waitForURL(/\/workout\/review/);
  await page.waitForSelector('text=Тренировка завершена');
  body = await text();
  check('the cool-down can still be marked from the summary', has(body, 'ЗАМИНКА', 'ГОТОВО'), '');
  await page.locator('button:text-is("ГОТОВО")').first().click();
  await page.waitForTimeout(300);
  body = await text();
  check(
    'marking it there hides the card instead of leaving it half-done',
    !has(body, 'ЗАМИНКА'),
    body.slice(0, 80),
  );

  // И попадает в историю как факт, а не как план.
  await page.goto(`${base}/history`, { waitUntil: 'networkidle' });
  await page.locator('a[href^="/history/session"]').first().click();
  await page.waitForSelector('text=Упражнения');
  body = await text();
  check('history shows the cardio that was actually done', has(body, 'КАРДИО', 'ЗАМИНКА · 5 мин'), '');

  console.log('\nЦЕЛЬ ПО ЧИСЛУ ТРЕНИРОВОК');
  // В прошлом приложении у цели были «плюс» и «минус», поэтому счётчик показывал
  // число нажатий, а не тренировок. Здесь «сделано» считается из истории, и
  // руками вводится только то, что было до приложения.
  await page.goto(`${base}/progress`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Цель');
  if (await page.locator('button:has-text("ПОСТАВИТЬ ЦЕЛЬ")').count()) {
    await page.click('button:has-text("ПОСТАВИТЬ ЦЕЛЬ")');
  } else {
    await page.click('button:text-is("Изменить")');
  }
  await page.waitForSelector('div[role="dialog"] >> text=Тренировок');
  const goalFields = page.locator('div[role="dialog"] input');
  await goalFields.nth(0).fill('100');
  await goalFields.nth(1).fill('150');
  await goalFields.nth(2).fill('2026-06-01');
  await goalFields.nth(3).fill('25');
  await goalFields.nth(4).fill('2026-09-01');
  await page.click('div[role="dialog"] >> button:has-text("СОХРАНИТЬ")');
  await page.waitForTimeout(400);
  body = await text();
  check('the goal reads as the owner set it', has(body, '100 тренировок за 150 дней'), '');
  check('the baseline is counted', /\b25\b/.test(body) && has(body, '/ 100'), '');
  check(
    'progress is derived, not a tally — no plus/minus on the card',
    (await page.locator('button:text-is("+")').count()) === 0 &&
      (await page.locator('button:text-is("−")').count()) === 0,
    '',
  );

  await page.reload({ waitUntil: 'networkidle' });
  body = await text();
  check('the goal survives a reload', has(body, '100 тренировок за 150 дней'), '');

  const goalOverflow = await assertNoHorizontalOverflow(page);
  check('/progress with a goal fits the screen', goalOverflow === null, goalOverflow ?? '');
  const goalUnreadable = await assertReadableText(page);
  check('/progress with a goal stays readable', goalUnreadable === null, goalUnreadable ?? '');

  console.log('\nПЕРЕНОС МОЕЙ ИСТОРИИ ОДНИМ ТАПОМ');
  /*
   * Настоящая выгрузка владельца: 24 тренировки, 516 подходов, 26 названий.
   * Проверяется именно то, что тут может молча сломаться: все подходы дошли,
   * веса не потерялись, ни одно упражнение не осталось нераспознанным, и
   * повторный тап не удваивает историю.
   */
  await page.setViewportSize(VIEWPORTS.pro);
  await page.goto(`${base}/more/import`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Моя выгрузка');
  body = await text();
  check('the bundled export is offered up front', has(body, '24 тренировки, 516 подходов'), '');

  await page.click('button:text-is("ВЗЯТЬ МОЮ ВЫГРУЗКУ")');
  await page.waitForSelector('text=Предпросмотр', { timeout: 15_000 });
  const parsed = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(
      (n) => /Тренировок/.test(n.textContent ?? '') && n.children.length === 0,
    );
    return el?.closest('div[class*="grid"], section, div')?.innerText ?? '';
  });
  body = await text();
  check(
    'the preview counts 24 workouts and 516 sets',
    /\b24\b/.test(body) && /\b516\b/.test(body),
    parsed.slice(0, 120),
  );
  check('nothing is left unmatched', /НЕ НАЙДЕНО\s*0|БЕЗ ПАРЫ\s*0|0\s*БЕЗ/.test(body) || !has(body, 'СОЗДАТЬ УПРАЖНЕНИЕ'), '');

  /*
   * Кнопка обязана быть видна БЕЗ прокрутки. Предпросмотр 24 тренировок —
   * это 16 тысяч пикселей, девятнадцать экранов: кнопка под списком означала,
   * что до неё надо долистать весь предпросмотр. И она не должна перекрывать
   * меню приложения — иначе с экрана импорта некуда уйти.
   */
  const cta = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.innerText.trim().toUpperCase() === 'ИМПОРТИРОВАТЬ',
    );
    const nav = document.querySelector('nav');
    if (!button || !nav) return null;
    const b = button.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    return {
      visible: b.top >= 0 && b.bottom <= window.innerHeight,
      aboveNav: Math.round(n.top - b.bottom),
      scrollY: Math.round(window.scrollY),
      pageHeight: Math.round(document.documentElement.scrollHeight),
    };
  });
  check(
    'the import button is on screen without scrolling a 19-screen preview',
    cta?.visible === true,
    JSON.stringify(cta),
  );
  check(
    'and it sits above the app nav instead of covering it',
    cta !== null && cta.aboveNav >= 0,
    JSON.stringify(cta),
  );

  await page.click('button:text-is("ИМПОРТИРОВАТЬ")');
  await page.waitForSelector('text=Импорт завершён', { timeout: 20_000 });
  body = await text();
  /*
   * 23, а не 24: раздел «MANUAL HISTORY ENTRY» выше уже записал тренировку на
   * 01.09.2026 — это одна из дат выгрузки, и защита от повтора её отбила.
   * Проверяем именно так, а не «created + duplicates = 24»: нестрогая
   * проверка прошла бы и при настоящей потере тренировок.
   */
  check(
    'every workout from the file lands once — 23 new, 01.09 already there',
    has(body, 'Добавлено тренировок: 23') && has(body, 'не добавлены повторно: 1'),
    body.slice(0, 200),
  );

  // Второй тап по тому же файлу — самый дорогой способ испортить историю.
  await page.click('button:has-text("ИМПОРТИРОВАТЬ ЕЩЁ")');
  await page.waitForSelector('text=Моя выгрузка');
  await page.click('button:text-is("ВЗЯТЬ МОЮ ВЫГРУЗКУ")');
  await page.waitForSelector('text=Предпросмотр', { timeout: 15_000 });
  await page.click('button:text-is("ИМПОРТИРОВАТЬ")');
  await page.waitForSelector('text=Импорт завершён', { timeout: 20_000 });
  body = await text();
  check(
    'a second run adds nothing and says why',
    has(body, 'Добавлено тренировок: 0') && has(body, 'Уже были в истории'),
    body.slice(0, 200),
  );

  // Теперь то, что реально важно: цифры в истории и в прогрессе.
  await page.goto(`${base}/history`, { waitUntil: 'networkidle' });
  await page.waitForSelector('a[href^="/history/session"]');
  const historyCount = await page.locator('a[href^="/history/session"]').count();
  check('history lists every imported workout', historyCount >= 24, `${historyCount} shown`);
  body = await text();
  check(
    'the day label and what it trains are separate, not one glued string',
    has(body, 'ДЕНЬ 1') && has(body, 'ГРУДЬ + ТРИЦЕПС') && !has(body, 'ДЕНЬ 1 - ГРУДЬ'),
    '',
  );

  // Веса — то, что уже терялось молча: колонка называется «Вес, кг».
  await page.locator('a[href^="/history/session"]').last().click();
  await page.waitForSelector('text=Упражнения');
  body = await text();
  check('an imported workout keeps its weights', /\d+\s*КГ/.test(body), body.slice(0, 200));
  check('and is marked as entered by hand', has(body, 'ИМПОРТ'), '');

  /*
   * Рекорды считаются на чтение, поэтому импорт обязан их породить. Пробы
   * взяты по упражнениям, которые в базе появились ТОЛЬКО из-за этой
   * выгрузки: если бы разбор списал их на похожие соседние, здесь было бы
   * пусто, а рекорды тихо ушли бы к чужому упражнению.
   */
  await page.goto(`${base}/records`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Личные рекорды');
  body = await text();
  check(
    'the new medium-grip pulldown got its own record, 40 кг × 12',
    has(body, 'Тяга верхнего блока средним хватом', '40 кг × 12'),
    '',
  );
  check(
    'so did the third row handle, 35 кг × 12',
    has(body, 'Тяга нижнего блока к поясу (другая рукоять)', '35 кг × 12'),
    '',
  );
  check(
    'and the incline dumbbell curl, 10 кг × 12',
    has(body, 'Подъем гантелей сидя попеременно (наклон)', '10 кг × 12'),
    '',
  );

  await page.goto(`${base}/progress`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Сводка');
  body = await text();
  check('the goal counts the imported history', has(body, '/ 100'), '');

  console.log('\nСОСТАВ ТЕЛА: ЧЕМ НАБРАН ВЕС');
  /*
   * Числа из настоящего отчёта весов владельца: 85,2 кг при 26,0% жира
   * против 83,1 при 24,8% раньше. Проверяется то, ради чего процент жира и
   * вводится: «+2,1 кг» превращается в «из них жир +1,6».
   *
   * ДАТЫ БЕРУТСЯ ТЕ ЖЕ, что у раздела про вес тела выше, а не свои. Скорость
   * считается по САМОМУ РАННЕМУ и самому свежему замеру в окне 30 дней, и
   * свои даты я вписал между чужими — в расклад попадали записи без процента
   * жира, состав получался неизвестен, и падали четыре проверки. Запись за
   * ту же дату обновляется, поэтому дополняем существующие замеры.
   */
  await page.setViewportSize(VIEWPORTS.pro);
  await page.goto(`${base}/more/body-weight`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="80.2"]');

  const today = await page.evaluate(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });

  const weigh = async (date, kg, fat, visceral) => {
    await page.fill('input[type="date"]', date);
    await page.fill('input[placeholder="80.2"]', String(kg));
    if (fat !== undefined) await page.fill('input[placeholder="26.0"]', String(fat));
    if (visceral !== undefined) await page.fill('input[placeholder="10"]', String(visceral));
    await page.click('button:has-text("ДОБАВИТЬ")');
    await page.waitForTimeout(400);
  };

  await weigh('2026-09-02', 83.1, 24.8);
  await weigh(today, 85.2, 26.0, 10);
  body = await text();

  check(
    'fat mass matches what the scale itself shows: 85.2 × 26% = 22.2',
    has(body, '22.2'),
    body.slice(0, 240),
  );
  check('and lean mass: 85.2 − 22.2 = 63', has(body, '63'), '');
  check(
    'the verdict says what the weight was gained as',
    has(body, 'жир +1.6 кг') && has(body, 'сухая +0.5 кг'),
    body.slice(0, 320),
  );
  check('visceral fat is stored and shown', has(body, 'Висцеральный жир — 10'), '');

  /*
   * Замер без процента жира обязан работать как раньше. Дата — далеко в
   * прошлом, за окном тридцати дней: иначе он стал бы самым ранним замером
   * окна и снёс бы расклад состава, который только что проверили.
   */
  await weigh('2026-01-15', 78.0);
  body = await text();
  check(
    'a plain weigh-in with no body-fat still works and keeps the split',
    has(body, 'жир +1.6 кг') && has(body, '78'),
    body.slice(0, 200),
  );

  /*
   * Список записей обязан показывать ВСЁ введённое. Владелец ввёл процент
   * жира и не нашёл его в истории — он был виден только в верхней карточке
   * последнего замера. Записал значит видит.
   */
  const recorded = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('*')].find(
      (el) => el.children.length === 0 && el.textContent.trim() === 'Записи',
    );
    return heading?.closest('section')?.innerText ?? '';
  });
  check(
    'the records list shows body fat, not just weight',
    /жир 26\.0%/.test(recorded) && /сухая 63/.test(recorded) && /висц\. 10/.test(recorded),
    recorded.slice(0, 200),
  );

  // Тап по записи подставляет её в поля — иначе дополнить прошлый замер
  // процентом жира можно только вспомнив дату и вес.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // Берём замер за 15.01 — он единственный без процента жира, и подмена
  // формы на нём видна однозначно.
  await page.locator('section:has-text("Записи") button:has-text("78")').first().click();
  await page.waitForTimeout(400);
  const refilled = await page.locator('input[placeholder="80.2"]').inputValue();
  check('tapping a record loads it back into the form', refilled === '78', refilled);

  const bwOverflow = await assertNoHorizontalOverflow(page);
  check('/more/body-weight fits with the new fields', bwOverflow === null, bwOverflow ?? '');

  console.log('\nПОЛЕ ДАТЫ НЕ ВЫДАВЛИВАЕТ СОСЕДЕЙ');
  /*
   * Поле `type="date"` iOS рисует по локали: «18 сент. 2026 г.» заметно шире
   * короткого «дд.мм.гггг», который показывает Chromium. Поэтому переполнение
   * здесь НЕ воспроизводится, и проверять надо не ширину, а само правило:
   * элемент flex с датой обязан иметь `min-width: 0`, иначе он не сожмётся
   * ниже своего содержимого и вылезет за карточку — ровно это владелец и
   * увидел на телефоне.
   */
  for (const url of ['/more/body-weight', '/more/pain', '/history/add']) {
    await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="date"]');
    const risky = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('input[type="date"]')) {
        // Ищем ближайшего предка, который сам является элементом flex.
        let node = el;
        while (node && node.parentElement) {
          const parent = node.parentElement;
          if (getComputedStyle(parent).display.includes('flex')) {
            const cs = getComputedStyle(node);
            const shrinkable =
              cs.minWidth === '0px' || cs.flexBasis === 'auto' || cs.flexGrow === '0';
            if (!shrinkable) bad.push(`${node.tagName}.${node.className}`.slice(0, 60));
            break;
          }
          node = parent;
        }
      }
      return bad;
    });
    check(`${url} keeps its date field shrinkable`, risky.length === 0, risky.join(' | '));
  }

  console.log('\nНАЗВАНИЯ УПРАЖНЕНИЙ ВИДНО ЦЕЛИКОМ');
  /*
   * В библиотеке шесть тяг верхнего блока и три разгибания на блоке, поэтому
   * «Тяга верхнего блок…» и «Разгибание рук на …» не отличимы друг от друга:
   * обрезанное имя не говорит, какое из упражнений перед тобой. Проверяем по
   * ВЫЧИСЛЕННОЙ ширине, а не по разметке: обрезка делается стилем, и в
   * `innerText` её не видно.
   */
  await page.setViewportSize(VIEWPORTS.pro);
  for (const url of ['/progress/exercise', '/records']) {
    await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const clipped = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('a p, a span')) {
        const cs = getComputedStyle(el);
        const oneLine = cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap';
        // Обрезка в одну строку у длинного текста — это и есть потеря имени.
        if (oneLine && el.scrollWidth > el.clientWidth + 1) {
          bad.push(`${el.textContent.trim().slice(0, 28)}…`);
        }
      }
      return bad;
    });
    check(`${url} shows exercise names in full`, clipped.length === 0, clipped.join(' | '));
  }

  console.log('\nСТАРАЯ БАЗА ОБНОВЛЯЕТСЯ ДО НОВОЙ СБОРКИ');
  /*
   * САМАЯ ДОРОГАЯ ДЫРА В ПРОВЕРКАХ: всё остальное здесь работает на ЧИСТОЙ
   * установке, где база засевается уже новой версией и шаг миграции не
   * запускается вообще. Поэтому трижды подряд владелец находил в зале одно и
   * то же: изменение засева (разминка у дня, цель, ПСЕВДОНИМЫ БИБЛИОТЕКИ) до
   * его заведённой базы не доезжало, а в тестах всё было зелёное.
   *
   * Здесь база откатывается к состоянию прошлой версии прямо в IndexedDB —
   * как у него на телефоне, — и проверяется, что обновление её лечит.
   */
  await page.setViewportSize(VIEWPORTS.pro);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=СПЛИТ — НАБОР МАССЫ');

  const rolledBack = await page.evaluate(async () => {
    const open = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('personal-gym-os', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const db = await open();
    const all = (store) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const put = (store, value, key) =>
      new Promise((resolve, reject) => {
        const os = db.transaction(store, 'readwrite').objectStore(store);
        const req = key === undefined ? os.put(value) : os.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    const del = (store, key) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

    // 1. Библиотека прошлой версии: без псевдонимов, без новых упражнений,
    //    со старым названием переименованного.
    const exercises = await all('exercises');
    let stripped = 0;
    for (const ex of exercises) {
      if (['ex_lat_pulldown_medium', 'ex_seated_row_alt'].includes(ex.id)) {
        await del('exercises', ex.id);
        continue;
      }
      const copy = { ...ex };
      if (copy.aliases) {
        delete copy.aliases;
        stripped += 1;
      }
      if (copy.id === 'ex_seated_alt_curl') copy.name = 'Подъем гантелей сидя попеременно';
      await put('exercises', copy);
    }

    // 2. Программа прошлой версии: без разминки и заминки у дней.
    const programs = await all('programs');
    for (const p of programs) {
      await put('programs', {
        ...p,
        days: p.days.map((d) => {
          const day = { ...d };
          delete day.warmup;
          delete day.cooldown;
          return day;
        }),
      });
    }

    // 3. Настройки прошлой версии: цель с сегодняшней датой и baseline 25.
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const settings = await new Promise((resolve, reject) => {
      const req = db.transaction('kv').objectStore('kv').get('settings');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await put(
      'kv',
      {
        ...settings,
        seedVersion: 1,
        workoutGoal: {
          target: 100,
          days: 150,
          startDate: iso,
          baseline: 25,
          countFrom: iso,
        },
      },
      'settings',
    );
    db.close();
    return { stripped, staleGoalDate: iso };
  });
  check(
    'the database was rolled back to the previous release',
    rolledBack.stripped > 0,
    JSON.stringify(rolledBack),
  );

  // Обновление приложения = перезагрузка страницы.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=СПЛИТ — НАБОР МАССЫ');
  await page.waitForTimeout(800);

  const repaired = await page.evaluate(async () => {
    const open = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('personal-gym-os', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const db = await open();
    const all = (store) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const exercises = await all('exercises');
    const programs = await all('programs');
    const settings = await new Promise((resolve, reject) => {
      const req = db.transaction('kv').objectStore('kv').get('settings');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const byId = (id) => exercises.find((e) => e.id === id);
    return {
      withAliases: exercises.filter((e) => (e.aliases ?? []).length).length,
      added: ['ex_lat_pulldown_medium', 'ex_seated_row_alt'].filter((id) => byId(id)).length,
      renamed: byId('ex_seated_alt_curl')?.name ?? null,
      pecAliases: byId('ex_pec_deck')?.aliases ?? byId('ex_chest_fly_machine')?.aliases ?? null,
      daysWithWarmup: programs[0]?.days.filter((d) => d.warmup && d.cooldown).length ?? 0,
      totalDays: programs[0]?.days.length ?? 0,
      goalStart: settings?.workoutGoal?.startDate ?? null,
      goalBaseline: settings?.workoutGoal?.baseline ?? null,
      seedVersion: settings?.seedVersion ?? null,
    };
  });

  // Ровно столько упражнений засева несут псевдонимы. Число точное, а не
  // «не меньше»: пропавший псевдоним — это молча несведённое название в
  // импорте, и заметить его иначе нечем.
  check(
    'aliases are restored into the existing library',
    repaired.withAliases === 16,
    `${repaired.withAliases} exercises carry aliases, expected 16`,
  );
  check(
    'the two new exercises are added to an existing library',
    repaired.added === 2,
    `${repaired.added} of 2`,
  );
  check(
    'the renamed exercise picks up its new name',
    repaired.renamed === 'Подъем гантелей сидя попеременно (наклон)',
    String(repaired.renamed),
  );
  check(
    'every day of the existing program gets its warm-up and cool-down',
    repaired.totalDays > 0 && repaired.daysWithWarmup === repaired.totalDays,
    `${repaired.daysWithWarmup} of ${repaired.totalDays}`,
  );
  check(
    'the stale goal is replaced with the real start date',
    repaired.goalStart === '2026-08-07' && repaired.goalBaseline === 0,
    JSON.stringify({ start: repaired.goalStart, baseline: repaired.goalBaseline }),
  );
  check('the seed version is bumped so it runs once', repaired.seedVersion === 4, String(repaired.seedVersion));

  // И главное: теперь импорт узнаёт ВСЕ названия из выгрузки. Без синхронизации
  // библиотеки их было шесть штук «не найдено» и 31 вопрос на 24 тренировки.
  await page.goto(`${base}/more/import`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Моя выгрузка');
  await page.click('button:text-is("ВЗЯТЬ МОЮ ВЫГРУЗКУ")');
  await page.waitForSelector('text=Предпросмотр', { timeout: 15_000 });
  const unmatched = await page.evaluate(
    () => document.body.innerText.match(/не найдено в библиотеке/g)?.length ?? 0,
  );
  check('the import asks nothing on an upgraded database', unmatched === 0, `${unmatched} questions`);
  body = await text();
  check(
    'and it still sees all 24 workouts and 516 sets',
    /\b24\b/.test(body) && /\b516\b/.test(body),
    '',
  );

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
