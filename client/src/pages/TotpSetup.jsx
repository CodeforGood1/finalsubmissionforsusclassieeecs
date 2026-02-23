import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config/api';

function TotpSetup() {
  const navigate = useNavigate();
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [totpAlreadyEnabled, setTotpAlreadyEnabled] = useState(false);

  useEffect(() => {
    checkAndSetupTotp();
  }, []);

  const checkAndSetupTotp = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      // First check if TOTP is already enabled
      const checkRes = await fetch(`${API_BASE_URL}/api/check-totp`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const checkData = await checkRes.json();

      if (checkData.totpEnabled) {
        setTotpAlreadyEnabled(true);
        setLoading(false);
        return;
      }

      // If not enabled, setup TOTP
      const setupRes = await fetch(`${API_BASE_URL}/api/setup-totp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        }
      });
      const setupData = await setupRes.json();

      if (setupData.qrCode) {
        setQrCode(setupData.qrCode);
        setSecret(setupData.secret);
      } else {
        setError(setupData.error || 'Failed to generate QR code');
      }
    } catch (err) {
      console.error('TOTP setup error:', err);
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async (e) => {
    e.preventDefault();
    setVerifying(true);
    setError('');

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/verify-totp-setup`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ code: verificationCode.trim() })
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          const role = localStorage.getItem('user_role');
          if (role === 'teacher') navigate('/teacher-dashboard');
          else navigate('/dashboard');
        }, 2000);
      } else {
        setError(data.error || 'Invalid code, please try again');
        setVerificationCode('');
      }
    } catch (err) {
      setError('Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSkip = () => {
    const role = localStorage.getItem('user_role');
    if (role === 'teacher') navigate('/teacher-dashboard');
    else navigate('/dashboard');
  };

  const handleDisableTotp = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/disable-totp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        }
      });
      const data = await res.json();

      if (data.success) {
        setTotpAlreadyEnabled(false);
        checkAndSetupTotp(); // Re-run setup
      } else {
        setError(data.error || 'Failed to disable TOTP');
      }
    } catch (err) {
      setError('Connection failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Setting up authenticator...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-center bg-white p-12 rounded-[2.5rem] shadow-2xl">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-800 uppercase mb-2">Authenticator Enabled!</h2>
          <p className="text-slate-500 text-sm">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  if (totpAlreadyEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
        <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-2xl text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-800 uppercase mb-2">Already Protected</h2>
          <p className="text-slate-500 text-sm mb-8">Your account is secured with Microsoft Authenticator</p>
          
          <div className="space-y-4">
            <button
              onClick={handleSkip}
              className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all"
            >
              Continue to Dashboard
            </button>
            <button
              onClick={handleDisableTotp}
              className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:text-red-600"
            >
              Disable Authenticator (Use Email OTP)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
      <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Setup Authenticator</h2>
          <p className="text-slate-500 text-xs mt-2">Works offline - no internet needed for login!</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 text-[10px] font-bold rounded-xl uppercase text-center border border-red-100">
            {error}
          </div>
        )}

        {/* Instructions */}
        <div className="mb-6 space-y-3">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="flex-shrink-0 w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-black">1</span>
            <p className="text-xs text-slate-600 leading-relaxed">Install <strong>Microsoft Authenticator</strong> or <strong>Google Authenticator</strong> on your phone</p>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="flex-shrink-0 w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-black">2</span>
            <p className="text-xs text-slate-600 leading-relaxed">Open the app and tap <strong>"Add Account"</strong> then <strong>"Scan QR Code"</strong></p>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="flex-shrink-0 w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-black">3</span>
            <p className="text-xs text-slate-600 leading-relaxed">Scan the QR code below, then enter the 6-digit code</p>
          </div>
        </div>

        {/* QR Code */}
        {qrCode && (
          <div className="flex flex-col items-center mb-6">
            <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-inner">
              <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48" />
            </div>
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-3">Scan with authenticator app</p>
            
            {/* Manual entry key */}
            <details className="mt-4 w-full">
              <summary className="text-[9px] text-slate-500 uppercase tracking-widest cursor-pointer hover:text-emerald-600 text-center">
                Can't scan? Enter key manually
              </summary>
              <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-600 font-mono break-all text-center select-all">{secret}</p>
              </div>
            </details>
          </div>
        )}

        {/* Verification Form */}
        <form onSubmit={handleVerifySetup} className="space-y-4">
          <input
            type="text"
            maxLength="6"
            required
            value={verificationCode}
            placeholder="Enter 6-digit code"
            className="w-full text-center text-2xl tracking-[0.3em] font-black rounded-2xl border-2 border-slate-100 bg-slate-50 p-5 outline-none focus:border-emerald-500"
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
          />
          <button
            type="submit"
            disabled={verifying || verificationCode.length !== 6}
            className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {verifying ? 'Verifying...' : 'Enable Authenticator'}
          </button>
        </form>

        {/* Skip Option */}
        <button
          type="button"
          onClick={handleSkip}
          className="mt-6 text-[9px] font-black text-slate-400 uppercase tracking-widest block w-full text-center hover:text-slate-600"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

export default TotpSetup;
