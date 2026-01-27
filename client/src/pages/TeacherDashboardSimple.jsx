import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config/api';

function TeacherDashboardSimple() {
  const navigate = useNavigate();
  const [teacherInfo, setTeacherInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        console.log("No token found, redirecting to login");
        navigate('/');
        return;
      }

      console.log("Fetching teacher profile with token:", token.substring(0, 20) + "...");

      try {
        const res = await fetch(`${API_BASE_URL}/api/teacher/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        console.log("Response status:", res.status);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        console.log("Teacher data received:", data);
        setTeacherInfo(data);
      } catch (err) {
        console.error("Error fetching profile:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  if (loading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#1e293b',
        color: '#10b981',
        fontSize: '24px',
        fontWeight: 'bold'
      }}>
        Loading Teacher Profile...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#1e293b',
        color: 'white',
        padding: '20px'
      }}>
        <h1 style={{ color: '#ef4444', marginBottom: '20px' }}>Error Loading Profile</h1>
        <p style={{ marginBottom: '20px' }}>{error}</p>
        <button 
          onClick={() => { localStorage.clear(); navigate('/'); }}
          style={{
            backgroundColor: '#10b981',
            color: 'white',
            padding: '15px 30px',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Back to Login
        </button>
      </div>
    );
  }

  if (!teacherInfo) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#1e293b',
        color: 'white'
      }}>
        <h1 style={{ color: '#ef4444' }}>No Teacher Data</h1>
        <button 
          onClick={() => { localStorage.clear(); navigate('/'); }}
          style={{
            backgroundColor: '#10b981',
            color: 'white',
            padding: '15px 30px',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginTop: '20px'
          }}
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', backgroundColor: '#f1f5f9', minHeight: '100vh' }}>
      <div style={{ 
        backgroundColor: 'white', 
        padding: '30px', 
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '20px' }}>
          Teacher Dashboard - SIMPLE VERSION
        </h1>
        
        <div style={{ marginBottom: '20px' }}>
          <strong>Name:</strong> {teacherInfo.name}
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <strong>Email:</strong> {teacherInfo.email}
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <strong>Staff ID:</strong> {teacherInfo.staff_id}
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <strong>Department:</strong> {teacherInfo.dept}
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <strong>Allocated Sections:</strong> {
            teacherInfo.allocated_sections && Array.isArray(teacherInfo.allocated_sections)
              ? teacherInfo.allocated_sections.join(', ')
              : 'None'
          }
        </div>

        <button 
          onClick={() => navigate('/')}
          style={{
            backgroundColor: '#ef4444',
            color: 'white',
            padding: '12px 24px',
