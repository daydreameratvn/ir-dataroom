import { Outlet } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <Outlet />
    </div>
  );
}
