import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config/api';

export default function ProgressTracker() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/student/progress`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setProgress(data);
      } catch (err) {
        console.error("Failed to load progress:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProgress();
  }, []);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50 font-black text-emerald-500 animate-pulse">
      Loading progress...
    </div>
  );

  const testsCompleted = progress?.tests_completed || 0;
  const totalTests = progress?.total_tests_assigned || 0;
  const overdueTests = progress?.tests_overdue || 0;
  const avgScore = progress?.average_score || 0;
  const completionRate = totalTests > 0 ? Math.round((testsCompleted / totalTests) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#fdfdfd] p-8 lg:p-12 font-sans text-slate-800">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-slate-400 hover:text-emerald-600 font-medium transition-colors mb-12 text-sm"
        >
          Back to Dashboard
        </button>

        <header className="mb-12">
          <h1 className="text-3xl font-bold text-slate-900">Your Growth Journey</h1>
          <p className="text-slate-500 mt-2">Track your test performance and progress.</p>
        </header>

        {/* STATS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Total Tests</p>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-4xl font-bold text-slate-800">{totalTests}</span>
            </div>
            <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
              <div className="h-full bg-slate-400 transition-all duration-1000" style={{ width: '100%' }}></div>
            </div>
          </div>
          
          <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4">Completed</p>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-4xl font-bold text-emerald-600">{testsCompleted}</span>
            </div>
            <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${completionRate}%` }}></div>
            </div>
          </div>
          
          <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-4">Overdue</p>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-4xl font-bold text-red-600">{overdueTests}</span>
            </div>
            <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: overdueTests > 0 ? '100%' : '0%' }}></div>
            </div>
          </div>
          
          <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">Avg Score</p>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-4xl font-bold text-blue-600">{avgScore}%</span>
            </div>
            <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${avgScore}%` }}></div>
            </div>
          </div>
        </div>

        {/* PROGRESS SUMMARY */}
        <section className="bg-white border border-slate-100 rounded-[2.5rem] p-8 lg:p-10 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-8">Progress Summary</h2>
          
          {totalTests === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400 font-medium">No tests assigned yet. Check back later!</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-6 bg-emerald-50 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white font-black text-xl">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Tests Completed</p>
                    <p className="text-sm text-slate-500">You've finished {testsCompleted} out of {totalTests} tests</p>
                  </div>
                </div>
                <span className="text-3xl font-black text-emerald-600">{completionRate}%</span>
              </div>
              
              {overdueTests > 0 && (
                <div className="flex items-center justify-between p-6 bg-red-50 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-black text-xl">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Overdue Tests</p>
                      <p className="text-sm text-slate-500">You have {overdueTests} test{overdueTests > 1 ? 's' : ''} past the deadline</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => navigate('/test')}
                    className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700"
                  >
                    Take Now
                  </button>
                </div>
              )}
              
              <div className="flex items-center justify-between p-6 bg-blue-50 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-black text-xl">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Average Performance</p>
                    <p className="text-sm text-slate-500">Your overall test score average</p>
                  </div>
                </div>
                <span className="text-3xl font-black text-blue-600">{avgScore}%</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}