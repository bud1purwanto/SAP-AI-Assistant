import { useEffect, useState } from 'react';

/**
 * Landscape "pendek" (mis. iPhone 12 mini diputar: 812x375).
 *
 * Lebarnya melewati breakpoint `md` Tailwind sehingga sidebar berubah menjadi
 * kolom permanen selebar 288px — di layar setinggi 375px itu memakan ruang
 * yang seharusnya dipakai percakapan. Hook ini dipakai untuk mengembalikan
 * sidebar menjadi drawer pada kondisi tersebut.
 */
const QUERY = '(orientation: landscape) and (max-height: 500px)';

export function useCompactLandscape() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setCompact(e.matches);
    setCompact(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return compact;
}

export default useCompactLandscape;
