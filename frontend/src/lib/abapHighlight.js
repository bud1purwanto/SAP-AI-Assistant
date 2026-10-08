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

export const looksLikeAbap = (code = '') => {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim();
  if (trimmed.length < 5) return false;

  const abapPatterns = [
    /(?:^|\n)\s*(?:DATA|TYPES|CONSTANTS|TABLES|PARAMETERS|SELECT-OPTIONS)\s*:\s*[A-Za-z0-9_]+/i,
    /(?:^|\n)\s*(?:DATA|TYPES)\s+[A-Za-z0-9_]+\s+TYPE\s+[A-Za-z0-9_]+/i,
    /(?:^|\n)\s*(?:LOOP\s+AT\s+[A-Za-z0-9_]+|READ\s+TABLE\s+[A-Za-z0-9_]+|ENDLOOP\.|ENDFORM\.|ENDMETHOD\.)/i,
    /(?:^|\n)\s*(?:CALL\s+FUNCTION\s+['`][A-Za-z0-9_]+|CALL\s+METHOD\s+[A-Za-z0-9_]+)/i,
    /(?:^|\n)\s*SELECT\s+[\s\S]+?\bFROM\s+[A-Za-z0-9_]+\s+INTO\s+/i,
    /(?:^|\n)\s*(?:FORM\s+[A-Za-z0-9_]+|METHOD\s+[A-Za-z0-9_]+|REPORT\s+[A-Za-z0-9_]+)\b/i,
    /(?:^|\n)\s*FIELD-SYMBOLS\s*:\s*<[A-Za-z0-9_]+>/i,
    /(?:^|\n)\s*WRITE\s*:\s*[/']/i,
  ];

  return abapPatterns.some((pattern) => pattern.test(trimmed));
};

export const looksLikeSql = (code = '') => {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim();
  if (trimmed.length < 8) return false;
  if (looksLikeAbap(trimmed)) return false;

  const sqlPatterns = [
    /^\s*SELECT\s+[\s\S]+?\bFROM\s+[\w."`]+/i,
    /^\s*(?:INSERT\s+INTO\s+[\w."`]+|UPDATE\s+[\w."`]+\s+SET|DELETE\s+FROM\s+[\w."`]+|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i,
  ];

  return sqlPatterns.some((pattern) => pattern.test(trimmed));
};

export const looksLikeJson = (code = '') => {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

export const looksLikeTerminal = (code = '') => {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim();
  return /^(?:\$|#|>)\s+\S+/m.test(trimmed) || /^\s*(?:curl|npm|npx|pip|docker|docker-compose|sudo|systemctl|git)\s+/m.test(trimmed);
};

/** Bahasa yang isinya diperlakukan sebagai ABAP. */
export const isAbapLanguage = (language, codeString = '') => {
  const lang = (language || '').trim().toLowerCase();
  if (['abap'].includes(lang)) return true;
  if (!lang && looksLikeAbap(codeString)) return true;
  return false;
};

/**
 * Menentukan metadata judul, ikon, dan berkas panel untuk blok kode/teks.
 */
export const getCodeBlockMeta = (rawLanguage, codeString, t = (k) => k, uiLanguage = 'id') => {
  const lang = (rawLanguage || '').trim().toLowerCase();
  const isEn = uiLanguage === 'en';

  if (lang === 'abap') {
    return { title: 'ABAP', isAbap: true, isSql: false, isCode: true, filename: 'code.abap', kind: 'abap' };
  }
  if (['sql', 'opensql', 'plsql', 'tsql'].includes(lang)) {
    return { title: 'SQL', isAbap: false, isSql: true, isCode: true, filename: 'query.sql', kind: 'sql' };
  }
  if (['python', 'py'].includes(lang)) {
    return { title: 'Python', isAbap: false, isSql: false, isCode: true, filename: 'script.py', kind: 'code' };
  }
  if (['javascript', 'js'].includes(lang)) {
    return { title: 'JavaScript', isAbap: false, isSql: false, isCode: true, filename: 'script.js', kind: 'code' };
  }
  if (['typescript', 'ts'].includes(lang)) {
    return { title: 'TypeScript', isAbap: false, isSql: false, isCode: true, filename: 'script.ts', kind: 'code' };
  }
  if (['json'].includes(lang)) {
    return { title: 'JSON', isAbap: false, isSql: false, isCode: true, filename: 'data.json', kind: 'code' };
  }
  if (['bash', 'sh', 'shell', 'zsh'].includes(lang)) {
    return { title: 'Bash', isAbap: false, isSql: false, isCode: true, filename: 'script.sh', kind: 'terminal' };
  }
  if (['html', 'htm'].includes(lang)) {
    return { title: 'HTML', isAbap: false, isSql: false, isCode: true, filename: 'index.html', kind: 'code' };
  }
  if (['css'].includes(lang)) {
    return { title: 'CSS', isAbap: false, isSql: false, isCode: true, filename: 'style.css', kind: 'code' };
  }
  if (['xml'].includes(lang)) {
    return { title: 'XML', isAbap: false, isSql: false, isCode: true, filename: 'data.xml', kind: 'code' };
  }
  if (['yaml', 'yml'].includes(lang)) {
    return { title: 'YAML', isAbap: false, isSql: false, isCode: true, filename: 'config.yaml', kind: 'code' };
  }
  if (['markdown', 'md'].includes(lang)) {
    return { title: 'Markdown', isAbap: false, isSql: false, isCode: false, filename: 'document.md', kind: 'text' };
  }
  if (['csv'].includes(lang)) {
    return { title: 'CSV', isAbap: false, isSql: false, isCode: false, filename: 'data.csv', kind: 'text' };
  }
  if (['text', 'txt', 'plaintext', 'none'].includes(lang)) {
    const textTitle = t('chat.codeText') || (isEn ? 'Text' : 'Teks');
    return { title: textTitle, isAbap: false, isSql: false, isCode: false, filename: 'snippet.txt', kind: 'text' };
  }
  if (['output', 'log', 'console'].includes(lang)) {
    const outTitle = t('chat.codeOutput') || (isEn ? 'Output' : 'Keluaran');
    return { title: outTitle, isAbap: false, isSql: false, isCode: false, filename: 'output.txt', kind: 'text' };
  }

  if (lang) {
    const capitalized = lang.charAt(0).toUpperCase() + lang.slice(1);
    return { title: capitalized, isAbap: false, isSql: false, isCode: true, filename: `code.${lang}`, kind: 'code' };
  }

  // Jika tanpa tag bahasa (kasus snippet teks/dokumen dari model)
  if (looksLikeAbap(codeString)) {
    return { title: 'ABAP', isAbap: true, isSql: false, isCode: true, filename: 'code.abap', kind: 'abap' };
  }
  if (looksLikeSql(codeString)) {
    return { title: 'SQL', isAbap: false, isSql: true, isCode: true, filename: 'query.sql', kind: 'sql' };
  }
  if (looksLikeJson(codeString)) {
    return { title: 'JSON', isAbap: false, isSql: false, isCode: true, filename: 'data.json', kind: 'code' };
  }
  if (looksLikeTerminal(codeString)) {
    const termTitle = t('chat.codeTerminal') || 'Terminal';
    return { title: termTitle, isAbap: false, isSql: false, isCode: true, filename: 'command.sh', kind: 'terminal' };
  }

  // Bukan koding: beri judul Teks / Text
  const textTitle = t('chat.codeText') || (isEn ? 'Text' : 'Teks');
  return { title: textTitle, isAbap: false, isSql: false, isCode: false, filename: 'snippet.txt', kind: 'text' };
};
