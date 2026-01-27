import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TimeTracker from '../components/TimeTracker';
import NotificationBell from '../components/NotificationBell';
import API_BASE_URL from '../config/api';

function Dashboard() {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [recentModules, setRecentModules] = useState([]);
  const [upcomingLive, setUpcomingLive] = useState([]);
  const [stats, setStats] = useState({ modulesCompleted: 0, totalModules: 0, streak: 0 });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      // Fetch user info
      const userRes = await fetch(`${API_BASE_URL}/api/student/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        setUserInfo(userData);
      }

      // Fetch recent modules
      const modulesRes = await fetch(`${API_BASE_URL}/api/student/recent-modules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (modulesRes.ok) {
        const modulesData = await modulesRes.json();
        setRecentModules(Array.isArray(modulesData) ? modulesData.slice(0, 3) : []);
      }

      // Fetch progress stats
      const statsRes = await fetch(`${API_BASE_URL}/api/student/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error('Dashboard data error:', err);
    }
  };

  const quickActions = [
    { title: 'Continue Learning', desc: 'Resume your modules', route: '/courses', color: 'emerald', icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    )},
    { title: 'Practice Coding', desc: 'Solve problems', route: '/workbench', color: 'blue', icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    )},
    { title: 'Take a Quiz', desc: 'Test your knowledge', route: '/test', color: 'purple', icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )},
    { title: 'View Progress', desc: 'Track your growth', route: '/progress', color: 'amber', icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )}
  ];

  const colorMap = {
    emerald: { bg: 'bg-emerald-50', hover: 'hover:bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-200' },
    blue: { bg: 'bg-blue-50', hover: 'hover:bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
    purple: { bg: 'bg-purple-50', hover: 'hover:bg-purple-100', text: 'text-purple-600', border: 'border-purple-200' },
    amber: { bg: 'bg-amber-50', hover: 'hover:bg-amber-100', text: 'text-amber-600', border: 'border-amber-200' }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">S</div>
            <span className="font-bold text-slate-700">Sustainable Classroom</span>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <button onClick={() => navigate('/profile')} className="text-sm text-slate-600 hover:text-emerald-600">
              {userInfo?.full_name || 'Profile'}
            </button>
            <button onClick={() => { localStorage.removeItem('token'); navigate('/'); }} 
              className="text-sm text-slate-400 hover:text-red-500">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
        {/* Welcome Section */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">
            Welcome back{userInfo?.full_name ? `, ${userInfo.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-slate-500 mt-1">Continue where you left off or start something new.</p>
        </header>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <p className="text-3xl font-bold text-emerald-600">{stats.modulesCompleted}</p>
            <p className="text-sm text-slate-500 mt-1">Modules Completed</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <p className="text-3xl font-bold text-blue-600">{stats.totalModules}</p>
            <p className="text-sm text-slate-500 mt-1">Total Modules</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <p className="text-3xl font-bold text-amber-600">{stats.streak}</p>
            <p className="text-sm text-slate-500 mt-1">Day Streak</p>
          </div>
        </div>

        {/* Quick Actions */}
        <section className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action) => {
              const colors = colorMap[action.color];
              return (
                <button
                  key={action.title}
                  onClick={() => navigate(action.route)}
                  className={`p-6 rounded-2xl ${colors.bg} ${colors.hover} border ${colors.border} text-left transition-all group`}
                >
                  <div className={`${colors.text} mb-3`}>{action.icon}</div>
                  <p className="font-bold text-slate-800">{action.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{action.desc}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Recent Modules */}
        {recentModules.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Continue Learning</h2>
            <div className="grid gap-4">
              {recentModules.map((module, idx) => (
                <button
                  key={idx}
                  onClick={() => navigate(`/learning/${module.id}`)}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-emerald-300 transition-all flex justify-between items-center text-left"
                >
                  <div>
                    <p className="font-bold text-slate-800">{module.topic_title}</p>
                    <p className="text-sm text-slate-500">{module.subject} - {module.section}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-400">{module.progress || 0}% complete</div>
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* All Modules Link */}
        <section>
          <button
            onClick={() => navigate('/courses')}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all"
          >
            View All Learning Modules
          </button>
        </section>
      </main>
      
      {/* Time Tracker Widget */}
      <TimeTracker />
    </div>
  );
}

export default Dashboard;