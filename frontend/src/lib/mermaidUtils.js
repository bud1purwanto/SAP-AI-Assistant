/**
 * Utilitas pembersihan dan perbaikan sintaks Mermaid otomatis.
 *
 * LLM seringkali menghasilkan sintaks diagram yang sedikit melenceng dari standar Mermaid v11,
 * seperti:
 * 1. Tanda kurung di dalam label tanpa kutip ganda: A[Mulai (Start)]
 * 2. Tanda kurung di dalam label panah/edge: -->|Cek (Stock)|
 * 3. Kutip ganda bersarang: A["Release (FRGKE = "2")"]
 * 4. Subgraph dengan nomor tanpa identifier: subgraph 1. Monitoring
 * 5. Node ID berspasi: Step 1[Input]
 * 6. Header flowchart hilang atau markdown code block fence terbawa
 *
 * Fungsi ini menormalkan dan men-sanitize kode diagram sebelum dikirim ke mermaid parser.
 */

export function sanitizeMermaid(rawChart) {
  if (!rawChart || typeof rawChart !== 'string') return '';

  let code = rawChart.trim();

  // 1. Bersihkan code fence markdown jika terbawa (```mermaid ... ```)
  code = code.replace(/^```(?:mermaid)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  // 2. Pastikan ada deklarasi tipe diagram di baris pertama
  const validDiagramTypes = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|quadrantChart|xychart-beta|mindmap|timeline|zenuml|sankey|block-beta)/i;
  if (!validDiagramTypes.test(code)) {
    code = `flowchart TD\n${code}`;
  }

  const lines = code.split('\n');
  const sanitizedLines = [];

  for (let line of lines) {
    let l = line;

    // A. Subgraph bernomor atau berspasi tanpa ID:
    // Contoh: subgraph 1. Monitoring -> subgraph SG_1 ["1. Monitoring"]
    l = l.replace(/^(\s*)subgraph\s+([0-9]+)\.\s*(.*)$/i, (m, indent, num, title) => {
      const cleanTitle = title.trim().replace(/"/g, "'");
      return `${indent}subgraph SG_${num} ["${num}. ${cleanTitle}"]`;
    });

    // B. Perbaiki label edge dengan kurung/karakter khusus tanpa kutip ganda:
    // Contoh: -->|Label (Detail)| -> -->|"Label (Detail)"|
    l = l.replace(/(-->|--\s*>\s*|\-\.\->|==>)\|([^|\n]+)\|/g, (match, arrow, label) => {
      let trimmed = label.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
        trimmed = trimmed.slice(1, -1);
      }
      trimmed = trimmed.replace(/"/g, "'");
      return `${arrow.trim()}|"${trimmed}"|`;
    });

    // C. Perbaiki panah lama: A -- label --> B menjadi A -->|"label"| B
    l = l.replace(/\s+--\s+([^->\n]+)\s+-->\s+/g, (match, label) => {
      let trimmed = label.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
        trimmed = trimmed.slice(1, -1);
      }
      trimmed = trimmed.replace(/"/g, "'");
      return ` -->|"${trimmed}"| `;
    });

    // D. Perbaiki node ID yang memiliki spasi (KECUALI baris subgraph atau keyword)
    if (!/^\s*(subgraph|flowchart|graph|sequenceDiagram|classDiagram|end)\b/i.test(l)) {
      l = l.replace(/^(\s*)([a-zA-Z0-9]+)\s+([0-9]+)\s*(\[|\{|\()/g, '$1$2_$3$4');
      l = l.replace(/(-->|--\s*>\s*|\-\.\->|==>)\s*([a-zA-Z0-9]+)\s+([0-9]+)\s*(\[|\{|\()/g, '$1 $2_$3$4');
    }

    // E. Perbaiki isi simpul / node labels:
    // HANYA proses jika di dalam bentuk BELUM dibungkus tanda kutip ganda "..."
    // 1) Kotak [ ... ]: jika belum diawali kutip "
    l = l.replace(/([a-zA-Z0-9_-]+)\[([^"\]\n][^\]\n]*)\]/g, (match, id, content) => {
      const trimmed = content.trim();
      if (/^\s*subgraph\b/i.test(id)) return match;
      if (/[()[\]{}:;,/&<>"'=]/.test(trimmed)) {
        return `${id}["${trimmed.replace(/"/g, "'")}"]`;
      }
      return match;
    });

    // 2) Belah Ketupat { ... }: jika belum diawali kutip "
    l = l.replace(/([a-zA-Z0-9_-]+)\{([^"\}\n][^\}\n]*)\}/g, (match, id, content) => {
      const trimmed = content.trim();
      if (/[()[\]{}:;,/&<>"'=]/.test(trimmed)) {
        return `${id}{"${trimmed.replace(/"/g, "'")}"}`;
      }
      return match;
    });

    // 3) Lingkaran ( ... ): jika belum diawali kutip "
    l = l.replace(/([a-zA-Z0-9_-]+)\(([^"\)\n][^\)\n]*)\)/g, (match, id, content) => {
      const trimmed = content.trim();
      if (/[()[\]{}:;,/&<>"'=]/.test(trimmed)) {
        return `${id}("${trimmed.replace(/"/g, "'")}")`;
      }
      return match;
    });

    // F. Tangani nested double quotes di dalam ["... "nested" ..."]:
    l = l.replace(/\["([^\]\n]+)"\]/g, (match, inner) => {
      if (inner.includes('"')) {
        return `["${inner.replace(/"/g, "'")}"]`;
      }
      return match;
    });

    sanitizedLines.push(l);
  }

  return sanitizedLines.join('\n');
}

