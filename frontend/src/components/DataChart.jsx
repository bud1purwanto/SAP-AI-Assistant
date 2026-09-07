import React, { useMemo, useState } from 'react';
import { BarChart3, LineChart, PieChart, Download } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

const PALETTE = [
  '#0284c7', // Sky / Primary Accent
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#84cc16', // Lime
];

/**
 * Parsing nilai angka dari berbagai format (IDR/USD/EU/koma/titik/satuan).
 */
export function parseNumericValue(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (!val || typeof val !== 'string') return null;

  let cleaned = val
    .replace(/^(?:Rp|IDR|USD|\$|EUR)\s*/i, '')
    .replace(/\s*(?:pcs|pc|ea|unit|kg|ton|%|m|ltr|box)\b/i, '')
    .trim();

  // Format ribuan titik & desimal koma (ID/DE): 1.250.000,50
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(cleaned)) {
    // Format ribuan koma & desimal titik (US): 1,250,000.50
    cleaned = cleaned.replace(/,/g, '');
  } else if (/^\d+,\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }

  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Format angka singkat untuk label sumbu & nilai (misal: 1.5K, 2.5M, dsb.)
 */
function formatShortNumber(num) {
  if (num === null || num === undefined) return '';
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return num.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}

const IDENTIFIER_HEADER_REGEX = /(?:dokumen|document|doc|nomor|no\b|no\.|id\b|kode|code|bukrs|lifnr|ebeln|matnr|kunnr|vbeln|pernr|tahun|year|tanggal|date|aedat|bedat|telp|phone|rekening|account|postal|zip|pin)/i;
const DATE_VAL_REGEX = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/;

export default function DataChart({ headers = [], rows = [], title = '' }) {
  const { t } = useLanguage();
  const [chartType, setChartType] = useState('bar'); // 'bar' | 'line' | 'donut'
  const [hoveredItem, setHoveredItem] = useState(null);
  const [selectedColIdx, setSelectedColIdx] = useState(null);

  // Analisis struktur data: deteksi kolom metrik atau agregasi distribusi cerdas
  const parsedData = useMemo(() => {
    if (!rows || rows.length === 0 || !headers || headers.length === 0) {
      return null;
    }

    // 1. Identifikasi kolom metrik nilai sejati (bukan ID, tanggal, atau nomor dokumen)
    const numericColIndices = [];
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const header = String(headers[colIdx] || '');
      if (IDENTIFIER_HEADER_REGEX.test(header)) {
        continue;
      }

      let numCount = 0;
      let largeIdCount = 0;
      let dateCount = 0;

      for (const row of rows) {
        const val = row[colIdx];
        if (val !== null && val !== undefined) {
          const strVal = String(val).trim();
          if (DATE_VAL_REGEX.test(strVal)) dateCount++;
          if (/^\d{6,14}$/.test(strVal)) largeIdCount++;
        }
        if (parseNumericValue(val) !== null) {
          numCount++;
        }
      }

      // Bila kolom dominan berupa tanggal atau ID panjang, jangan jadikan metrik
      if (dateCount >= Math.ceil(rows.length * 0.4) || largeIdCount >= Math.ceil(rows.length * 0.5)) {
        continue;
      }

      if (numCount >= Math.ceil(rows.length * 0.5)) {
        numericColIndices.push(colIdx);
      }
    }

    // 2. Identifikasi kolom-kolom kategorikal (untuk pengelompokan/distribusi frekuensi)
    const categoricalCols = [];
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const header = String(headers[colIdx] || '');
      // Lewati kolom nomor dokumen tunggal jika setiap baris nilainya beda
      if (/(?:nomor|no\.|id\b|ebeln|vbeln)/i.test(header) && !/(?:tipe|type|kategori|status|jenis)/i.test(header)) {
        continue;
      }

      const counts = new Map();
      for (const row of rows) {
        const val = String(row[colIdx] ?? '').trim();
        if (val) counts.set(val, (counts.get(val) || 0) + 1);
      }

      const uniqueCount = counts.size;
      if (uniqueCount >= 2 && uniqueCount <= Math.min(16, rows.length)) {
        let score = 10;
        if (/(?:tipe|type|kategori|category|status|jenis|modul)/i.test(header)) score += 50;
        if (/(?:vendor|lifnr|supplier|pemasok|plant|werks|company|bukrs|dibuat|ernam|user)/i.test(header)) score += 30;
        categoricalCols.push({ idx: colIdx, name: header, score });
      }
    }
    categoricalCols.sort((a, b) => b.score - a.score);

    // SKENARIO A: Ada kolom metrik numerik sejati (misal Total Nilai, Harga, Stok, Qty)
    if (numericColIndices.length > 0) {
      const availableColumns = numericColIndices.map((idx) => ({
        idx,
        name: headers[idx] || `Kolom ${idx + 1}`,
      }));

      const activeColIdx =
        selectedColIdx !== null && numericColIndices.includes(selectedColIdx)
          ? selectedColIdx
          : numericColIndices[0];

      // Cari kolom label (kolom non-numerik pertama)
      let labelColIdx = 0;
      for (let c = 0; c < headers.length; c++) {
        if (!numericColIndices.includes(c)) {
          labelColIdx = c;
          break;
        }
      }

      const items = rows.slice(0, 10).map((row, idx) => {
        const rawLabel = String(row[labelColIdx] ?? `Item ${idx + 1}`).trim();
        const rawVal = row[activeColIdx];
        const numVal = parseNumericValue(rawVal) || 0;
        return {
          id: idx,
          label: rawLabel,
          value: numVal,
          formattedValue: rawVal,
          color: PALETTE[idx % PALETTE.length],
        };
      });

      const maxValue = Math.max(...items.map((i) => i.value), 0) || 1;
      const totalValue = items.reduce((acc, i) => acc + (i.value > 0 ? i.value : 0), 0) || 1;
      const colHeader = headers[activeColIdx] || 'Nilai';
      const labelHeader = headers[labelColIdx] || 'Item';

      return {
        items,
        activeColIdx,
        availableColumns,
        isAggregated: false,
        colHeader,
        labelHeader,
        titleText: `Grafik Analisis: ${colHeader}`,
        subtitleText: `Visualisasi ${colHeader} per "${labelHeader}" (${rows.length} baris data)`,
        maxValue,
        totalValue,
        topItem: items.length > 0 ? items.reduce((max, i) => (i.value > max.value ? i : max), items[0]) : null,
      };
    }

    // SKENARIO B: Tabel Dokumen / Kategorikal tanpa kolom nominal uang/kuantitas
    // Lakukan agregasi distribusi frekuensi (COUNT) per kategori
    if (categoricalCols.length > 0) {
      const availableColumns = categoricalCols.map((c) => ({
        idx: c.idx,
        name: c.name,
      }));

      const activeColIdx =
        selectedColIdx !== null && categoricalCols.some((c) => c.idx === selectedColIdx)
          ? selectedColIdx
          : categoricalCols[0].idx;

      const counts = new Map();
      for (const row of rows) {
        const val = String(row[activeColIdx] ?? '').trim();
        if (val) counts.set(val, (counts.get(val) || 0) + 1);
      }

      const sortedCats = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

      // Batasi 8 kategori teratas agar tampilan grafik rapi & luas, sisanya dikelompokkan ke "Lainnya"
      let finalCats = sortedCats.slice(0, 8);
      if (sortedCats.length > 8) {
        const restCount = sortedCats.slice(8).reduce((acc, [, c]) => acc + c, 0);
        finalCats.push(['Lainnya', restCount]);
      }

      const items = finalCats.map(([catName, count], idx) => ({
        id: idx,
        label: catName,
        value: count,
        formattedValue: `${count.toLocaleString('id-ID')} Dokumen`,
        color: PALETTE[idx % PALETTE.length],
      }));

      const maxValue = Math.max(...items.map((i) => i.value), 0) || 1;
      const totalValue = items.reduce((acc, i) => acc + i.value, 0) || 1;
      const colHeader = headers[activeColIdx] || 'Kategori';

      return {
        items,
        activeColIdx,
        availableColumns,
        isAggregated: true,
        colHeader,
        labelHeader: colHeader,
        titleText: `Distribusi Dokumen per ${colHeader}`,
        subtitleText: `Frekuensi pengelompokan dari total ${rows.length} dokumen pembelian`,
        maxValue,
        totalValue,
        topItem: items.length > 0 ? items[0] : null,
      };
    }

    return null;
  }, [headers, rows, selectedColIdx]);

  if (!parsedData || parsedData.items.length === 0) {
    return null;
  }

  const {
    items,
    activeColIdx,
    availableColumns,
    isAggregated,
    titleText,
    subtitleText,
    maxValue,
    totalValue,
    topItem,
  } = parsedData;

  // Dimensi SVG Responsif
  const width = 540;
  const height = 260;
  const isRotated = items.length > 4;
  const padding = { top: 35, right: 30, bottom: isRotated ? 62 : 44, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Download CSV
  const handleExportCsv = () => {
    const csvContent = [
      headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
      ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-chart-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Render Bar Chart
  const renderBarChart = () => {
    const step = items.length > 0 ? chartW / items.length : chartW;
    const barWidth = Math.min(42, Math.max(16, step * 0.65));

    return (
      <g>
        {/* Y Grid Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding.top + chartH * (1 - ratio);
          const val = maxValue * ratio;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                className="text-line"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-content-muted text-[10px] font-mono select-none"
              >
                {formatShortNumber(val)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {items.map((item, idx) => {
          const x = padding.left + idx * step + (step - barWidth) / 2;
          const barHeight = Math.max(3, (item.value / maxValue) * chartH);
          const y = padding.top + chartH - barHeight;
          const isHovered = hoveredItem?.id === item.id;

          return (
            <g
              key={item.id}
              className="transition-all cursor-pointer"
              onMouseEnter={() => setHoveredItem(item)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              {/* Nilai di atas Bar */}
              <text
                x={x + barWidth / 2}
                y={Math.max(16, y - 6)}
                textAnchor="middle"
                className="fill-content-muted text-[10px] font-mono select-none font-semibold"
              >
                {formatShortNumber(item.value)}
              </text>

              {/* Batang Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={5}
                fill={item.color}
                opacity={hoveredItem ? (isHovered ? 1 : 0.4) : 0.88}
                className="transition-opacity duration-150"
              />

              {/* Label Sumbu X */}
              <text
                x={x + barWidth / 2}
                y={height - padding.bottom + (isRotated ? 15 : 18)}
                textAnchor={isRotated ? 'end' : 'middle'}
                transform={isRotated ? `rotate(-32, ${x + barWidth / 2}, ${height - padding.bottom + 15})` : undefined}
                className="fill-content-muted text-[11px] select-none truncate font-medium"
              >
                {item.label.length > (isRotated ? 16 : 10)
                  ? `${item.label.slice(0, isRotated ? 15 : 9)}…`
                  : item.label}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  // Render Line Chart
  const renderLineChart = () => {
    const step = items.length > 1 ? chartW / (items.length - 1) : chartW;
    const points = items.map((item, idx) => {
      const x = padding.left + (items.length > 1 ? idx * step : chartW / 2);
      const y = padding.top + chartH - (item.value / maxValue) * chartH;
      return { x, y, item };
    });

    const pathD = points.reduce(
      (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`,
      ''
    );
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;

    return (
      <g>
        {/* Y Grid Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding.top + chartH * (1 - ratio);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                className="text-line"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-content-muted text-[10px] font-mono select-none"
              >
                {formatShortNumber(maxValue * ratio)}
              </text>
            </g>
          );
        })}

        {/* Gradient fill */}
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#chartGradient)" />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#0284c7"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points & Labels */}
        {points.map(({ x, y, item }) => {
          const isHovered = hoveredItem?.id === item.id;
          return (
            <g
              key={item.id}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredItem(item)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              {/* Nilai di atas titik */}
              <text
                x={x}
                y={Math.max(16, y - 8)}
                textAnchor="middle"
                className="fill-content-muted text-[10px] font-mono select-none font-semibold"
              >
                {formatShortNumber(item.value)}
              </text>

              <circle
                cx={x}
                cy={y}
                r={isHovered ? 6 : 4}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={isHovered ? 2.5 : 2}
                className="transition-all"
              />

              {/* Label Sumbu X */}
              <text
                x={x}
                y={height - padding.bottom + (isRotated ? 15 : 18)}
                textAnchor={isRotated ? 'end' : 'middle'}
                transform={isRotated ? `rotate(-32, ${x}, ${height - padding.bottom + 15})` : undefined}
                className="fill-content-muted text-[11px] select-none font-medium"
              >
                {item.label.length > (isRotated ? 16 : 10)
                  ? `${item.label.slice(0, isRotated ? 15 : 9)}…`
                  : item.label}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  // Render Donut Chart
  const renderDonutChart = () => {
    const cx = 145;
    const cy = height / 2;
    const outerR = 76;
    const innerR = 48;

    let currentAngle = -Math.PI / 2;
    const slices = items.map((item) => {
      const sliceAngle = totalValue > 0 ? (Math.max(0, item.value) / totalValue) * 2 * Math.PI : 0;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const x1 = cx + outerR * Math.cos(startAngle);
      const y1 = cy + outerR * Math.sin(startAngle);
      const x2 = cx + outerR * Math.cos(endAngle);
      const y2 = cy + outerR * Math.sin(endAngle);

      const x3 = cx + innerR * Math.cos(endAngle);
      const y3 = cy + innerR * Math.sin(endAngle);
      const x4 = cx + innerR * Math.cos(startAngle);
      const y4 = cy + innerR * Math.sin(startAngle);

      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const pathD = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`;

      const percent = totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : '0';

      return {
        item,
        pathD,
        percent,
      };
    });

    return (
      <g>
        {/* Donut Slices */}
        {slices.map(({ item, pathD, percent }) => {
          const isHovered = hoveredItem?.id === item.id;
          return (
            <path
              key={item.id}
              d={pathD}
              fill={item.color}
              opacity={hoveredItem ? (isHovered ? 1 : 0.4) : 0.92}
              className="transition-opacity cursor-pointer duration-150"
              onMouseEnter={() => setHoveredItem({ ...item, percent })}
              onMouseLeave={() => setHoveredItem(null)}
            />
          );
        })}

        {/* Center Label */}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          className="fill-content font-bold text-xs select-none"
        >
          {hoveredItem?.percent ? `${hoveredItem.percent}%` : 'Total'}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-content-muted text-[11px] select-none font-mono font-semibold"
        >
          {hoveredItem?.value !== undefined
            ? formatShortNumber(hoveredItem.value)
            : formatShortNumber(totalValue)}
        </text>

        {/* Legend on the right */}
        <g transform="translate(265, 30)">
          {items.slice(0, 8).map((item, idx) => {
            const percent = totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : '0';
            const isHovered = hoveredItem?.id === item.id;
            return (
              <g
                key={item.id}
                transform={`translate(0, ${idx * 24})`}
                className="cursor-pointer transition-opacity"
                opacity={hoveredItem ? (isHovered ? 1 : 0.5) : 1}
                onMouseEnter={() => setHoveredItem({ ...item, percent })}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <circle cx={6} cy={6} r={5} fill={item.color} />
                <text
                  x={18}
                  y={9}
                  className="fill-content text-[11px] select-none truncate font-medium"
                >
                  {item.label.length > 15 ? `${item.label.slice(0, 14)}…` : item.label}
                </text>
                <text
                  x={190}
                  y={9}
                  textAnchor="end"
                  className="fill-content-muted font-mono text-[10px] select-none"
                >
                  {percent}%
                </text>
              </g>
            );
          })}
        </g>
      </g>
    );
  };

  return (
    <div className="my-3 rounded-2xl border border-line bg-surface-raised shadow-xs overflow-hidden max-w-2xl transition-all">
      {/* Chart Header & Interactive Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 bg-surface-sunken border-b border-line">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-content truncate">
              {title || titleText}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface border border-line text-content-muted font-mono shrink-0">
              {totalValue.toLocaleString('id-ID')} {isAggregated ? 'dokumen' : 'total'}
            </span>
          </div>
          <span className="text-[11px] text-content-muted mt-0.5 truncate">
            {subtitleText}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Interactive Grouping / Column Selector */}
          {availableColumns.length > 1 && (
            <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-lg border border-line shadow-2xs">
              <span className="text-[11px] text-content-muted font-medium">{t('chart.group')}:</span>
              <select
                value={activeColIdx}
                onChange={(e) => setSelectedColIdx(Number(e.target.value))}
                aria-label={t('chart.group')}
                className="text-xs bg-transparent text-content font-semibold cursor-pointer focus:outline-none"
              >
                {availableColumns.map((col) => (
                  <option key={col.idx} value={col.idx} className="bg-surface text-content">
                    {col.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Chart Type Toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-surface border border-line">
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`p-1 rounded-md transition-colors ${
                chartType === 'bar'
                  ? 'bg-surface-raised text-accent shadow-xs'
                  : 'text-content-muted hover:text-content'
              }`}
              title={t('chart.bar')}
              aria-label={t('chart.bar')}
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartType('line')}
              className={`p-1 rounded-md transition-colors ${
                chartType === 'line'
                  ? 'bg-surface-raised text-accent shadow-xs'
                  : 'text-content-muted hover:text-content'
              }`}
              title={t('chart.line')}
              aria-label={t('chart.line')}
            >
              <LineChart className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartType('donut')}
              className={`p-1 rounded-md transition-colors ${
                chartType === 'donut'
                  ? 'bg-surface-raised text-accent shadow-xs'
                  : 'text-content-muted hover:text-content'
              }`}
              title={t('chart.donut')}
              aria-label={t('chart.donut')}
            >
              <PieChart className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-content-muted hover:text-content bg-surface hover:bg-surface-hover border border-line rounded-lg transition-colors cursor-pointer"
            title={t('chart.downloadCsv')}
            aria-label={t('chart.downloadCsv')}
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="p-3 relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-72 select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          {chartType === 'bar' && renderBarChart()}
          {chartType === 'line' && renderLineChart()}
          {chartType === 'donut' && renderDonutChart()}
        </svg>

        {/* Floating Tooltip if Hovered */}
        {hoveredItem && (
          <div className="absolute top-4 right-4 bg-surface border border-line rounded-xl px-3 py-2 shadow-md pointer-events-none text-xs animate-in fade-in duration-100 z-10">
            <div className="font-semibold text-content">{hoveredItem.label}</div>
            <div className="text-content-muted font-mono text-[11px] flex items-center gap-2 mt-1">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: hoveredItem.color }}
              />
              <span className="font-semibold text-content">
                {hoveredItem.formattedValue || hoveredItem.value.toLocaleString('id-ID')}
              </span>
              {hoveredItem.percent && <span className="text-content-subtle">({hoveredItem.percent}%)</span>}
            </div>
          </div>
        )}
      </div>

      {/* Chart Description & Summary Footer */}
      <div className="px-4 py-2.5 bg-surface-sunken/60 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {topItem && (
            <div className="flex items-center gap-1.5 text-content text-[11px]">
              <span className="text-content-muted">{t('chart.highest')}:</span>
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                style={{ backgroundColor: topItem.color }}
              />
              <span className="font-semibold text-content">{topItem.label}</span>
              <span className="font-mono text-content-muted">
                ({formatShortNumber(topItem.value)} • {totalValue > 0 ? ((topItem.value / totalValue) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          )}
          <span className="text-line hidden sm:inline">•</span>
          <span className="text-[11px] text-content-muted">
            Total: <strong className="text-content font-mono">{totalValue.toLocaleString('id-ID')}</strong> {isAggregated ? 'dokumen' : 'total'}
          </span>
        </div>

        <div className="text-[11px] text-content-muted flex items-center gap-1">
          <span className="text-accent">💡</span>
          <span>{t('chart.hoverDetail')}</span>
        </div>
      </div>
    </div>
  );
}
