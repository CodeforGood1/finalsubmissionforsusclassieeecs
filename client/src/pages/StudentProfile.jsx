import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config/api';

export default function StudentProfile() {
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [progress, setProgress] = useState(null);
  const [moduleProgress, setModuleProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        
        // Fetch student profile
        const profileRes = await fetch(`${API_BASE_URL}/api/student/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!profileRes.ok) throw new Error("Failed to fetch profile");
        const profileData = await profileRes.json();
        setStudent(profileData);
        
        // Fetch test progress
        const progressRes = await fetch(`${API_BASE_URL}/api/student/progress`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          setProgress(progressData);
        }
        
        // Fetch module progress
        const moduleRes = await fetch(`${API_BASE_URL}/api/student/module-progress`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (moduleRes.ok) {
          const moduleData = await moduleRes.json();
          setModuleProgress(moduleData);
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50 font-black text-emerald-500 animate-pulse">
      SYNCING PROFILE DATA...
    </div>
  );

  if (!student) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center bg-white p-12 rounded-3xl shadow-lg">
        <p className="text-red-500 font-bold mb-4">Could not load profile</p>
        <button onClick={() => navigate('/dashboard')} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold">Return to Dashboard</button>
      </div>
    </div>
  );

  // Calculate Progress Percentage for the UI
  const testsCompleted = progress?.tests_completed || 0;
  const totalTests = progress?.total_tests_assigned || 0;
  const progressPercent = totalTests > 0 ? (testsCompleted / totalTests) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#fdfdfd] font-sans text-slate-800 p-8 lg:p-12">
      <div className="max-w-4xl mx-auto">
        
        {/* TOP NAV */}
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-slate-400 hover:text-emerald-600 font-bold transition-colors mb-12 text-xs uppercase tracking-widest">
          Back to Dashboard
        </button>

        {/* PROGRESS TRACKER SECTION */}
        <div className="mb-12 bg-white border border-slate-100 p-10 rounded-[2.5rem] shadow-sm">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase italic">Test Progress</h2>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                {testsCompleted} / {totalTests} Tests Completed
              </p>
            </div>
            <span className="text-5xl font-black text-emerald-500 italic">{Math.round(progressPercent)}%</span>
          </div>
          <div className="w-full h-5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 transition-all duration-1000 ease-out" 
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 mt-8">
            <div className="bg-emerald-50 p-6 rounded-2xl text-center">
              <p className="text-3xl font-black text-emerald-600">{testsCompleted}</p>
              <p className="text-xs text-slate-600 font-bold uppercase">Completed</p>
            </div>
            <div className="bg-red-50 p-6 rounded-2xl text-center">
              <p className="text-3xl font-black text-red-600">{progress?.tests_overdue || 0}</p>
              <p className="text-xs text-slate-600 font-bold uppercase">Overdue</p>
            </div>
            <div className="bg-blue-50 p-6 rounded-2xl text-center">
              <p className="text-3xl font-black text-blue-600">{progress?.average_score || 0}%</p>
              <p className="text-xs text-slate-600 font-bold uppercase">Avg Score</p>
            </div>
          </div>
        </div>

        {/* MODULE PROGRESS SECTION */}
        {moduleProgress && (
          <div className="mb-12 bg-white border border-slate-100 p-10 rounded-[2.5rem] shadow-sm">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase italic">Module Progress</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                  {moduleProgress.completed_modules || 0} / {moduleProgress.total_modules || 0} Modules Completed
                </p>
              </div>
              <span className="text-5xl font-black text-purple-500 italic">{moduleProgress.completion_percentage || 0}%</span>
            </div>
            <div className="w-full h-5 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-500 transition-all duration-1000 ease-out" 
                style={{ width: `${moduleProgress.completion_percentage || 0}%` }}
              ></div>
            </div>
            
            {/* Module Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mt-8">
              <div className="bg-purple-50 p-6 rounded-2xl text-center">
                <p className="text-3xl font-black text-purple-600">{moduleProgress.completed_modules || 0}</p>
                <p className="text-xs text-slate-600 font-bold uppercase">Completed</p>
              </div>
              <div className="bg-orange-50 p-6 rounded-2xl text-center">
                <p className="text-3xl font-black text-orange-600">{moduleProgress.pending_modules || 0}</p>
                <p className="text-xs text-slate-600 font-bold uppercase">Pending</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl text-center">
                <p className="text-3xl font-black text-slate-600">{moduleProgress.total_modules || 0}</p>
                <p className="text-xs text-slate-600 font-bold uppercase">Total</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          
          {/* LEFT: AVATAR & DATABASE INFO */}
          <div className="md:col-span-1 space-y-8">
            <div className="text-center md:text-left">
              {/* Profile Image with fallback */}
              <div className="w-40 h-40 rounded-[3rem] flex items-center justify-center overflow-hidden mx-auto md:mx-0 mb-6 shadow-2xl border-4 border-white">
                {student.profilePic ? (
                  <img src={student.profilePic} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-emerald-100 flex items-center justify-center text-6xl text-emerald-600 font-black">
                    {(student.name || '?').charAt(0)}
                  </div>
                )}
              </div>
              <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{student.name || 'Student'}</h1>
              <p className="text-emerald-600 font-black text-[10px] uppercase tracking-[0.2em] mt-2">
                {student.class_dept || ''} — Section {student.section || ''}
              </p>
            </div>

            <div className="pt-8 border-t border-slate-100">
              
          
            </div>
          </div>

          {/* RIGHT: ACCOUNT DETAILS */}
          <div className="md:col-span-2 space-y-10">
            <section className="bg-white border border-slate-100 p-10 rounded-[3rem] shadow-sm">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-8 italic">Account Integrity</h2>
              <div className="space-y-6">
                <div className="p-6 bg-slate-50 rounded-2xl">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Official Email</label>
                  <p className="text-sm font-bold text-slate-800">{student.email}</p>
                </div>
                <div className="p-6 bg-slate-50 rounded-2xl">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Registration Number</label>
                  <p className="text-sm font-bold text-slate-800">{student.reg_no}</p>
                </div>
              </div>
            </section>
            
            {/* SECURITY SETTINGS */}
            <section className="bg-white border border-slate-100 p-10 rounded-[3rem] shadow-sm">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-8 italic">Security Settings</h2>
              <div className="space-y-6">
                <div className="p-6 bg-emerald-50 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Two-Factor Authentication</label>
                      <p className="text-sm font-bold text-slate-800">Microsoft/Google Authenticator</p>
                      <p className="text-[10px] text-slate-500 mt-1">Works offline - no internet needed for login</p>
                    </div>
                    <button 
                      onClick={() => navigate('/setup-authenticator')}
                      className="px-4 py-2 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-emerald-700 transition-colors"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

        </div>
      </div>
    </div>
  );
}