import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import CreateSession from './pages/CreateSession';
import JoinSession from './pages/JoinSession';
import Viewer from './pages/Viewer';
import Spectator from './pages/Spectator';
import RoleSelect from './pages/RoleSelect';
import Profile from './pages/Profile';
import Setup from './pages/Setup';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';
import Footer from './components/Footer';

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
              <Route path="/room/:code" element={<RoleSelect />} />

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
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/contact" element={<Contact />} />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
