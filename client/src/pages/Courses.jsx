import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config/api';

function Courses() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const token = localStorage.getItem('token');

  const fetchMyModules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/my-modules`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      setModules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    fetchMyModules();
  }, [fetchMyModules, navigate, token]);

  // Group modules by subject (case-insensitive: "New" / "NEW" / "new" → same group)
  const subjectGroups = useMemo(() => {
    const groups = {};
    modules.forEach(mod => {
      const subj = (mod.subject || 'General').toLowerCase();
      if (!groups[subj]) {
        groups[subj] = { name: subj, modules: [], totalSteps: 0, completedSteps: 0 };
      }
      groups[subj].modules.push(mod);
      groups[subj].totalSteps += (mod.step_count || 0);
      groups[subj].completedSteps += (parseInt(mod.completed_steps) || 0);
    });
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [modules]);

  // Find the most recent in-progress module (for "Continue where you left off")
  const resumeModule = useMemo(() => {
    const inProgress = modules.filter(m => {
      const completed = parseInt(m.completed_steps) || 0;
      const total = m.step_count || 0;
      return total > 0 && completed > 0 && completed < total;
    });
    if (inProgress.length > 0) return inProgress[0];
    const notStarted = modules.filter(m => (parseInt(m.completed_steps) || 0) === 0 && (m.step_count || 0) > 0);
    return notStarted.length > 0 ? notStarted[0] : null;
  }, [modules]);

  const getProgressPercent = (mod) => {
    const total = mod.step_count || 0;
    if (total === 0) return 0;
    return Math.round(((parseInt(mod.completed_steps) || 0) / total) * 100);
  };

  const getSubjectProgress = (group) => {
    if (group.totalSteps === 0) return 0;
    return Math.round((group.completedSteps / group.totalSteps) * 100);
  };

  const getStatusLabel = (mod) => {
    const pct = getProgressPercent(mod);
    if (pct === 100) return { text: 'Completed', color: 'emerald' };
    if (pct > 0) return { text: `${pct}% Complete`, color: 'blue' };
    return { text: 'Not Started', color: 'slate' };
  };

  const subjectColors = ['emerald', 'blue', 'purple', 'amber', 'rose', 'teal', 'indigo', 'orange'];
  const getSubjectColor = (idx) => subjectColors[idx % subjectColors.length];

  const colorClasses = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'bg-emerald-500', bar: 'bg-emerald-500', hover: 'hover:border-emerald-400' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'bg-blue-500', bar: 'bg-blue-500', hover: 'hover:border-blue-400' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: 'bg-purple-500', bar: 'bg-purple-500', hover: 'hover:border-purple-400' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'bg-amber-500', bar: 'bg-amber-500', hover: 'hover:border-amber-400' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', icon: 'bg-rose-500', bar: 'bg-rose-500', hover: 'hover:border-rose-400' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', icon: 'bg-teal-500', bar: 'bg-teal-500', hover: 'hover:border-teal-400' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', icon: 'bg-indigo-500', bar: 'bg-indigo-500', hover: 'hover:border-indigo-400' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: 'bg-orange-500', bar: 'bg-orange-500', hover: 'hover:border-orange-400' },
  };

  // ============ SUBJECT VIEW ============
  if (!selectedSubject) {
    return (
      <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-12 text-slate-900 font-sans">
        <div className="max-w-6xl mx-auto">
          <button 
            onClick={() => navigate('/dashboard')}
            className="mb-8 flex items-center gap-2 text-slate-500 hover:text-emerald-600 font-semibold transition-all text-sm group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to Dashboard
          </button>

          <header className="mb-8">
            <h1 className="text-4xl font-black tracking-tight text-slate-900">My Subjects</h1>
            <p className="text-slate-500 mt-2 text-lg">
              {modules.length} module{modules.length !== 1 ? 's' : ''} across {subjectGroups.length} subject{subjectGroups.length !== 1 ? 's' : ''}
            </p>
          </header>

          {/* Resume Learning Banner */}
          {resumeModule && (
            <div 
              onClick={() => navigate(`/learning/${resumeModule.id}`)}
              className="mb-10 cursor-pointer group relative overflow-hidden rounded-[2rem] bg-slate-900 text-white p-8 shadow-lg hover:shadow-2xl transition-all"
            >
              <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Continue where you left off</p>
                  <h2 className="text-xl font-bold">{resumeModule.topic_title}</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    {resumeModule.subject || 'General'} · {getProgressPercent(resumeModule)}% complete
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-32 h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${getProgressPercent(resumeModule)}%` }}></div>
                  </div>
                  <span className="text-xs font-black text-emerald-400 uppercase group-hover:translate-x-1 transition-transform">Resume →</span>
                </div>
              </div>
            </div>
          )}

          {/* Tools Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <div
              onClick={() => navigate('/courses/code')}
              className="group cursor-pointer p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 flex items-center justify-center rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Coding Workbench</h3>
                  <p className="text-xs text-slate-500">Practice in a sandbox environment</p>
                </div>
              </div>
            </div>
            <div
              onClick={() => navigate('/test')}
              className="group cursor-pointer p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-50 text-purple-600 flex items-center justify-center rounded-xl group-hover:bg-purple-500 group-hover:text-white transition-all">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Take a Quiz</h3>
                  <p className="text-xs text-slate-500">Test your knowledge</p>
                </div>
              </div>
            </div>
          </div>

          {/* Subject Cards */}
          <section>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Browse by Subject</h3>
            
            {loading ? (
              <div className="py-20 text-center text-slate-400 font-medium italic animate-pulse">
                Loading your subjects...
              </div>
            ) : subjectGroups.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {subjectGroups.map((group, idx) => {
                  const color = getSubjectColor(idx);
                  const c = colorClasses[color];
                  const pct = getSubjectProgress(group);
                  const completedModules = group.modules.filter(m => getProgressPercent(m) === 100).length;

                  return (
                    <div
                      key={group.name}
                      onClick={() => setSelectedSubject(group.name)}
                      className={`group cursor-pointer p-6 rounded-3xl ${c.bg} border-2 ${c.border} ${c.hover} transition-all hover:shadow-md`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className={`w-12 h-12 ${c.icon} text-white rounded-2xl flex items-center justify-center font-black text-lg`}>
                          {group.name.charAt(0)}
                        </div>
                        <span className={`text-[10px] font-black ${c.text} uppercase`}>
                          {group.modules.length} Module{group.modules.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <h4 className="text-lg font-black text-slate-800 mb-1">{group.name}</h4>
                      <p className="text-xs text-slate-500 mb-4">
                        {completedModules}/{group.modules.length} modules completed
                      </p>

                      {/* Progress bar */}
                      <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden mb-2">
                        <div className={`h-full ${c.bar} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400">{pct}% overall</span>
                        <span className={`text-[10px] font-black ${c.text} uppercase group-hover:translate-x-1 transition-transform`}>
                          Open →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-24 rounded-[3rem] border-2 border-dashed border-slate-200 text-center">
                <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <p className="text-slate-400 font-medium">No learning modules have been published for your section yet.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ============ MODULE LIST VIEW (inside a subject) ============
  const subjectModules = modules.filter(m => (m.subject || 'General') === selectedSubject);
  const subjectIdx = subjectGroups.findIndex(g => g.name === selectedSubject);
  const color = getSubjectColor(subjectIdx >= 0 ? subjectIdx : 0);
  const c = colorClasses[color];

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-12 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Back to Subjects */}
        <button 
          onClick={() => setSelectedSubject(null)}
          className="mb-8 flex items-center gap-2 text-slate-500 hover:text-emerald-600 font-semibold transition-all text-sm group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to Subjects
        </button>

        <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 ${c.icon} text-white rounded-xl flex items-center justify-center font-black`}>
                {selectedSubject.charAt(0)}
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">{selectedSubject}</h1>
            </div>
            <p className="text-slate-500">{subjectModules.length} module{subjectModules.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full ${c.bar} rounded-full transition-all`} 
                style={{ width: `${getSubjectProgress(subjectGroups.find(g => g.name === selectedSubject) || { totalSteps: 0, completedSteps: 0 })}%` }}></div>
            </div>
            <span className="text-sm font-bold text-slate-500">
              {getSubjectProgress(subjectGroups.find(g => g.name === selectedSubject) || { totalSteps: 0, completedSteps: 0 })}%
            </span>
          </div>
        </header>

        {/* Module Cards */}
        <div className="space-y-4">
          {subjectModules.map((mod, idx) => {
            const pct = getProgressPercent(mod);
            const status = getStatusLabel(mod);
            const statusColors = {
              emerald: 'bg-emerald-100 text-emerald-700',
              blue: 'bg-blue-100 text-blue-700',
              slate: 'bg-slate-100 text-slate-500',
            };

            return (
              <div
                key={mod.id}
                onClick={() => navigate(`/learning/${mod.id}`)}
                className="group cursor-pointer bg-white rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all overflow-hidden"
              >
                <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center font-black text-sm ${
                      pct === 100 ? 'bg-emerald-500 text-white' : pct > 0 ? `${c.bg} ${c.text}` : 'bg-slate-100 text-slate-400'
                    }`}>
                      {pct === 100 ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                        {mod.topic_title}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-400">{mod.step_count || 0} steps</span>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs text-slate-400">{mod.teacher_name || 'Teacher'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${statusColors[status.color]}`}>
                      {status.text}
                    </span>
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : c.bar}`} style={{ width: `${pct}%` }}></div>
                    </div>
                    <svg className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Bottom progress line */}
                {pct > 0 && pct < 100 && (
                  <div className="h-1 bg-slate-50">
                    <div className={`h-full ${c.bar} transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Courses;