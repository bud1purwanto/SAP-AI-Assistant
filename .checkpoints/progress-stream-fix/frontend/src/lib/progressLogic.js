export const computeTargetPercent = (progress) => {
  if (!progress) return 10;
  const stage = progress.stage;
  if (stage === 'done') return 100;
  if (stage === 'reconnecting') return 75;

  // Baca max_steps secara dinamis dari setting mode yang aktif (fallback 15 jika tidak tersedia)
  const maxSteps = Math.max(Number(progress.max_steps) || 15, 1);
  const step = Math.max(Number(progress.step) || 0, 0);
  const stepRatio = Math.min(step / maxSteps, 1);

  switch (stage) {
    case 'connecting':
      return 15;
    case 'reading':
      return 25;
    case 'thinking':
      // Langkah awal (analisis pertanyaan sebelum panggil tool)
      if (step <= 1) return 32;
      // Langkah perumusan jawaban dari data: bergerak dinamis 62% - 88% sesuai stepRatio
      return Math.min(Math.round(62 + stepRatio * 26), 88);
    case 'tool':
      // Eksekusi pengambilan data: bergerak dinamis 36% - 65% sesuai stepRatio
      return Math.min(Math.round(36 + stepRatio * 28), 65);
    case 'investigating':
      return Math.min(Math.round(28 + stepRatio * 20), 50);
    case 'reviewing':
      return Math.min(Math.round(88 + stepRatio * 8), 96);
    case 'building':
      // Menyiapkan berkas dokumen hasil (Excel/CSV/dokumen)
      return 92;
    default:
      return 20;
  }
};

export function advanceProgress(prev, target, isDone, tick) {
  if (isDone) return Math.min(prev + 1, 100);
  if (prev < target) return prev + 1;
  if (tick % 12 === 0 && prev < 92 && prev < target + 6) return prev + 1;
  return prev;
}
