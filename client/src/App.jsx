import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Courses from './pages/Courses'
import Login from './pages/Login'
import ProgressTracker from './pages/ProgressTracker'
import TestKnowledge from './pages/TestKnowledge'
import StudentProfile from './pages/StudentProfile'
import CodingWorkbench from './pages/CodingWorkbench'  
import VideoLearning from './pages/VideoLearning'
import AdminDashboard from './pages/AdminDashboard'
import TeacherDashboard from './pages/TeacherDashboard'
import CoursePlayer from './pages/CoursePlayer'
import ModuleLearning from './pages/ModuleLearning'
import TotpSetup from './pages/TotpSetup'

// --- THE BOUNCER (Protected Route Logic) ---
const ProtectedRoute = ({ children, allowedRole }) => {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('user_role');

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (allowedRole && userRole !== allowedRole) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <Routes>
      {/* PUBLIC ROUTE */}
      <Route path="/" element={<Login />} />

      {/* ADMIN ONLY */}
      <Route 
        path="/admin-dashboard" 
        element={
          <ProtectedRoute allowedRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        } 
      />

      {/* TEACHER ONLY */}
      <Route 
        path="/teacher-dashboard" 
        element={
          <ProtectedRoute allowedRole="teacher">
            <TeacherDashboard />
          </ProtectedRoute>
        } 
      />
      
      {/* TOTP SETUP - For both teachers and students */}
      <Route 
        path="/setup-authenticator" 
        element={
          <TotpSetup />
        } 
      />

      {/* STUDENT ROUTES (Protected) */}
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute allowedRole="student">
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      
      {/* General Student Protected Routes */}
      <Route path="/courses" element={<ProtectedRoute allowedRole="student"><Courses /></ProtectedRoute>} />
      <Route path="/progress" element={<ProtectedRoute allowedRole="student"><ProgressTracker /></ProtectedRoute>} />
      <Route path="/test" element={<ProtectedRoute allowedRole="student"><TestKnowledge /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute allowedRole="student"><StudentProfile /></ProtectedRoute>} />
      <Route path="/courses/code" element={<ProtectedRoute allowedRole="student"><CodingWorkbench /></ProtectedRoute>} />
      
      {/* CRITICAL FIX: The Course Player must be protected so only logged-in students see it */}
      <Route 
        path="/learning/:moduleId" 
        element={
          <ProtectedRoute allowedRole="student">
            <ModuleLearning />
          </ProtectedRoute>
        } 
      />
      
      {/* Legacy coding challenge route */}
      <Route 
        path="/challenge/:moduleId" 
        element={
          <ProtectedRoute allowedRole="student">
            <CoursePlayer />
          </ProtectedRoute>
        } 
      />
      
      <Route path="/courses/video" element={<ProtectedRoute allowedRole="student"><VideoLearning /></ProtectedRoute>} />

      {/* CATCH-ALL: Redirect unknown URLs to Login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App;