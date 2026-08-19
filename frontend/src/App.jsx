import React from 'react';
import ChatLayout from './components/ChatLayout';

/**
 * Shell aplikasi.
 *
 * Sebelumnya berkas ini menduplikasi seluruh state ChatLayout (user, sesi,
 * pesan, tema) dan meneruskannya sebagai props — padahal ChatLayout tidak
 * menerima props sama sekali, sehingga ~390 baris logika di sini tidak pernah
 * dieksekusi sementara dua komponen berebut key localStorage yang sama.
 * State kini hanya hidup di satu tempat.
 */
function App() {
  return <ChatLayout />;
}

export default App;
