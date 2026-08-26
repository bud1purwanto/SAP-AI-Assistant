/**
 * Pewarnaan sintaks ABAP sederhana.
 *
 * Sengaja tidak memakai pustaka highlighter: kebutuhannya hanya empat kelas
 * token (kata kunci, komentar, literal teks, angka) dan bundelnya sudah besar.
 * Palet warnanya mengikuti ABAP Development Tools (Eclipse) dan didefinisikan
 * sebagai token tema di index.css, sehingga ikut berubah di light/dark mode.
 */

// Kata kunci ABAP yang lazim muncul pada jawaban asisten. Daftar ini tidak
// perlu lengkap seperti SE38 — cukup yang membuat struktur kode terbaca.
const KEYWORDS = [
  'ABAP', 'ADD', 'ALIAS', 'AND', 'APPEND', 'AS', 'ASCENDING', 'ASSIGN', 'AT',
  'BEGIN', 'BINARY', 'BY', 'CALL', 'CASE', 'CHANGING', 'CHECK', 'CLASS',
  'CLEAR', 'CLOSE', 'COLLECT', 'COMMIT', 'CONCATENATE', 'CONDENSE', 'CONSTANTS',
  'CONTINUE', 'CORRESPONDING', 'CREATE', 'DATA', 'DEFAULT', 'DEFINITION',
  'DELETE', 'DESCENDING', 'DESCRIBE', 'DO', 'ELSE', 'ELSEIF', 'END',
  'ENDCASE', 'ENDCLASS', 'ENDDO', 'ENDFORM', 'ENDFUNCTION', 'ENDIF',
  'ENDLOOP', 'ENDMETHOD', 'ENDMODULE', 'ENDSELECT', 'ENDTRY', 'ENDWHILE',
  'EQ', 'EXCEPTIONS', 'EXIT', 'EXPORTING', 'FIELD', 'FIELDS', 'FOR', 'FORM',
  'FREE', 'FROM', 'FUNCTION', 'GE', 'GROUP', 'GT', 'IF', 'IMPLEMENTATION',
  'IMPORTING', 'IN', 'INDEX', 'INITIAL', 'INNER', 'INSERT', 'INTO', 'IS',
  'JOIN', 'KEY', 'LE', 'LEFT', 'LIKE', 'LOOP', 'LT', 'MESSAGE', 'METHOD',
  'METHODS', 'MODIFY', 'MODULE', 'MOVE', 'NE', 'NOT', 'OCCURS', 'OF', 'ON',
  'OR', 'ORDER', 'OTHERS', 'OUTER', 'PARAMETERS', 'PERFORM', 'PUBLIC',
  'RAISE', 'RAISING', 'READ', 'RECEIVING', 'REF', 'REFRESH', 'REPORT',
  'RETURNING', 'ROLLBACK', 'SELECT', 'SELECTION', 'SET', 'SINGLE', 'SORT',
  'SPACE', 'SPLIT', 'STRUCTURE', 'SUBMIT', 'SUBTRACT', 'SUM', 'TABLE',
  'TABLES', 'THEN', 'TO', 'TRANSLATE', 'TRY', 'TYPE', 'TYPES', 'UP',
  'UPDATE', 'USING', 'VALUE', 'WHEN', 'WHERE', 'WHILE', 'WITH', 'WORK',
  'WRITE',
];

const KEYWORD_SET = new Set(KEYWORDS);

// Urutan alternasi menentukan prioritas: komentar dan literal teks harus
// dikenali lebih dulu agar kata di dalamnya tidak ikut diwarnai sebagai kunci.
const TOKEN_RE = new RegExp(
  [
    '(^\\*[^\\n]*)',      // komentar satu baris penuh (kolom pertama)
    '("[^\\n]*)',          // komentar setelah kode
    "('(?:[^']|'')*')",    // literal teks, termasuk '' yang di-escape
    '(`(?:[^`])*`)',       // string template
    '(\\b\\d+(?:\\.\\d+)?\\b)', // angka
    '([A-Za-z_][A-Za-z0-9_/]*)', // identifier atau kata kunci
  ].join('|'),
  'gm',
);

/**
 * Pecah kode ABAP menjadi daftar token bergaya {text, type}.
 *
 * `type` bernilai null untuk teks biasa, sehingga pemanggil cukup merender
 * teksnya apa adanya tanpa membungkusnya dengan <span>.
 */
export const tokenizeAbap = (code) => {
  const tokens = [];
  let lastIndex = 0;

  const push = (text, type) => {
    if (text) tokens.push({ text, type });
  };

  TOKEN_RE.lastIndex = 0;
  let m = TOKEN_RE.exec(code);
  while (m !== null) {
    push(code.slice(lastIndex, m.index), null);

    const [text, komentarBaris, komentarInline, teks, template, angka, kata] = m;
    if (komentarBaris || komentarInline) push(text, 'comment');
    else if (teks || template) push(text, 'string');
    else if (angka) push(text, 'number');
    else if (kata) push(text, KEYWORD_SET.has(kata.toUpperCase()) ? 'keyword' : null);
    else push(text, null);

    lastIndex = m.index + text.length;
    m = TOKEN_RE.exec(code);
  }

  push(code.slice(lastIndex), null);
  return tokens;
};

export const ABAP_TOKEN_CLASS = {
  keyword: 'text-abap-keyword font-semibold',
  comment: 'text-abap-comment italic',
  string: 'text-abap-string',
  number: 'text-abap-number',
};

/** Bahasa yang isinya diperlakukan sebagai ABAP. */
export const isAbapLanguage = (language) =>
  !language || ['abap', 'sql', 'openSQL', 'opensql'].includes(language);
