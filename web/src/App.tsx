import { ReactNode, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, Link } from 'react-router-dom';
import { Avatar, Dropdown, Spin } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useApp } from './store';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OnboardingPage from './pages/OnboardingPage';
import ChatPage from './pages/ChatPage';
import TravelPage from './pages/TravelPage';
import ProfilePage from './pages/ProfilePage';

function displayName(user: { username?: string; email?: string; phone?: string } | null) {
  if (!user) return '我';
  if (user.username) return user.username;
  if (user.email) return user.email.split('@')[0];
  if (user.phone) return user.phone.slice(0, 3) + '****' + user.phone.slice(7);
  return '我';
}

function AppShell({ children }: { children: ReactNode }) {
  const user = useApp((state) => state.user);
  const logout = useApp((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', label: '聊天' },
    { path: '/travel', label: '我的旅行' },
    { path: '/profile', label: '个人中心' },
  ];
  const isActive = (path: string) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="途忆 logo" />
          途忆
        </Link>
        <nav className="app-nav">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path} className={isActive(item.path) ? 'active' : ''}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Dropdown
          menu={{
            items: [
              { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: onLogout },
            ],
          }}
        >
          <a style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Avatar size={28} style={{ background: '#0ea5e9' }} icon={<UserOutlined />} />
            <span style={{ fontSize: 14 }}>{displayName(user)}</span>
          </a>
        </Dropdown>
      </header>
      {children}
    </>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const user = useApp((state) => state.user);
  const booted = useApp((state) => state.booted);
  const fetchUser = useApp((state) => state.fetchUser);

  useEffect(() => {
    if (!booted) fetchUser();
  }, [booted, fetchUser]);

  if (!booted) {
    return (
      <div className="centered-spin">
        <Spin size="large" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/onboarding"
        element={
          <Protected>
            <OnboardingPage />
          </Protected>
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <ChatPage />
          </Protected>
        }
      />
      <Route
        path="/travel"
        element={
          <Protected>
            <TravelPage />
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            <ProfilePage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
