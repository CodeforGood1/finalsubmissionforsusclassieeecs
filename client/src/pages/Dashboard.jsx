import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationBell from '../components/NotificationBell';
import LiveSessionsCalendar from '../components/LiveSessionsCalendar';
import Chat from '../components/Chat';
import DashboardSidebar from '../components/DashboardSidebar';
import PageTitle from '../components/PageTitle';
import API_BASE_URL from '../config/api';

function Dashboard() {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [recentModules, setRecentModules] = useState([]);
  const [stats, setStats] = useState({ modulesCompleted: 0, totalModules: 0, streak: 0 });
  const [showChat, setShowChat] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    fetchUnreadMessages();
    const interval = setInterval(fetchUnreadMessages, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUnreadMessages = async () => {
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
      console.error('[Dashboard] Message count error:', err);
    }
  };

  const fetchDashboardData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const userRes = await fetch(`${API_BASE_URL}/api/student/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (userRes.ok) setUserInfo(await userRes.json());

      const modulesRes = await fetch(`${API_BASE_URL}/api/student/recent-modules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (modulesRes.ok) {
        const modulesData = await modulesRes.json();
        setRecentModules(Array.isArray(modulesData) ? modulesData.slice(0, 3) : []);
      }

      const statsRes = await fetch(`${API_BASE_URL}/api/student/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Dashboard data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    {
      title: 'Continue Learning',
      desc: 'Resume your modules',
      route: '/courses',
      color: 'rose',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    },
    {
      title: 'Practice Coding',
      desc: 'Solve problems',
      route: '/workbench',
      color: 'blue',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      )
    },
    {
      title: 'Take a Quiz',
      desc: 'Test your knowledge',
      route: '/test',
      color: 'purple',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      )
    },
    {
      title: 'View Progress',
      desc: 'Track your growth',
      route: '/progress',
      color: 'amber',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    }
  ];

  const colorMap = {
    rose: { bg: 'bg-[#fff1ea]', hover: 'hover:bg-[#ffe6db]', text: 'text-[#f1764f]' },
    blue: { bg: 'bg-[#eef4ff]', hover: 'hover:bg-[#e0ecff]', text: 'text-blue-700' },
    purple: { bg: 'bg-[#f4eef6]', hover: 'hover:bg-[#eaddea]', text: 'text-[#6f536d]' },
    amber: { bg: 'bg-[#fff8e7]', hover: 'hover:bg-[#fff0c7]', text: 'text-amber-700' }
  };

  const statCards = [
    { label: 'Meetings today', value: stats.modulesCompleted, tone: 'text-[#101828]', note: 'View all' },
    { label: 'Pending tasks', value: stats.totalModules, tone: 'text-[#101828]', note: 'View all' },
    { label: 'Streak', value: stats.streak, tone: 'text-amber-700', note: 'days in rhythm' }
  ];

  const navItems = [
    { label: 'Dashboard', route: '/dashboard', icon: 'grid', active: true },
    { label: 'Courses', route: '/courses', icon: 'book' },
    { label: 'Coding Wrench', route: '/workbench', icon: 'code' },
    { label: 'Tests', route: '/test', icon: 'check' },
    { label: 'Profile', route: '/profile', icon: 'user' }
  ];

  return (
    <div className="app-shell">
      <nav className="topbar sticky top-0 z-30 px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="brand-mark">S</div>
            <div>
              <span className="block text-sm font-black text-[#101828]">STUDENTDASH</span>
              <span className="text-xs font-semibold text-[#667085]">Student workspace</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowChat(true)}
              className="student-message-button"
              title="Messages"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {messageCount > 0 && (
                <span className="student-message-badge">{messageCount > 9 ? '9+' : messageCount}</span>
              )}
            </button>
            <NotificationBell />
          </div>
        </div>
      </nav>

      <main className="w-full p-0">
        <div className="dashboard-grid">
          <DashboardSidebar
            title="STUDENTDASH"
            subtitle="Student portal"
            navItems={navItems.map((item) => ({ ...item, onClick: () => navigate(item.route) }))}
            actions={[
              { label: 'Security', icon: 'lock', onClick: () => navigate('/setup-authenticator') },
              { label: 'Logout', icon: 'logout', danger: true, onClick: () => { localStorage.removeItem('token'); localStorage.removeItem('user_role'); localStorage.removeItem('user_data'); navigate('/'); } }
            ]}
          />

          <div className="student-dashboard-content min-w-0 p-4 md:p-6 lg:p-8">
            <header className="mb-6 flex items-start justify-between gap-3">
              <PageTitle first="Student" second="Dashboard" className="mb-0" />
              <div className="hidden items-center gap-4 lg:flex">
                <NotificationBell />
                <button onClick={() => setShowChat(true)} className="student-message-button student-message-button-wide">
                  <span>Messages</span>
                  {messageCount > 0 && (
                    <span className="student-message-badge student-message-badge-inline">{messageCount > 9 ? '9+' : messageCount}</span>
                  )}
                </button>
                <button onClick={() => { localStorage.removeItem('token'); navigate('/'); }} className="text-xs font-bold text-[#667085] hover:text-[#f1764f]">Logout</button>
              </div>
            </header>

            <section className="hero-panel mb-5 overflow-hidden p-5 md:p-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="section-label mb-2">Today&apos;s classroom</p>
                  {loading ? (
                    <>
                      <div className="skeleton mb-3 h-8 w-64 max-w-full rounded-lg" />
                      <div className="skeleton h-4 w-[34rem] max-w-full rounded" />
                    </>
                  ) : (
                    <>
                      <h2 className="max-w-3xl text-3xl font-black leading-tight tracking-tight text-[#101828] md:text-4xl">
                        Welcome back{userInfo?.full_name ? `, ${userInfo.full_name.split(' ')[0]}` : ''}.
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[#667085]">
                        Your next class, messages, and learning progress are arranged around what needs attention first.
                      </p>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:flex">
                  <button onClick={() => navigate('/courses')} className="btn-primary min-h-10 px-5 text-sm">Continue</button>
                  <button onClick={() => setShowChat(true)} className="btn-secondary min-h-10 px-5 text-sm">Messages</button>
                </div>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {statCards.map((stat) => (
                    <div key={stat.label} className="metric-card p-4">
                      {loading ? (
                        <>
                          <div className="skeleton mb-4 h-9 w-16 rounded-lg" />
                          <div className="skeleton h-3 w-24 rounded" />
                        </>
                      ) : (
                        <>
                          <p className="text-[11px] font-medium text-[#667085]">{stat.label}</p>
                          <p className={`mt-2 text-2xl font-black ${stat.tone}`}>{stat.value}</p>
                          <p className="mt-4 text-xs font-medium text-[#667085]">{stat.note} <span className="ml-1">&gt;</span></p>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <section className="ui-card p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="section-label">Quick Actions</h2>
                    <span className="hidden text-xs font-bold text-[#667085] sm:inline">Built for classroom routines</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {quickActions.map((action) => {
                      const colors = colorMap[action.color];
                      return (
                        <button
                          key={action.title}
                          onClick={() => navigate(action.route)}
                          className={`rounded-xl border border-black/5 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${colors.bg} ${colors.hover}`}
                        >
                          <div className={`${colors.text} mb-4 inline-flex rounded-xl bg-white/80 p-2.5 shadow-sm`}>{action.icon}</div>
                          <p className="text-sm font-black text-[#101828]">{action.title}</p>
                          <p className="mt-1 text-sm font-medium text-[#667085]">{action.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="ui-card p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="section-label">Continue Learning</h2>
                    <button onClick={() => navigate('/courses')} className="text-xs font-black text-[#f1764f] hover:text-[#d95d38]">View all</button>
                  </div>
                  {loading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="rounded-2xl border border-[#e8dde3] p-4">
                          <div className="skeleton mb-3 h-4 w-2/3 rounded" />
                          <div className="skeleton h-3 w-1/3 rounded" />
                        </div>
                      ))}
                    </div>
                  ) : recentModules.length > 0 ? (
                    <div className="grid gap-3">
                      {recentModules.map((module, idx) => (
                        <button
                          key={idx}
                          onClick={() => navigate(`/learning/${module.id}`)}
                          className="flex flex-col gap-3 rounded-xl border border-[#e7eaf0] bg-white p-4 text-left transition-all hover:border-[#f1764f]/30 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[#101828]">{module.topic_title}</p>
                            <p className="text-xs font-medium text-[#667085]">{module.subject} - {module.section}</p>
                          </div>
                          <div className="flex min-w-[150px] items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f2e7ed] sm:w-24 sm:flex-none">
                              <div className="h-full rounded-full bg-[#f1764f]" style={{ width: `${Math.round(module.progress || 0)}%` }} />
                            </div>
                            <div className="text-xs font-black text-[#667085]">{Math.round(module.progress || 0)}%</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#d0d5dd] bg-[#f7f8fb] p-8 text-center">
                      <p className="text-sm font-black text-[#101828]">No recent modules yet</p>
                      <p className="mt-1 text-sm font-medium text-[#667085]">Open courses to start your first lesson.</p>
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-4">
                <section className="accent-panel p-4">
                  <p className="section-label text-white/50">Priority</p>
                  <h2 className="mt-3 text-xl font-black">Plan your next class block.</h2>
                  <p className="mt-3 text-sm font-medium leading-6 text-white/60">
                    Review live classes, then continue the module with the lowest progress.
                  </p>
                </section>

                <section>
                  <h2 className="section-label mb-3">Live Classes</h2>
                  <LiveSessionsCalendar userType="student" />
                </section>
              </aside>
            </div>
          </div>
        </div>
      </main>

      {showChat && <Chat onClose={() => { setShowChat(false); fetchUnreadMessages(); }} />}
    </div>
  );
}

export default Dashboard;
