'use strict';

/**
 * Parser berkas kontak target Beatles-WS.
 *
 * Membaca berkas .txt / .csv (teks) dan .xlsx / .xls (spreadsheet via exceljs),
 * lalu mengekstrak nomor telepon, menyaringnya (8-15 digit), membuang duplikat,
 * dan melaporkan statistik deteksi (total valid, tidak valid, duplikat).
 */

const path = require('path');
const { extractPhonesFromText, refinePhoneList } = require('./helpers');

const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls']);

/** Membaca seluruh nomor dari sebuah berkas Excel memakai exceljs. */
async function extractPhonesFromExcel(filePath) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const numbers = [];

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        numbers.push(...extractPhonesFromText(cellToText(cell.value)));
      });
    });
  });

  return numbers;
}

/**
 * Mengubah nilai sel exceljs menjadi teks. Sel bertipe formula/rich text/hyperlink
 * dikembalikan sebagai teksnya agar nomor tetap terbaca.
 */
function cellToText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.text != null) return String(value.text);
    if (value.result != null) return String(value.result);
    if (value.hyperlink != null) return String(value.hyperlink);
    if (value.richText) return value.richText.map((part) => part.text).join('');
    return '';
  }
  return String(value);
}

/**
 * Mengekstrak & menyaring nomor dari sebuah berkas kontak.
 *
 * @param {string} filePath - path berkas yang sudah diunggah.
 * @param {string} originalName - nama asli (untuk menentukan ekstensi).
 * @returns {Promise<{valid: string[], total: number, invalid: number, duplicates: number}>}
 */
async function parseContactFile(filePath, originalName) {
  const ext = path.extname(String(originalName || filePath || '')).toLowerCase();

  let raw = [];
  if (EXCEL_EXTENSIONS.has(ext)) {
    raw = await extractPhonesFromExcel(filePath);
  } else {
    const fs = require('fs');
    raw = extractPhonesFromText(fs.readFileSync(filePath, 'utf8'));
  }

  return refinePhoneList(raw);
}

module.exports = { parseContactFile, extractPhonesFromExcel };
