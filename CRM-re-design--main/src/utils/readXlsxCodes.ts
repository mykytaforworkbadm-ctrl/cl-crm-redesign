/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { strFromU8, unzipSync } from 'fflate';

/**
 * Д7 (фідбек бізнесу 05.10): імпорт списку кодів з файлу Excel (.xlsx) у вікні «Масова дія».
 *
 * Читає перший аркуш книги і повертає для кожного непорожнього рядка значення першої заповненої клітинки
 * (формат файлу: один код / назва об'єкта в рядку). Порожні рядки пропускаються.
 * Підтримуються текстові (спільні та вбудовані рядки) і числові клітинки.
 */
export const readXlsxCodes = async (file: File): Promise<string[]> => {
  const buffer = new Uint8Array(await file.arrayBuffer());

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, {
      filter: (f) =>
        f.name === 'xl/workbook.xml' ||
        f.name === 'xl/_rels/workbook.xml.rels' ||
        f.name === 'xl/sharedStrings.xml' ||
        f.name.startsWith('xl/worksheets/')
    });
  } catch {
    throw new Error('Файл не є книгою Excel (.xlsx) або пошкоджений.');
  }

  const parser = new DOMParser();
  const xml = (name: string) => (files[name] ? parser.parseFromString(strFromU8(files[name]), 'application/xml') : null);

  // Перший аркуш книги (за порядком у workbook.xml)
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbook = xml('xl/workbook.xml');
  const rels = xml('xl/_rels/workbook.xml.rels');
  const firstSheet = workbook?.getElementsByTagName('sheet')[0];
  const relId = firstSheet?.getAttribute('r:id');
  if (relId && rels) {
    const rel = Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === relId);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = xml(sheetPath);
  if (!sheet) throw new Error('У файлі не знайдено аркуша з даними.');

  // Спільні рядки (текстові клітинки)
  const shared: string[] = [];
  const sst = xml('xl/sharedStrings.xml');
  if (sst) {
    Array.from(sst.getElementsByTagName('si')).forEach((si) => {
      shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent || '').join(''));
    });
  }

  const colIndex = (ref: string) => {
    const letters = (ref.match(/^[A-Z]+/) || ['A'])[0];
    return letters.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
  };

  const result: string[] = [];
  Array.from(sheet.getElementsByTagName('row')).forEach((row) => {
    const cells = Array.from(row.getElementsByTagName('c'))
      .map((c) => {
        const type = c.getAttribute('t');
        let value = '';
        if (type === 's') {
          const idx = parseInt(c.getElementsByTagName('v')[0]?.textContent || '', 10);
          value = Number.isNaN(idx) ? '' : shared[idx] || '';
        } else if (type === 'inlineStr') {
          value = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent || '').join('');
        } else {
          value = c.getElementsByTagName('v')[0]?.textContent || '';
        }
        return { col: colIndex(c.getAttribute('r') || 'A'), value: value.trim() };
      })
      .filter((c) => c.value !== '')
      .sort((a, b) => a.col - b.col);
    if (cells.length > 0) result.push(cells[0].value);
  });
  return result;
};
