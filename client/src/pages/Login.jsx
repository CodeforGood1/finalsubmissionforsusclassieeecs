import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import API_BASE_URL from '../config/api';

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState('student'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inactivityMessage, setInactivityMessage] = useState('');
  
  // Password Reset State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1: email, 2: otp+password
  const [resetMessage, setResetMessage] = useState('');

  // Check for inactivity logout message
  useEffect(() => {
    if (location.state?.message) {
      setInactivityMessage(location.state.message);
      setTimeout(() => setInactivityMessage(''), 5000);
    }
  }, [location]);

  // STEP 1: Handle Initial Login (Email/Password check + Trigger OTP)
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const activeRole = role.toLowerCase();
    
    // Admin goes to a separate endpoint, others go to universal login
    const endpoint = activeRole === 'admin' ? '/api/admin/login' : '/api/login';

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim(), 
          password, 
          role: activeRole 
        })
      });
      const data = await response.json();

      if (data.mfaRequired) {
        // Correct password! Now show the OTP popup
        setShowOtp(true); 
      } else if (data.success) {
        // Direct login (usually for Admin or if MFA is disabled)
        completeAuth(data, activeRole);
      } else {
        setError(data.message || "INVALID CREDENTIALS");
      }
    } catch (err) { 
      console.error(err);
      setError("BACKEND CONNECTION FAILED"); 
    } finally { 
      setLoading(false); 
    }
  };

  // STEP 2: Handle OTP Verification
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim(), 
          otp: otp.trim(), 
          role: role.toLowerCase() 
        })
      });
      const data = await res.json();
      
      if (data.success) {
        completeAuth(data, role.toLowerCase());
      } else {
        // Use alert or error state for invalid OTP
        setError(data.message || "Invalid OTP");
        setOtp(''); // Clear input on failure
      }
    } catch (err) { 
      console.error(err);
      setError("Verification Failed"); 
    } finally { 
      setLoading(false); 
    }
  };

  // Helper to save data and redirect
  const completeAuth = (data, activeRole) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user_role', activeRole);
    if (data.user) {
      localStorage.setItem('user_data', JSON.stringify(data.user));
    }
    
    // Navigation Logic
    if (activeRole === 'admin') navigate('/admin-dashboard');
    else if (activeRole === 'teacher') navigate('/teacher-dashboard');
    else navigate('/dashboard');
  };

  // Password Reset: Request OTP
  const handleResetRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResetMessage('');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim(), role: role.toLowerCase() })
      });
      const data = await res.json();
      
      if (data.success) {
        setResetStep(2);
        setResetMessage('Reset code sent to your email');
      } else {
        setResetMessage(data.error || 'Failed to send reset code');
      }
    } catch (err) {
      setResetMessage('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  // Password Reset: Confirm with OTP
  const handleResetConfirm = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResetMessage('');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: resetEmail.trim(), 
          role: role.toLowerCase(),
          otp: resetOtp.trim(),
          newPassword 
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setResetMessage('Password reset successful! You can now login.');
        setTimeout(() => {
          setShowResetModal(false);
          setResetStep(1);
          setResetEmail('');
          setResetOtp('');
          setNewPassword('');
        }, 2000);
      } else {
        setResetMessage(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setResetMessage('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#F8FAFC] font-sans relative">
      {/* MAIN LOGIN CARD */}
      <div className="w-full max-w-md rounded-[2.5rem] bg-white p-12 shadow-2xl border border-slate-100">
        
        {/* Role Selector */}
        <div className="mb-10 flex rounded-2xl bg-slate-100/80 p-1.5 backdrop-blur-sm">
          {['admin', 'teacher', 'student'].map((r) => (
            <button 
              key={r} 
              type="button" 
              onClick={() => setRole(r)} 
              className={`flex-1 py-2.5 text-[10px] font-black uppercase transition-all duration-300 ${role === r ? 'bg-white text-emerald-600 shadow-md rounded-xl' : 'text-slate-400'}`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="mb-10 text-center">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-800">
            {role}<span className="text-emerald-500"> </span><span className="text-emerald-600 not-italic lowercase font-medium">portal</span>
          </h2>
          {inactivityMessage && (
            <div className="mt-6 p-3 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-xl uppercase border border-amber-200">
               {inactivityMessage}
            </div>
          )}
          {error && (
            <div className="mt-6 p-3 bg-red-50 text-red-500 text-[10px] font-bold rounded-xl uppercase border border-red-100 animate-shake">
              {error}
            </div>
          )}
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <input 
            type="email" 
            required 
            placeholder="Email Identity" 
            className="w-full rounded-2xl border bg-slate-50/50 p-4 text-sm font-bold outline-none focus:bg-white focus:border-emerald-500 transition-all" 
            onChange={(e) => setEmail(e.target.value)} 
          />
          <input 
            type="password" 
            required 
            placeholder="Access Password" 
            className="w-full rounded-2xl border bg-slate-50/50 p-4 text-sm font-bold outline-none focus:bg-white focus:border-emerald-500 transition-all" 
            onChange={(e) => setPassword(e.target.value)} 
          />
          <button 
            type="submit" 
            disabled={loading} 
            className="w-full rounded-2xl bg-slate-900 py-5 font-black text-white uppercase tracking-widest text-[11px] hover:bg-emerald-600 transition-all disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Authenticate Access'}
          </button>
        </form>
        
        {/* Forgot Password Link */}
        {role !== 'admin' && (
          <button 
            type="button"
            onClick={() => { setShowResetModal(true); setResetEmail(email); }}
            className="mt-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest block w-full text-center hover:text-emerald-600 transition-colors"
          >
            Forgot Password?
          </button>
        )}
      </div>

      {/* OTP POPUP OVERLAY */}
      {showOtp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md px-4">
          <div className="w-full max-w-sm rounded-[2.5rem] bg-white p-10 shadow-2xl border border-slate-100 text-center animate-in zoom-in duration-300">
            <h3 className="text-xl font-black uppercase italic tracking-tighter">Enter <span className="text-emerald-500">OTP</span></h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 mb-6 tracking-widest">Verify the code sent to {email}</p>
            
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <input 
                type="text" 
                maxLength="6" 
                required 
                value={otp}
                placeholder="------" 
                className="w-full text-center text-3xl tracking-[0.3em] font-black rounded-2xl border-2 border-slate-100 bg-slate-50 p-5 outline-none focus:border-emerald-500" 
                onChange={(e) => setOtp(e.target.value)} 
              />
              <button 
                type="submit" 
                disabled={loading} 
                className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all"
              >
                {loading ? 'Verifying...' : 'Verify Identity'}
              </button>
              <button 
                type="button" 
                onClick={() => setShowOtp(false)} 
                className="text-[9px] font-black text-slate-400 uppercase tracking-widest block w-full text-center hover:text-slate-600"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
      
      {/* PASSWORD RESET MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md px-4">
          <div className="w-full max-w-sm rounded-[2.5rem] bg-white p-10 shadow-2xl border border-slate-100 text-center">
            <h3 className="text-xl font-black uppercase italic tracking-tighter mb-2">Reset <span className="text-emerald-500">Password</span></h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-6 tracking-widest">
              {resetStep === 1 ? 'Enter your email to receive a reset code' : 'Enter code and new password'}
            </p>
            
            {resetMessage && (
              <div className={`mb-4 p-3 text-[10px] font-bold rounded-xl uppercase ${resetMessage.includes('success') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                {resetMessage}
              </div>
            )}
            
            {resetStep === 1 ? (
              <form onSubmit={handleResetRequest} className="space-y-4">
                <input 
                  type="email" 
                  required 
                  value={resetEmail}
                  placeholder="Your Email" 
                  className="w-full rounded-2xl border bg-slate-50/50 p-4 text-sm font-bold outline-none focus:bg-white focus:border-emerald-500 transition-all" 
                  onChange={(e) => setResetEmail(e.target.value)} 
                />
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all"
                >
                  {loading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetConfirm} className="space-y-4">
                <input 
                  type="text" 
                  maxLength="6" 
                  required 
                  value={resetOtp}
                  placeholder="Reset Code" 
                  className="w-full text-center text-2xl tracking-[0.2em] font-black rounded-2xl border-2 border-slate-100 bg-slate-50 p-4 outline-none focus:border-emerald-500" 
                  onChange={(e) => setResetOtp(e.target.value)} 
                />
                <input 
                  type="password" 
                  required 
                  minLength="6"
                  value={newPassword}
                  placeholder="New Password (min 6 chars)" 
                  className="w-full rounded-2xl border bg-slate-50/50 p-4 text-sm font-bold outline-none focus:bg-white focus:border-emerald-500 transition-all" 
                  onChange={(e) => setNewPassword(e.target.value)} 
                />
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            )}
            
            <button 
              type="button" 
              onClick={() => { setShowResetModal(false); setResetStep(1); setResetMessage(''); }}
              className="mt-4 text-[9px] font-black text-slate-400 uppercase tracking-widest block w-full text-center hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;