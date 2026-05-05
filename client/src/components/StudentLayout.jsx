import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import DashboardSidebar from './DashboardSidebar';
import Chat from './Chat';
import API_BASE_URL from '../config/api';

export default function StudentLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showChat, setShowChat] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  const navItems = [
    { label: 'Dashboard', route: '/dashboard', icon: 'grid' },
    { label: 'Courses', route: '/courses', icon: 'book' },
    { label: 'Coding Wrench', route: '/workbench', icon: 'code' },
    { label: 'Tests', route: '/test', icon: 'check' },
    { label: 'Profile', route: '/profile', icon: 'user' }
  ];

  const logout = () => {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('timetracker_session')) localStorage.removeItem(key);
    });
    localStorage.removeItem('token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_data');
    navigate('/');
  };

  const fetchUnreadMessages = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const rooms = await response.json();
      if (Array.isArray(rooms)) {
        setMessageCount(rooms.reduce((total, room) => total + (parseInt(room.unread_count, 10) || 0), 0));
      }
    } catch (err) {
      console.error('[StudentLayout] Message count error:', err);
    }
  }, []);

  useEffect(() => {
    fetchUnreadMessages();
    const interval = setInterval(fetchUnreadMessages, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadMessages]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar
        title="STUDENTDASH"
        subtitle="Student portal"
        navItems={navItems.map((item) => ({
          ...item,
          active: location.pathname === item.route || (item.route === '/workbench' && location.pathname === '/courses/code'),
          onClick: () => navigate(item.route)
        }))}
        actions={[
          { label: 'Security', icon: 'lock', onClick: () => navigate('/setup-authenticator') },
          { label: 'Logout', icon: 'logout', danger: true, onClick: logout }
        ]}
      />

      <div className="student-layout-main">
        <header className="student-layout-topbar">
          <p>{navItems.find((item) => item.route === location.pathname)?.label || 'Student Workspace'}</p>
          <div className="student-topbar-actions">
            <button
              type="button"
              onClick={() => setShowChat(true)}
              className="student-message-button"
              title="Messages"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {messageCount > 0 && (
                <span className="student-message-badge">{messageCount > 9 ? '9+' : messageCount}</span>
              )}
            </button>
            <NotificationBell />
            <button type="button" className="student-user-chip">Student</button>
          </div>
        </header>
        {children}
      </div>
      {showChat && <Chat onClose={() => { setShowChat(false); fetchUnreadMessages(); }} />}
    </div>
  );
}
