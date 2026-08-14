import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminApp } from './pages/Admin/AdminApp';
import { PublicSearch } from './pages/PublicSearch/PublicSearch';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicSearch />} />
        <Route path="/admin" element={<AdminApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
