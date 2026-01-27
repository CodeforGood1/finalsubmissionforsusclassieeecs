import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config/api';

function Courses() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');

  const fetchMyModules = useCallback(async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/student/my-modules`, {
      headers: { 
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    console.log("Frontend Data Check:", data); // Press F12 in browser to see this!
    setModules(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("Fetch error:", err);
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    fetchMyModules();
  }, [fetchMyModules, navigate, token]);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-12 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Navigation */}
        <button 
          onClick={() => navigate('/dashboard')}
          className="mb-8 flex items-center gap-2 text-slate-500 hover:text-emerald-600 font-semibold transition-all text-sm group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to Dashboard
        </button>

        <header className="mb-12">
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Department Hub</h1>
          <p className="text-slate-500 mt-2 text-lg">Your personalized workspace for ECE A.</p>
        </header>

        {/* Top Hero Section: Side-by-Side Tools */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          
          {/* TOOL 1: CODING WORKBENCH */}
          <div
            onClick={() => navigate('/courses/code')}
            className="group cursor-pointer relative overflow-hidden p-8 rounded-[2rem] bg-white border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-500"
          >
            <div className="relative z-10">
              <div className="text-3xl mb-6 bg-emerald-50 text-emerald-600 w-16 h-16 flex items-center justify-center rounded-2xl group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">Coding Workbench</h2>
              <p className="text-slate-500 mb-6">Practice HTML, CSS, and JS in a sandbox environment.</p>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-600 group-hover:gap-3 flex items-center gap-2 transition-all">
                Open Sandbox <span>→</span>
              </span>
            </div>
          </div>

          {/* TOOL 2: ACTIVE LEARNING MODULE */}
          <div
            onClick={() => {
              if (modules.length > 0) navigate(`/learning/${modules[0].id}`);
            }}
            className="group cursor-pointer relative overflow-hidden p-8 rounded-[2rem] bg-slate-900 text-white shadow-lg hover:shadow-2xl transition-all duration-500"
          >
            <div className="relative z-10">
              <div className="text-3xl mb-6 bg-white/10 text-emerald-400 w-16 h-16 flex items-center justify-center rounded-2xl group-hover:scale-110 transition-transform duration-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">Next Lesson</h2>
              <p className="text-slate-400 mb-6">
                {modules.length > 0 ? `Continue: ${modules[0].topic_title}` : 'No active modules for ECE A.'}
              </p>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400 group-hover:gap-3 flex items-center gap-2 transition-all">
                {modules.length > 0 ? 'Resume Learning' : 'Check Back Later'} <span>→</span>
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Section: All Assigned Modules List */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Syllabus for ECE A</h3>
            <div className="h-px flex-1 bg-slate-100 mx-6"></div>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
              {modules.length} Available
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full py-20 text-center text-slate-400 font-medium italic animate-pulse">
                Fetching modules from department server...
              </div>
            ) : modules.length > 0 ? (
              modules.map((mod) => (
                <div
                  key={mod.id}
                  onClick={() => navigate(`/learning/${mod.id}`)}
                  className="group cursor-pointer p-6 rounded-3xl bg-white border border-slate-200 hover:border-emerald-500 transition-all flex flex-col justify-between h-44 shadow-sm hover:shadow-md"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-10 h-10 bg-slate-50 text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 rounded-xl flex items-center justify-center font-bold transition-all">
                        {mod.topic_title.charAt(0)}
                      </div>
                      <span className="text-[10px] font-black text-slate-300 group-hover:text-emerald-500 uppercase">
                        {mod.step_count || 0} Steps
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-800 group-hover:text-emerald-600 transition-colors line-clamp-2">
                      {mod.topic_title}
                    </h4>
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Teacher: {mod.teacher_name || 'Department'}
                  </p>
                </div>
              ))
            ) : (
              <div className="col-span-full py-24 rounded-[3rem] border-2 border-dashed border-slate-200 text-center">
                <p className="text-slate-400 font-medium">No learning modules have been published for ECE A yet.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Courses;