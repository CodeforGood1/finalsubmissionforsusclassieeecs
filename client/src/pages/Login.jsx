import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import API_BASE_URL from '../config/api';

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState('student'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inactivityMessage, setInactivityMessage] = useState('');
  
  // Password Reset State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1: email, 2: code+password
  const [resetMessage, setResetMessage] = useState('');

  // Check for inactivity logout message
  useEffect(() => {
    if (location.state?.message) {
      setInactivityMessage(location.state.message);
      setTimeout(() => setInactivityMessage(''), 5000);
    }
  }, [location]);

  // STEP 1: Handle Initial Login (Email/Password)
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const activeRole = role.toLowerCase();
    
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

      if (data.mfaRequired && data.totpEnabled) {
        // User has authenticator app — show TOTP input
        setShowTotp(true);
      } else if (data.success) {
        // Direct login (admin, or MFA disabled)
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

  // STEP 2: Verify TOTP code from authenticator app
  const handleVerifyTotp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/verify-totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim(), 
          code: totpCode.trim(), 
          role: role.toLowerCase() 
        })
      });
      const data = await res.json();
      
      if (data.success) {
        completeAuth(data, role.toLowerCase());
      } else {
        setError(data.error || data.message || "Invalid code");
        setTotpCode('');
      }
    } catch (err) { 
      console.error(err);
      setError("Verification Failed"); 
    } finally { 
      setLoading(false); 
    }
  };

  // Helper to save data and redirect
  const completeAuth = async (data, activeRole) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user_role', activeRole);
    if (data.user) {
      localStorage.setItem('user_data', JSON.stringify(data.user));
    }
    
    // For teachers/students: Check if they need to set up TOTP
    if (activeRole === 'teacher' || activeRole === 'student') {
      try {
        const checkRes = await fetch(`${API_BASE_URL}/api/check-totp`, {
          headers: { 'Authorization': `Bearer ${data.token}` }
        });
        const checkData = await checkRes.json();
        
        if (!checkData.totpEnabled) {
          navigate('/setup-authenticator');
          return;
        }
      } catch (err) {
        console.error('TOTP check failed:', err);
      }
    }
    
    if (activeRole === 'admin') navigate('/admin-dashboard');
    else if (activeRole === 'teacher') navigate('/teacher-dashboard');
    else navigate('/dashboard');
  };

  // Password Reset: Request code
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
      console.error('Password reset request failed:', err);
      setResetMessage('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  // Password Reset: Confirm with code
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
      console.error('Password reset confirm failed:', err);
      setResetMessage('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell relative flex min-h-screen items-center justify-center px-4 py-8 font-sans sm:px-6">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-[#060708] via-[#cf3a1f] to-[#c6b5bf]" />
      <div className="hidden max-w-lg pr-12 lg:block">
        <div className="mb-6 inline-flex items-center gap-3">
          <span className="brand-mark">S</span>
          <span className="text-sm font-black uppercase tracking-[0.16em] text-[#cf3a1f]">Sustainable Classroom</span>
        </div>
        <h1 className="max-w-md text-5xl font-black leading-tight text-slate-900">
          A calmer classroom portal for daily learning.
        </h1>
        <p className="mt-5 max-w-md text-base font-medium leading-7 text-slate-600">
          Students, teachers, and admins can get to the right workspace quickly, even on local school networks.
        </p>
        <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
          {['Offline ready', 'Role based', 'Secure access'].map((item) => (
            <div key={item} className="ui-card-soft px-4 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-600">
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* MAIN LOGIN CARD */}
      <div className="ui-card w-full max-w-md p-6 sm:p-8 md:p-10">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <span className="brand-mark">S</span>
          <div>
            <p className="text-sm font-black text-slate-900">Sustainable Classroom</p>
            <p className="text-xs font-semibold text-slate-500">Learning portal</p>
          </div>
        </div>
        
        {/* Role Selector */}
        <div className="mb-8 flex rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5 backdrop-blur-sm">
          {['admin', 'teacher', 'student'].map((r) => (
            <button 
              key={r} 
              type="button" 
              onClick={() => setRole(r)} 
              className={`flex-1 rounded-xl py-2.5 text-[10px] font-black uppercase transition-all duration-300 ${role === r ? 'bg-white text-[#cf3a1f] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="mb-8 text-center sm:text-left">
          <p className="section-label mb-2">Sign in</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            {role.charAt(0).toUpperCase() + role.slice(1)} portal
          </h2>
          {inactivityMessage && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-bold uppercase text-amber-700">
               {inactivityMessage}
            </div>
          )}
          {error && (
            <div className="mt-6 rounded-xl border border-red-100 bg-red-50 p-3 text-[10px] font-bold uppercase text-red-600">
              {error}
            </div>
          )}
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <input 
            type="email" 
            required 
            placeholder="Email Identity" 
            className="field" 
            onChange={(e) => setEmail(e.target.value)} 
          />
          <input 
            type="password" 
            required 
            placeholder="Access Password" 
            className="field" 
            onChange={(e) => setPassword(e.target.value)} 
          />
          <button 
            type="submit" 
            disabled={loading} 
            className="btn-primary w-full py-5 text-[11px] uppercase tracking-widest"
          >
            {loading ? 'Verifying...' : 'Authenticate Access'}
          </button>
        </form>
        
        {/* Forgot Password Link */}
        {role !== 'admin' && (
          <button 
            type="button"
            onClick={() => { setShowResetModal(true); setResetEmail(email); }}
            className="mt-6 block w-full text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-[#cf3a1f]"
          >
            Forgot Password?
          </button>
        )}
      </div>

      {/* TOTP POPUP OVERLAY (Authenticator app only) */}
      {showTotp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md px-4">
          <div className="ui-card w-full max-w-sm p-8 text-center sm:p-10">
            <h3 className="text-xl font-black tracking-tight">
              <span className="text-[#cf3a1f]">Authenticator</span> Code
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 mb-6 tracking-widest">
              Enter 6-digit code from your authenticator app
            </p>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-500 text-[10px] font-bold rounded-xl uppercase border border-red-100">
                {error}
              </div>
            )}
            
            <form onSubmit={handleVerifyTotp} className="space-y-4">
              <input 
                type="text" 
                maxLength="6" 
                required 
                value={totpCode}
                placeholder="------" 
                className="field text-center text-3xl font-black tracking-[0.3em]" 
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} 
              />
              <button 
                type="submit" 
                disabled={loading} 
                className="btn-primary w-full py-4 text-[10px] uppercase tracking-widest"
              >
                {loading ? 'Verifying...' : 'Verify Identity'}
              </button>
              
              <button 
                type="button" 
                onClick={() => { setShowTotp(false); setTotpCode(''); setError(''); }} 
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
          <div className="ui-card w-full max-w-sm p-8 text-center sm:p-10">
            <h3 className="mb-2 text-xl font-black tracking-tight">Reset <span className="text-[#cf3a1f]">Password</span></h3>
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
                  className="field" 
                  onChange={(e) => setResetEmail(e.target.value)} 
                />
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="btn-primary w-full py-4 text-[10px] uppercase tracking-widest"
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
                  className="field text-center text-2xl font-black tracking-[0.2em]" 
                  onChange={(e) => setResetOtp(e.target.value)} 
                />
                <input 
                  type="password" 
                  required 
                  minLength="6"
                  value={newPassword}
                  placeholder="New Password (min 6 chars)" 
                  className="field" 
                  onChange={(e) => setNewPassword(e.target.value)} 
                />
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="btn-primary w-full py-4 text-[10px] uppercase tracking-widest"
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
