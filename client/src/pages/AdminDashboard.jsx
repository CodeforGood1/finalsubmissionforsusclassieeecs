import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config/api';

function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('student'); // 'student', 'teacher', 'manage-students', 'manage-teachers', 'allocation'
  const [loading, setLoading] = useState(false);
  
  // States for Allocation
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedSections, setSelectedSections] = useState([]); // Changed from selectedStudents
  const [allocationSubject, setAllocationSubject] = useState("");
  const [availableSections, setAvailableSections] = useState([]); // List of unique class/sections
  
  // States for Editing Allocations
  const [showEditAllocModal, setShowEditAllocModal] = useState(false);
  const [editingAllocTeacher, setEditingAllocTeacher] = useState(null);
  const [editAllocSections, setEditAllocSections] = useState([]);

  // States for Registration
  const [studentData, setStudentData] = useState({ 
    name: '', email: '', password: '', reg_no: '', class_dept: '', section: '' 
  });
  const [teacherData, setTeacherData] = useState({ 
    name: '', email: '', password: '', staff_id: '', dept: '' 
  });
  
  // States for Editing
  const [editingStudent, setEditingStudent] = useState(null);
  const [editingTeacher, setEditingTeacher] = useState(null);
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  
  // CSV bulk upload states
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResults, setCsvResults] = useState(null);
  
  // Change password modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null); // { id, name, type: 'student'|'teacher' }
  const [newPassword, setNewPassword] = useState('');
  
  // Profile pic upload states
  const [profilePicUploading, setProfilePicUploading] = useState(false);

  const token = localStorage.getItem('token');
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === 'allocation') {
      fetchTeachers();
      fetchSections();
    } else if (activeTab === 'manage-teachers') {
      fetchTeachers();
    } else if (activeTab === 'manage-students') {
      fetchStudents();
    }
  }, [activeTab]);

  const fetchTeachers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/teachers`, { headers: authHeaders });
      const data = await res.json();
      setTeachers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching teachers:", err);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/students`, { headers: authHeaders });
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching students:", err);
    }
  };

  const fetchSections = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/sections`, { headers: authHeaders });
      const data = await res.json();
      setAvailableSections(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching sections:", err);
    }
  };

  // Logout handler
  const handleLogout = () => {
    // Clear all timer data
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('timetracker_session')) {
        localStorage.removeItem(key);
      }
    });
    localStorage.clear();
    window.location.href = '/login';
  };

  const toggleSectionSelection = (section) => {
    setSelectedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const handleSaveAllocation = async () => {
    if (!selectedTeacher || selectedSections.length === 0 || !allocationSubject) {
      return alert("Please select teacher, at least one class/section, and enter subject");
    }
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/allocate-sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ 
          teacher_id: selectedTeacher.id, 
          sections: selectedSections,
          subject: allocationSubject
        })
      });

      const data = await res.json();
      
      if (res.ok) {
        alert(`Allocation Saved! ${data.message || ''}`);
        setSelectedSections([]);
        setAllocationSubject("");
        fetchTeachers(); // Refresh to show updated allocations
      } else {
        alert(`Failed to save allocation: ${data.error || 'Unknown error'}`);
        console.error("Allocation error:", data);
      }
    } catch (err) {
      alert(`Server error: ${err.message}`);
      console.error("Allocation error:", err);
    }
  };

  // Open edit allocation modal
  const openEditAllocModal = (teacher) => {
    setEditingAllocTeacher(teacher);
    setEditAllocSections(teacher.allocated_sections || []);
    setShowEditAllocModal(true);
  };

  // Toggle section in edit modal
  const toggleEditAllocSection = (sectionStr) => {
    setEditAllocSections(prev =>
      prev.includes(sectionStr)
        ? prev.filter(s => s !== sectionStr)
        : [...prev, sectionStr]
    );
  };

  // Save edited allocations
  const handleSaveEditedAllocations = async () => {
    if (!editingAllocTeacher) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/teacher/${editingAllocTeacher.id}/allocations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ sections: editAllocSections })
      });

      const data = await res.json();
      
      if (res.ok) {
        alert('Allocations updated!');
        setShowEditAllocModal(false);
        setEditingAllocTeacher(null);
        fetchTeachers();
      } else {
        alert(`Error: ${data.error || 'Failed to update'}`);
      }
    } catch (err) {
      alert(`Server error: ${err.message}`);
    }
  };

  // Remove single section from teacher
  const handleRemoveSection = async (teacherId, section) => {
    if (!confirm(`Remove section "${section}" from this teacher?`)) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/teacher/${teacherId}/section/${encodeURIComponent(section)}`, {
        method: 'DELETE',
        headers: authHeaders
      });

      if (res.ok) {
        alert('Section removed!');
        fetchTeachers();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || 'Failed to remove'}`);
      }
    } catch (err) {
      alert(`Server error: ${err.message}`);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Validate email format before sending
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      const emailToCheck = activeTab === 'student' ? studentData.email : teacherData.email;
      
      if (!emailRegex.test(emailToCheck)) {
        alert("Invalid email format! Please enter a complete email address (e.g., user@example.com)");
        setLoading(false);
        return;
      }

      let mediaInfo = {};

      if (selectedFile) {
        const fileData = new FormData();
        fileData.append('file', selectedFile);

        const upRes = await fetch(`${API_BASE_URL}/api/upload`, { 
          method: 'POST', 
          headers: authHeaders, 
          body: fileData 
        });

        if (!upRes.ok) throw new Error("Upload failed");
        
        const cloudData = await upRes.json();
        mediaInfo = {
          url: cloudData.url,
          public_id: cloudData.public_id,
          type: cloudData.type
        };
      }

      const endpoint = activeTab === 'student' ? 'register-student' : 'register-teacher';
      const payload = activeTab === 'student' 
        ? { ...studentData, media: mediaInfo } 
        : { ...teacherData, media: mediaInfo };

      const response = await fetch(`${API_BASE_URL}/api/admin/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        alert(`${activeTab.toUpperCase()} registered successfully!`);
        setPreview(null);
        setSelectedFile(null);
        e.target.reset();
        if (activeTab === 'student') {
          setStudentData({ name: '', email: '', password: '', reg_no: '', class_dept: '', section: '' });
        } else {
          setTeacherData({ name: '', email: '', password: '', staff_id: '', dept: '' });
        }
      } else {
        const errData = await response.json();
        alert(`Error: ${errData.error || 'Registration failed'}`);
      }
    } catch (err) { 
      alert(`Error saving data: ${err.message || 'Please check all fields and try again'}`);
      console.error("Registration Error:", err);
    } finally { 
      setLoading(false); 
    }
  };

  const handleUpdateTeacher = async (teacher) => {
    const name = prompt("Teacher Name:", teacher.name);
    const email = prompt("Email:", teacher.email);
    const staff_id = prompt("Staff ID:", teacher.staff_id);
    const dept = prompt("Department:", teacher.dept);
    
    if (!name || !email) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/teacher/${teacher.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name, email, staff_id, dept })
      });
      
      if (res.ok) {
        alert("Teacher Updated!");
        fetchTeachers();
      }
    } catch (err) {
      alert("Failed to update teacher");
    }
  };

  const handleDeleteTeacher = async (id) => {
    if (!confirm("Delete this teacher? This will remove all their data including modules and tests.")) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/teacher/${id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      
      if (res.ok) {
        alert("Teacher Deleted!");
        fetchTeachers();
      }
    } catch (err) {
      alert("Failed to delete teacher");
    }
  };

  const handleUpdateStudent = async (student) => {
    const name = prompt("Student Name:", student.name);
    const email = prompt("Email:", student.email);
    const reg_no = prompt("Registration No:", student.reg_no);
    const class_dept = prompt("Class/Department:", student.class_dept);
    const section = prompt("Section:", student.section);
    
    if (!name || !email) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/student/${student.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name, email, reg_no, class_dept, section })
      });
      
      if (res.ok) {
        alert("Student Updated!");
        fetchStudents();
      }
    } catch (err) {
      alert("Failed to update student");
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!confirm("Delete this student? This will remove all their data including test submissions.")) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/student/${id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      
      if (res.ok) {
        alert("Student Deleted!");
        fetchStudents();
      }
    } catch (err) {
      alert("Failed to delete student");
    }
  };

  // CSV Bulk Upload handler
  const handleCSVUpload = async (type) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      setCsvUploading(true);
      setCsvResults(null);
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(`${API_BASE_URL}/api/admin/bulk-upload-${type}s`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        
        const data = await res.json();
        setCsvResults(data);
        
        if (data.success > 0) {
          if (type === 'student') fetchStudents();
          else fetchTeachers();
        }
      } catch (err) {
        alert("CSV upload failed: " + err.message);
      } finally {
        setCsvUploading(false);
      }
    };
    input.click();
  };

  // Change Password handler
  const handleChangePassword = async () => {
    if (!passwordTarget || !newPassword) return;
    
    if (newPassword.length < 4) {
      alert("Password must be at least 4 characters");
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ 
          userId: passwordTarget.id, 
          userType: passwordTarget.type, 
          newPassword 
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        alert(`Password changed for ${passwordTarget.name}`);
        setShowPasswordModal(false);
        setPasswordTarget(null);
        setNewPassword('');
      } else {
        alert("Failed: " + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert("Error changing password: " + err.message);
    }
  };

  // Profile pic upload handler
  const handleProfilePicUpload = async (userId, userType) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (file.size > 5 * 1024 * 1024) {
        alert("Image must be less than 5MB");
        return;
      }
      
      setProfilePicUploading(true);
      
      try {
        // Upload the file first
        const formData = new FormData();
        formData.append('file', file);
        
        const upRes = await fetch(`${API_BASE_URL}/api/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        
        if (!upRes.ok) throw new Error("Upload failed");
        const cloudData = await upRes.json();
        
        const mediaInfo = { url: cloudData.url, public_id: cloudData.public_id, type: cloudData.type };
        
        // Get current user data to preserve fields
        const userList = userType === 'teacher' ? teachers : students;
        const user = userList.find(u => u.id === userId);
        if (!user) throw new Error("User not found");
        
        // Update user with new profile pic
        const updateBody = userType === 'teacher' 
          ? { name: user.name, email: user.email, staff_id: user.staff_id, dept: user.dept, media: mediaInfo }
          : { name: user.name, email: user.email, reg_no: user.reg_no, class_dept: user.class_dept, section: user.section, media: mediaInfo };
        
        const res = await fetch(`${API_BASE_URL}/api/admin/${userType}/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(updateBody)
        });
        
        if (res.ok) {
          alert("Profile picture updated!");
          if (userType === 'teacher') fetchTeachers();
          else fetchStudents();
        } else {
          alert("Failed to update profile picture");
        }
      } catch (err) {
        alert("Error: " + err.message);
      } finally {
        setProfilePicUploading(false);
      }
    };
    input.click();
  };

  const toggleStudentSelection = (studentId) => {
    if (selectedStudents.includes(studentId)) {
      setSelectedStudents(selectedStudents.filter(id => id !== studentId));
    } else {
      setSelectedStudents([...selectedStudents, studentId]);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* SIDEBAR */}
      <div className="w-72 bg-slate-900 text-white p-8 flex flex-col">
        <h2 className="text-2xl font-black mb-10 text-emerald-400 italic">ADMIN PANEL</h2>
        <nav className="space-y-2 flex-1">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Registration</p>
          <button onClick={() => setActiveTab('student')} className={`w-full text-left p-4 rounded-xl font-bold uppercase text-xs transition-all ${activeTab === 'student' ? 'bg-emerald-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Add Student</button>
          <button onClick={() => setActiveTab('teacher')} className={`w-full text-left p-4 rounded-xl font-bold uppercase text-xs transition-all ${activeTab === 'teacher' ? 'bg-emerald-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Add Teacher</button>
          
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 mt-6">Management</p>
          <button onClick={() => setActiveTab('manage-students')} className={`w-full text-left p-4 rounded-xl font-bold uppercase text-xs transition-all ${activeTab === 'manage-students' ? 'bg-emerald-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Manage Students</button>
          <button onClick={() => setActiveTab('manage-teachers')} className={`w-full text-left p-4 rounded-xl font-bold uppercase text-xs transition-all ${activeTab === 'manage-teachers' ? 'bg-emerald-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Manage Teachers</button>
          <button onClick={() => setActiveTab('allocation')} className={`w-full text-left p-4 rounded-xl font-bold uppercase text-xs transition-all ${activeTab === 'allocation' ? 'bg-emerald-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Allocations</button>
        </nav>
        
        {/* Logout Button */}
        <div className="pt-6 border-t border-slate-700">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-xl font-bold uppercase text-xs bg-red-600 hover:bg-red-700 transition-all shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 p-12">
        {activeTab === 'manage-students' ? (
          <div className="max-w-7xl">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-black text-slate-800 uppercase italic">Manage <span className="text-emerald-600">Students</span></h1>
              <div className="flex gap-3">
                <button 
                  onClick={() => handleCSVUpload('student')} 
                  disabled={csvUploading}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase hover:bg-blue-700 disabled:opacity-50"
                >
                  {csvUploading ? 'Uploading...' : 'CSV Bulk Upload'}
                </button>
              </div>
            </div>
            
            {/* CSV Format Help */}
            <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <p className="text-xs font-bold text-blue-800 mb-1">CSV Format: name,email,password,reg_no,class_dept,section</p>
              <p className="text-xs text-blue-600">Example: John Doe,john@email.com,pass123,REG001,CSE,A</p>
            </div>
            
            {/* CSV Upload Results */}
            {csvResults && (
              <div className={`mb-4 p-4 rounded-xl border ${csvResults.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className="font-bold text-sm mb-1">{csvResults.message}</p>
                {csvResults.errors && csvResults.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    {csvResults.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-600">{err}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => setCsvResults(null)} className="text-xs text-slate-500 mt-2 hover:underline">Dismiss</button>
              </div>
            )}
            
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-4 text-left text-xs font-black uppercase">Photo</th>
                      <th className="p-4 text-left text-xs font-black uppercase">Name</th>
                      <th className="p-4 text-left text-xs font-black uppercase">Reg No</th>
                      <th className="p-4 text-left text-xs font-black uppercase">Email</th>
                      <th className="p-4 text-left text-xs font-black uppercase">Class</th>
                      <th className="p-4 text-left text-xs font-black uppercase">Section</th>
                      <th className="p-4 text-center text-xs font-black uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student, idx) => (
                      <tr key={student.id} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="p-4">
                          {student.media?.url ? (
                            <img src={student.media.url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <button 
                              onClick={() => handleProfilePicUpload(student.id, 'student')}
                              disabled={profilePicUploading}
                              className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                              title="Upload profile picture"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            </button>
                          )}
                        </td>
                        <td className="p-4 font-bold">{student.name}</td>
                        <td className="p-4 text-sm text-slate-600">{student.reg_no}</td>
                        <td className="p-4 text-sm text-slate-600">{student.email}</td>
                        <td className="p-4 text-sm font-bold">{student.class_dept}</td>
                        <td className="p-4 text-sm font-bold">{student.section}</td>
                        <td className="p-4">
                          <div className="flex gap-2 justify-center">
                            <button onClick={() => handleUpdateStudent(student)} className="bg-blue-100 text-blue-600 px-3 py-2 rounded-lg text-xs font-black uppercase hover:bg-blue-200">Edit</button>
                            <button onClick={() => { setPasswordTarget({ id: student.id, name: student.name, type: 'student' }); setShowPasswordModal(true); setNewPassword(''); }} className="bg-purple-100 text-purple-600 px-3 py-2 rounded-lg text-xs font-black uppercase hover:bg-purple-200">Password</button>
                            <button onClick={() => handleDeleteStudent(student.id)} className="bg-red-100 text-red-600 px-3 py-2 rounded-lg text-xs font-black uppercase hover:bg-red-200">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'manage-teachers' ? (
          <div className="max-w-7xl">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-black text-slate-800 uppercase italic">Manage <span className="text-emerald-600">Teachers</span></h1>
              <div className="flex gap-3">
                <button 
                  onClick={() => handleCSVUpload('teacher')} 
                  disabled={csvUploading}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase hover:bg-blue-700 disabled:opacity-50"
                >
                  {csvUploading ? 'Uploading...' : 'CSV Bulk Upload'}
                </button>
              </div>
            </div>
            
            {/* CSV Format Help */}
            <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <p className="text-xs font-bold text-blue-800 mb-1">CSV Format: name,email,password,staff_id,dept</p>
              <p className="text-xs text-blue-600">Example: Jane Smith,jane@email.com,pass123,STAFF001,Science</p>
            </div>
            
            {/* CSV Upload Results */}
            {csvResults && (
              <div className={`mb-4 p-4 rounded-xl border ${csvResults.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className="font-bold text-sm mb-1">{csvResults.message}</p>
                {csvResults.errors && csvResults.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    {csvResults.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-600">{err}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => setCsvResults(null)} className="text-xs text-slate-500 mt-2 hover:underline">Dismiss</button>
              </div>
            )}
            
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-4 text-left text-xs font-black uppercase">Photo</th>
                      <th className="p-4 text-left text-xs font-black uppercase">Name</th>
                      <th className="p-4 text-left text-xs font-black uppercase">Staff ID</th>
                      <th className="p-4 text-left text-xs font-black uppercase">Email</th>
                      <th className="p-4 text-left text-xs font-black uppercase">Department</th>
                      <th className="p-4 text-center text-xs font-black uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((teacher, idx) => (
                      <tr key={teacher.id} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="p-4">
                          {teacher.media?.url ? (
                            <img src={teacher.media.url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <button 
                              onClick={() => handleProfilePicUpload(teacher.id, 'teacher')}
                              disabled={profilePicUploading}
                              className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                              title="Upload profile picture"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            </button>
                          )}
                        </td>
                        <td className="p-4 font-bold">{teacher.name}</td>
                        <td className="p-4 text-sm text-slate-600">{teacher.staff_id}</td>
                        <td className="p-4 text-sm text-slate-600">{teacher.email}</td>
                        <td className="p-4 text-sm font-bold">{teacher.dept}</td>
                        <td className="p-4">
                          <div className="flex gap-2 justify-center">
                            <button onClick={() => handleUpdateTeacher(teacher)} className="bg-blue-100 text-blue-600 px-3 py-2 rounded-lg text-xs font-black uppercase hover:bg-blue-200">Edit</button>
                            <button onClick={() => { setPasswordTarget({ id: teacher.id, name: teacher.name, type: 'teacher' }); setShowPasswordModal(true); setNewPassword(''); }} className="bg-purple-100 text-purple-600 px-3 py-2 rounded-lg text-xs font-black uppercase hover:bg-purple-200">Password</button>
                            <button onClick={() => handleDeleteTeacher(teacher.id)} className="bg-red-100 text-red-600 px-3 py-2 rounded-lg text-xs font-black uppercase hover:bg-red-200">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'allocation' ? (
          <div className="max-w-7xl">
            <h1 className="text-3xl font-black text-slate-800 uppercase mb-8 italic">Teacher-Section <span className="text-emerald-600">Allocation</span></h1>
            <p className="text-slate-500 mb-6">Assign teachers to class sections. All students in the selected sections will have access to the teacher's content.</p>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Select Teacher */}
              <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase mb-6 tracking-widest">1. Select Teacher</h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {teachers.map(t => (
                    <div key={t.id} onClick={() => setSelectedTeacher(t)} 
                         className={`p-5 rounded-2xl cursor-pointer border-2 transition-all ${selectedTeacher?.id === t.id ? 'border-emerald-500 bg-emerald-50' : 'border-transparent bg-slate-50 hover:bg-slate-100'}`}>
                      <p className="font-black text-slate-800 uppercase text-sm">{t.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{t.dept} • {t.staff_id}</p>
                      {t.allocated_sections && t.allocated_sections.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] text-emerald-600 font-bold mb-1">Current Allocations:</p>
                          <div className="flex flex-wrap gap-1">
                            {t.allocated_sections.map(sec => (
                              <span key={sec} className="inline-flex items-center text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                {sec}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleRemoveSection(t.id, sec); }}
                                  className="ml-1 text-red-500 hover:text-red-700 font-bold"
                                  title="Remove this section"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditAllocModal(t); }}
                            className="mt-2 text-[9px] text-blue-600 font-bold hover:underline"
                          >
                            ✎ Edit All Allocations
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Select Sections */}
              <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase mb-6 tracking-widest">2. Select Class/Section</h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {availableSections.length === 0 ? (
                    <p className="text-slate-400 text-sm">No sections found. Register students first.</p>
                  ) : (
                    availableSections.map(section => (
                      <div key={section.id} onClick={() => toggleSectionSelection(section.id)} 
                           className={`p-5 rounded-2xl cursor-pointer border-2 transition-all ${selectedSections.includes(section.id) ? 'border-blue-500 bg-blue-50' : 'border-transparent bg-slate-50 hover:bg-slate-100'}`}>
                        <p className="font-black text-slate-800 uppercase text-sm">{section.class_dept} - {section.section}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{section.student_count} student(s)</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Confirm Allocation */}
              <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase mb-6 tracking-widest">3. Confirm</h3>
                {selectedTeacher ? (
                  <div className="space-y-6">
                    <div className="p-4 bg-slate-900 rounded-2xl text-white">
                      <p className="text-[10px] uppercase font-bold text-emerald-400">Teacher</p>
                      <p className="text-lg font-black">{selectedTeacher.name}</p>
                      <p className="text-xs text-slate-400">{selectedTeacher.dept}</p>
                    </div>
                    
                    <div className="p-4 bg-blue-50 rounded-2xl">
                      <p className="text-[10px] uppercase font-bold text-blue-600">Sections Selected</p>
                      <p className="text-2xl font-black text-blue-600">{selectedSections.length}</p>
                      {selectedSections.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {availableSections
                            .filter(s => selectedSections.includes(s.id))
                            .map(s => (
                              <span key={s.id} className="text-xs bg-blue-200 px-2 py-1 rounded-lg font-bold">
                                {s.class_dept}-{s.section}
                              </span>
                            ))
                          }
                        </div>
                      )}
                    </div>

                    <input 
                      type="text" 
                      value={allocationSubject} 
                      onChange={(e) => setAllocationSubject(e.target.value)}
                      placeholder="Subject (e.g., Mathematics)" 
                      className="w-full p-5 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-slate-100 focus:border-emerald-500" 
                    />
                    
                    <button 
                      onClick={handleSaveAllocation} 
                      className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase shadow-lg hover:bg-emerald-700 transition-all"
                    >
                      Save Allocation
                    </button>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-300 font-black uppercase italic">
                    Select a teacher
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-3xl font-black text-slate-800 uppercase mb-8 italic">New <span className="text-emerald-600">{activeTab}</span></h1>
            <form onSubmit={handleRegister} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Identity */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Identity</h3>
                <input type="text" placeholder="Full Name" required className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" 
                  value={activeTab === 'student' ? studentData.name : teacherData.name}
                  onChange={e => activeTab === 'student' ? setStudentData({...studentData, name: e.target.value}) : setTeacherData({...teacherData, name: e.target.value})} />
                
                {activeTab === 'student' ? (
                  <>
                    <input type="text" placeholder="Reg No" required className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" value={studentData.reg_no} onChange={e => setStudentData({...studentData, reg_no: e.target.value})} />
                    <input type="text" placeholder="Section (e.g. ECE A)" required className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-emerald-100" value={studentData.section} onChange={e => setStudentData({...studentData, section: e.target.value})} />
                  </>
                ) : (
                  <input type="text" placeholder="Staff ID" required className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" value={teacherData.staff_id} onChange={e => setTeacherData({...teacherData, staff_id: e.target.value})} />
                )}
                
                <input type="password" placeholder="Password" required className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" 
                  value={activeTab === 'student' ? studentData.password : teacherData.password}
                  onChange={e => activeTab === 'student' ? setStudentData({...studentData, password: e.target.value}) : setTeacherData({...teacherData, password: e.target.value})} />
              </div>

              {/* Details */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contact & Dept</h3>
                <input type="email" placeholder="Email" required className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" 
                  value={activeTab === 'student' ? studentData.email : teacherData.email}
                  onChange={e => activeTab === 'student' ? setStudentData({...studentData, email: e.target.value}) : setTeacherData({...teacherData, email: e.target.value})} />
                
                <input type="text" placeholder={activeTab === 'student' ? "Class/Department" : "Department"} required className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" 
                  value={activeTab === 'student' ? studentData.class_dept : teacherData.dept}
                  onChange={e => activeTab === 'student' ? setStudentData({...studentData, class_dept: e.target.value}) : setTeacherData({...teacherData, dept: e.target.value})} />
              </div>

              {/* Media */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col justify-between">
                <div className="relative h-64 w-full rounded-3xl bg-slate-50 border-4 border-dashed border-slate-200 flex items-center justify-center overflow-hidden hover:border-emerald-400">
                  {preview ? <img src={preview} className="h-full w-full object-cover" alt="preview" /> : <span className="text-xs font-black text-slate-400 uppercase">Profile Photo</span>}
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {
                    const file = e.target.files[0];
                    if (file) { setSelectedFile(file); setPreview(URL.createObjectURL(file)); }
                  }} />
                </div>
                <button disabled={loading} className="w-full mt-6 bg-slate-900 text-white font-black py-6 rounded-2xl hover:bg-emerald-600 transition-all uppercase tracking-widest disabled:opacity-50">
                  {loading ? "SAVING..." : `REGISTER ${activeTab}`}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      
      {/* Edit Allocations Modal */}
      {showEditAllocModal && editingAllocTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-black text-slate-800 mb-2">Edit Allocations</h3>
            <p className="text-sm text-slate-500 mb-4">
              Teacher: <strong>{editingAllocTeacher.name}</strong>
            </p>
            
            <p className="text-xs font-bold text-slate-400 uppercase mb-3">Select sections to allocate:</p>
            
            <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
              {availableSections.length === 0 ? (
                <p className="text-slate-400 text-sm">No sections available. Register students first.</p>
              ) : (
                availableSections.map(section => {
                  const sectionStr = `${section.class_dept} ${section.section}`;
                  const isSelected = editAllocSections.includes(sectionStr);
                  return (
                    <div
                      key={section.id}
                      onClick={() => toggleEditAllocSection(sectionStr)}
                      className={`p-4 rounded-xl cursor-pointer border-2 transition-all ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-transparent bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{section.class_dept} - {section.section}</p>
                          <p className="text-[10px] text-slate-400">{section.student_count} student(s)</p>
                        </div>
                        {isSelected && (
                          <span className="text-blue-500 font-bold text-lg">✓</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl mb-6">
              <p className="text-xs font-bold text-slate-500 mb-2">Currently selected ({editAllocSections.length}):</p>
              {editAllocSections.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {editAllocSections.map(sec => (
                    <span key={sec} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold">
                      {sec}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm italic">No sections selected</p>
              )}
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowEditAllocModal(false); setEditingAllocTeacher(null); }}
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEditedAllocations}
                className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Change Password Modal */}
      {showPasswordModal && passwordTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-black text-slate-800 mb-2">Change Password</h3>
            <p className="text-sm text-slate-500 mb-6">
              {passwordTarget.type === 'student' ? 'Student' : 'Teacher'}: <strong>{passwordTarget.name}</strong>
            </p>
            
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password" 
              className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-slate-100 focus:border-purple-500 mb-6"
            />
            
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowPasswordModal(false); setPasswordTarget(null); setNewPassword(''); }}
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleChangePassword}
                disabled={!newPassword || newPassword.length < 4}
                className="flex-1 px-6 py-3 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600 disabled:bg-slate-300"
              >
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
