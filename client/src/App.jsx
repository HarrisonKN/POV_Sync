import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import CreateSession from './pages/CreateSession';
import JoinSession from './pages/JoinSession';
import Viewer from './pages/Viewer';
import Spectator from './pages/Spectator';
import Profile from './pages/Profile';
import Setup from './pages/Setup';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-pov-bg text-pov-text flex flex-col">
          <Navbar />
          <main className="flex-1">
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Home />} />
              <Route path="/watch/:code" element={<Spectator />} />

              {/* Auth required */}
              <Route
                path="/create"
                element={
                  <ProtectedRoute>
                    <CreateSession />
                  </ProtectedRoute>
                }
              />
              <Route path="/join/:code" element={<JoinSession />} />
              <Route path="/join" element={<JoinSession />} />
              <Route
                path="/session/:sessionId"
                element={
                  <ProtectedRoute>
                    <Viewer />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/setup" element={<Setup />} />

              {/* 404 */}
              <Route
                path="*"
                element={
                  <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="text-center">
                      <h1 className="text-4xl font-bold font-mono mb-2">404</h1>
                      <p className="text-sm text-pov-muted">Page not found</p>
                    </div>
                  </div>
                }
              />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
