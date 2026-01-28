import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ModuleBuilder from './ModuleBuilder';
import NotificationBell from '../components/NotificationBell';
import LiveSessionsCalendar from '../components/LiveSessionsCalendar';
import Chat from '../components/Chat';
import API_BASE_URL from '../config/api';

function TeacherDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('students');
  const [teacherInfo, setTeacherInfo] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [loading, setLoading] = useState(true);
  const [allAllocations, setAllAllocations] = useState([]); // Store all teacher's class allocations
  const [showChat, setShowChat] = useState(false);
  
  // Class Roster filtering states
  const [filterMode, setFilterMode] = useState('department'); // 'department' or 'subject'
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedDeptSection, setSelectedDeptSection] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [filteredStudents, setFilteredStudents] = useState([]);
  
  // MCQ Test states
  const [tests, setTests] = useState([]);
  const [showCreateTest, setShowCreateTest] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null); // For viewing test submissions
  const [testSubmissions, setTestSubmissions] = useState([]); // Student submissions for selected test
  const [testForm, setTestForm] = useState({
    title: '',
    description: '',
    start_date: '',
    deadline: ''
  });
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState({
    question: '',
    a: '',
    b: '',
    c: '',
    d: '',
    correct: 'A'
  });
  
  // Student progress modal
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentProgress, setStudentProgress] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);

  const token = localStorage.getItem('token');
  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  // Helper functions for filtering
  const getUniqueDepartments = useCallback(() => {
    const depts = [...new Set(allAllocations.map(a => a.department))];
    return depts.sort();
  }, [allAllocations]);

  const getSectionsForDepartment = useCallback((dept) => {
    const sections = allAllocations
      .filter(a => a.department === dept)
      .map(a => a.section);
    return [...new Set(sections)].sort();
  }, [allAllocations]);

  const getUniqueSubjects = useCallback(() => {
    const subjects = [...new Set(allAllocations.map(a => a.subject))];
    return subjects.sort();
  }, [allAllocations]);

  const getStudentsByDepartmentSection = useCallback((dept, section) => {
    const allocation = allAllocations.find(
      a => a.department === dept && a.section === section
    );
    return allocation ? allocation.students : [];
  }, [allAllocations]);

  const getStudentsBySubject = useCallback((subject) => {
    const allocations = allAllocations.filter(a => a.subject === subject);
    return allocations;
  }, [allAllocations]);

  // Update filtered students when selections change
  useEffect(() => {
    if (filterMode === 'department' && selectedDepartment && selectedDeptSection) {
      const students = getStudentsByDepartmentSection(selectedDepartment, selectedDeptSection);
      setFilteredStudents(students);
    } else if (filterMode === 'subject' && selectedSubject) {
      const allocations = getStudentsBySubject(selectedSubject);
      // Flatten all students from all sections teaching this subject
      const allStudents = allocations.flatMap(a => 
        a.students.map(s => ({
          ...s,
          subject: a.subject,
          department: a.department,
          section: a.section
        }))
      );
      setFilteredStudents(allStudents);
    } else {
      setFilteredStudents([]);
    }
  }, [filterMode, selectedDepartment, selectedDeptSection, selectedSubject, getStudentsByDepartmentSection, getStudentsBySubject]);

  // Get subject(s) for selected section
  const getSubjectForSection = useCallback((section) => {
    const allocations = allAllocations.filter(a => a.fullSection === section);
    if (allocations.length === 0) return null;
    
    // Get unique subjects for this section
    const subjects = [...new Set(allocations.map(a => a.subject))];
    return subjects.join(', ');
  }, [allAllocations]);

// In TeacherDashboard.jsx, ensure this part looks like this:
const fetchTeacherProfile = useCallback(async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teacher/me`, { headers: authHeaders() });
    if (!res.ok) { 
      console.error("Failed to fetch teacher profile, status:", res.status);
      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        navigate('/'); 
      }
      return; 
    }
    const data = await res.json();
    console.log("Teacher profile loaded:", data);
    setTeacherInfo(data);
    
    // Store the allocated_sections from database (this is the source of truth)
    const allocatedSectionsFromDB = data.allocated_sections || [];
    
    // Set initial selected section if teacher has allocations
    if (allocatedSectionsFromDB.length > 0) {
      setSelectedSection(allocatedSectionsFromDB[0]);
    }
    
    // Fetch teacher's allocated students from new system
    const allocRes = await fetch(`${API_BASE_URL}/api/teacher/my-students`, {
      headers: authHeaders()
    });
    
    if (allocRes.ok) {
      const allocData = await allocRes.json();
      console.log("Teacher allocations:", allocData);
      
      // Group by subject and section
      const groupedAllocations = {};
      allocData.forEach(item => {
        const key = `${item.subject}|${item.class_dept} ${item.section}`;
        if (!groupedAllocations[key]) {
          groupedAllocations[key] = {
            subject: item.subject,
            department: item.class_dept,
            section: item.section,
            fullSection: `${item.class_dept} ${item.section}`,
            students: []
          };
        }
        // Store with mapped field names for consistency
        groupedAllocations[key].students.push({
          id: item.student_id,
          name: item.student_name,
          reg_no: item.reg_no,
          class_dept: item.class_dept,
          section: item.section
        });
      });
      
      const allocationsArray = Object.values(groupedAllocations);
      console.log("Grouped allocations:", allocationsArray);
      setAllAllocations(allocationsArray);
      
      // Don't overwrite allocated_sections - keep the one from database
      // Just auto-select subject if teacher has only one
      const uniqueSubjects = [...new Set(allocData.map(item => item.subject))];
      if (uniqueSubjects.length === 1) {
        setSelectedSubject(uniqueSubjects[0]);
        console.log("Auto-selected single subject:", uniqueSubjects[0]);
      }
    } else {
      // No student data, but teacher may still have allocated_sections from DB
      console.log("No student allocations found, using sections from DB:", allocatedSectionsFromDB);
    }
  } catch (err) { 
    console.error("Failed to connect to server:", err);
    alert("Failed to load teacher profile. Please check your connection and try again.");
  }
}, [navigate, authHeaders]);

  const fetchStudents = useCallback(async () => {
      if (!selectedSection || !teacherInfo) return;

      try {
        // Fetch from new allocation system
        const res = await fetch(`${API_BASE_URL}/api/teacher/my-students`, { 
          headers: authHeaders() 
        });
        
        if (!res.ok) throw new Error("Server responded with error");
        
        const data = await res.json();
        
        // Filter by selected section and map to expected format
        const filteredStudents = data
          .filter(item => `${item.class_dept} ${item.section}` === selectedSection)
          .map(item => ({
            id: item.student_id,
            name: item.student_name,
            reg_no: item.reg_no,
            class_dept: item.class_dept,
            section: item.section,
            email: item.student_email
          }));
        
        console.log("Filtered students for section:", selectedSection, filteredStudents);
        setStudents(Array.isArray(filteredStudents) ? filteredStudents : []);
      } catch (err) {
        console.error("Frontend Fetch Error:", err);
        setStudents([]); 
      }
    }, [selectedSection, teacherInfo, authHeaders]);


  useEffect(() => {
    fetchTeacherProfile().finally(() => {
      console.log("Setting loading to false");
      setLoading(false);
    });
  }, [fetchTeacherProfile]);

  useEffect(() => {
    fetchStudents();
  }, [selectedSection, fetchStudents]);
  
  // Fetch tests when Tests tab is active
  const fetchTests = useCallback(async () => {
    if (!selectedSection) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/teacher/tests/${encodeURIComponent(selectedSection)}`, {
        headers: authHeaders()
      });
      const data = await res.json();
      setTests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch Tests Error:", err);
    }
  }, [selectedSection, authHeaders]);
  
  useEffect(() => {
    if (activeTab === 'tests') {
      fetchTests();
    }
  }, [activeTab, selectedSection, fetchTests]);
  
  // Fetch test submissions for a specific test
  const fetchTestSubmissions = useCallback(async (testId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/teacher/test/${testId}/submissions`, {
        headers: authHeaders()
      });
      const data = await res.json();
      setTestSubmissions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch Submissions Error:", err);
      setTestSubmissions([]);
    }
  }, [authHeaders]);
  
  // View test submissions
  const handleViewTestSubmissions = async (test) => {
    setSelectedTest(test);
    await fetchTestSubmissions(test.test_id);
  };
  
  // Close test submissions view
  const handleCloseTestView = () => {
    setSelectedTest(null);
    setTestSubmissions([]);
  };
  
  // Add question to list
  const handleAddQuestion = () => {
    if (!currentQuestion.question.trim() || !currentQuestion.a.trim() || !currentQuestion.b.trim() || !currentQuestion.c.trim() || !currentQuestion.d.trim()) {
      alert("Please fill all question fields (question and all 4 options)");
      return;
    }
    
    if (questions.length >= 20) {
      alert("Maximum 20 questions allowed per test");
      return;
    }
    
    setQuestions([...questions, { ...currentQuestion }]);
    setCurrentQuestion({ question: '', a: '', b: '', c: '', d: '', correct: 'A' });
    alert(`Question ${questions.length + 1} added successfully!`);
  };
  
  // Handle CSV Upload
  const handleCSVUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        // Skip header row if it exists
        const startIndex = lines[0].toLowerCase().includes('question') ? 1 : 0;
        
        const parsedQuestions = [];
        for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Parse CSV line (handle commas in quotes)
          const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g).map(val => 
            val.replace(/^"|"$/g, '').trim()
          );
          
          if (values.length >= 6) {
            parsedQuestions.push({
              question: values[0],
              a: values[1],
              b: values[2],
              c: values[3],
              d: values[4],
              correct: values[5].toUpperCase()
            });
          }
        }
        
        if (parsedQuestions.length > 0) {
          setQuestions([...questions, ...parsedQuestions]);
          alert(`Successfully imported ${parsedQuestions.length} questions!`);
        } else {
          alert("No valid questions found in CSV");
        }
      } catch (err) {
        console.error("CSV Parse Error:", err);
        alert("Failed to parse CSV. Please check the format.");
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };
  
  // Create test
  const handleCreateTest = async () => {
    if (!testForm.title.trim()) {
      alert("Please enter a test title");
      return;
    }
    
    if (!testForm.start_date || !testForm.deadline) {
      alert("Please select both start date and deadline");
      return;
    }
    
    if (new Date(testForm.start_date) >= new Date(testForm.deadline)) {
      alert("Deadline must be after start date");
      return;
    }
    
    if (questions.length < 5) {
      alert("Please add at least 5 questions to create a test");
      return;
    }
    
    if (!selectedSection) {
      alert("Please select a section for this test");
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/teacher/test/create`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          section: selectedSection,
          title: testForm.title,
          description: testForm.description || '',
          questions: questions,
          start_date: testForm.start_date,
          deadline: testForm.deadline
        })
      });
      
      if (res.ok) {
        alert(`Test "${testForm.title}" created successfully with ${questions.length} questions!`);
        setShowCreateTest(false);
        setTestForm({ title: '', description: '', start_date: '', deadline: '' });
        setQuestions([]);
        setCurrentQuestion({ question: '', a: '', b: '', c: '', d: '', correct: 'A' });
        fetchTests();
      }
    } catch (err) {
      alert("Failed to create test");
      console.error(err);
    }
  };
  
  // View student progress
  const viewStudentProgress = async (student) => {
    try {
      // Fetch test progress
      const res = await fetch(`${API_BASE_URL}/api/teacher/student/${student.id}/progress`, {
        headers: authHeaders()
      });
      const testData = await res.json();
      
      // Fetch module progress
      const moduleRes = await fetch(`${API_BASE_URL}/api/teacher/student/${student.id}/module-progress`, {
        headers: authHeaders()
      });
      const moduleData = await moduleRes.json();
      
      console.log("Student Progress Data:", { tests: testData, modules: moduleData });
      
      setSelectedStudent(student);
      setStudentProgress({ ...testData, moduleProgress: moduleData });
      setShowProgressModal(true);
    } catch (err) {
      console.error("Failed to load student progress:", err);
      alert("Failed to load student progress. Check console for details.");
    }
  };

  if (loading) {
    console.log("TeacherDashboard: Loading...");
    return <div className="h-screen flex items-center justify-center bg-slate-900 text-emerald-400 font-black">Establishing Secure Connection...</div>;
  }
  
  console.log("TeacherDashboard: Loading complete, teacherInfo:", teacherInfo);
  
  if (!teacherInfo) {
    console.log("TeacherDashboard: No teacher info, showing error screen");
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <h2 className="text-2xl font-black text-emerald-400 mb-4">Failed to Load Profile</h2>
        <p className="text-slate-400 mb-6">Unable to fetch teacher information</p>
        <button 
          onClick={() => { localStorage.clear(); navigate('/'); }} 
          className="bg-emerald-600 px-8 py-4 rounded-xl font-black uppercase hover:bg-emerald-700"
        >
          Back to Login
        </button>
      </div>
    );
  }

  console.log("TeacherDashboard: Rendering dashboard with teacherInfo:", teacherInfo);
  console.log("TeacherDashboard: selectedSection:", selectedSection);
  console.log("TeacherDashboard: activeTab:", activeTab);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* SIDEBAR */}
      <aside className="w-80 bg-slate-900 text-white p-8 flex flex-col shadow-2xl z-10">
        <h2 className="text-3xl font-black text-emerald-400 italic mb-12">TEACHER<span className="text-white">DASH</span></h2>
        <nav className="flex-1 space-y-3">
          {[
            { id: 'students', label: 'Class Roster', icon: '' }, 
            { id: 'modules', label: 'Module Builder', icon: '' },
            { id: 'tests', label: 'MCQ Tests', icon: '' },
            { id: 'live', label: 'Live Sessions', icon: '' }
          ].map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full text-left p-5 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center gap-4 ${activeTab === item.id ? 'bg-emerald-600' : 'hover:bg-white/5 text-slate-500'}`}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="space-y-3">
          <button 
            onClick={() => navigate('/setup-authenticator')} 
            className="w-full p-5 rounded-2xl bg-emerald-500/10 text-emerald-500 font-black uppercase text-[10px] flex items-center gap-3"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Security
          </button>
          <button 
            onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user_role'); localStorage.removeItem('user_data'); navigate('/'); }} 
            className="w-full p-5 rounded-2xl bg-red-500/10 text-red-500 font-black uppercase text-[10px]"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-14 overflow-y-auto">
        <header className="flex justify-between items-center mb-16">
          <div>
            <h1 className="text-5xl font-black text-slate-800 uppercase italic">{activeTab}</h1>
            <div className="flex items-center gap-3 mt-2">
              <p className="text-slate-400 font-bold text-xs">
                Section: <span className="text-emerald-500">{selectedSection || 'None'}</span>
              </p>
              {selectedSection && getSubjectForSection(selectedSection) && (activeTab === 'modules' || activeTab === 'tests') && (
                <>
                  <span className="text-slate-300">•</span>
                  <p className="text-slate-400 font-bold text-xs">
                    Subject: <span className="text-purple-600 font-black">{getSubjectForSection(selectedSection)}</span>
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowChat(true)} 
              className="relative p-2 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Messages"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
            <NotificationBell />
            <div className="flex gap-3 bg-white p-3 rounded-full shadow-xl">
              {teacherInfo?.allocated_sections && Array.isArray(teacherInfo.allocated_sections) && teacherInfo.allocated_sections.length > 0 ? (
                teacherInfo.allocated_sections.map(sec => (
                  <button key={sec} onClick={() => setSelectedSection(sec)} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase transition-all ${selectedSection === sec ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>{sec}</button>
                ))
              ) : (
                <p className="text-xs text-slate-400 px-4">No sections allocated</p>
              )}
            </div>
          </div>
        </header>

        {activeTab === 'modules' ? (
          teacherInfo ? (
            <ModuleBuilder 
              selectedSection={selectedSection} 
              authHeaders={authHeaders} 
              allocatedSections={teacherInfo.allocated_sections || []}
            />
          ) : (
            <div className="max-w-6xl mx-auto">
              <div className="bg-slate-50 border-2 border-slate-200 rounded-3xl p-12 text-center">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-slate-200 rounded w-3/4 mx-auto"></div>
                  <div className="h-4 bg-slate-200 rounded w-1/2 mx-auto"></div>
                </div>
                <p className="text-slate-400 mt-4">Loading teacher data...</p>
              </div>
            </div>
          )
        ) : activeTab === 'live' ? (
          <div className="max-w-4xl">
            <div className="mb-8">
              <h2 className="text-2xl font-black text-slate-800 mb-2">Scheduled Live Sessions</h2>
              <p className="text-slate-500">View and manage your upcoming live video sessions with students</p>
            </div>
            <LiveSessionsCalendar userType="teacher" />
          </div>
        ) : activeTab === 'tests' ? (
          <div>
            {selectedTest ? (
              /* Test Submissions View */
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <button 
                      onClick={handleCloseTestView}
                      className="text-emerald-600 font-bold text-sm mb-2 hover:text-emerald-700"
                    >
                      Back to Tests
                    </button>
                    <h2 className="text-3xl font-black text-slate-800">{selectedTest.title}</h2>
                    <p className="text-slate-500 text-sm mt-1">
                      {selectedTest.total_questions} Questions • Deadline: {new Date(selectedTest.deadline).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl shadow-lg">
                    <p className="text-xs text-slate-400 font-bold uppercase">Total Submissions</p>
                    <p className="text-3xl font-black text-emerald-600">{testSubmissions.length}</p>
                  </div>
                </div>

                {testSubmissions.length === 0 ? (
                  <div className="text-center py-24 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                    <div className="text-6xl mb-4 text-slate-300">T</div>
                    <p className="text-slate-400 font-medium mb-2">No submissions yet</p>
                    <p className="text-xs text-slate-500">Students haven't taken this test</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-900 text-white">
                          <tr>
                            <th className="p-4 text-left text-xs font-black uppercase">Student Name</th>
                            <th className="p-4 text-left text-xs font-black uppercase">Reg No</th>
                            <th className="p-4 text-center text-xs font-black uppercase">Score</th>
                            <th className="p-4 text-center text-xs font-black uppercase">Percentage</th>
                            <th className="p-4 text-center text-xs font-black uppercase">Status</th>
                            <th className="p-4 text-center text-xs font-black uppercase">Submitted At</th>
                            <th className="p-4 text-center text-xs font-black uppercase">Time Taken</th>
                          </tr>
                        </thead>
                        <tbody>
                          {testSubmissions.map((submission, idx) => (
                            <tr key={submission.id} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                              <td className="p-4 font-bold text-slate-800">{submission.student_name}</td>
                              <td className="p-4 text-sm text-slate-600">{submission.student_reg_no}</td>
                              <td className="p-4 text-center">
                                <span className="font-black text-lg text-emerald-600">
                                  {submission.score}/{selectedTest.total_questions}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <div className={`inline-block px-4 py-2 rounded-full font-black ${
                                  submission.percentage >= 50 
                                    ? 'bg-emerald-100 text-emerald-700' 
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {submission.percentage}%
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                                  submission.status === 'completed' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-orange-100 text-orange-700'
                                }`}>
                                  {submission.status}
                                </span>
                              </td>
                              <td className="p-4 text-center text-sm text-slate-600">
                                {new Date(submission.submitted_at).toLocaleString()}
                              </td>
                              <td className="p-4 text-center text-sm font-bold text-slate-700">
                                {submission.time_taken ? `${Math.floor(submission.time_taken / 60)}m ${submission.time_taken % 60}s` : 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Summary Statistics */}
                    <div className="border-t bg-slate-50 p-6">
                      <div className="grid grid-cols-4 gap-4">
                        <div className="text-center">
                          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Average Score</p>
                          <p className="text-2xl font-black text-blue-600">
                            {testSubmissions.length > 0 
                              ? (testSubmissions.reduce((sum, s) => sum + parseFloat(s.percentage), 0) / testSubmissions.length).toFixed(2)
                              : 0}%
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Passed (≥50%)</p>
                          <p className="text-2xl font-black text-emerald-600">
                            {testSubmissions.filter(s => s.percentage >= 50).length}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Failed (&lt;50%)</p>
                          <p className="text-2xl font-black text-red-600">
                            {testSubmissions.filter(s => s.percentage < 50).length}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Completion Rate</p>
                          <p className="text-2xl font-black text-slate-700">
                            {/* This would need total students in section to calculate properly */}
                            {testSubmissions.length}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : !showCreateTest ? (
              <div>
                <div className="flex gap-4 mb-8">
                  <button onClick={() => setShowCreateTest(true)} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-emerald-700">
                    + Create New Test
                  </button>
                </div>
                
                {tests.length === 0 ? (
                  <div className="text-center py-24 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                    <p className="text-slate-400 font-medium mb-4">No tests created yet for {selectedSection}</p>
                    <button onClick={() => setShowCreateTest(true)} className="text-emerald-600 font-bold underline">
                      Create your first test
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        Tests for {selectedSection}
                      </h3>
                      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                        {tests.length} Total
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {tests.map(test => (
                        <div key={test.test_id} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1">
                              <h3 className="text-lg font-black text-slate-800 mb-2">{test.title}</h3>
                              <p className="text-xs text-slate-500 mb-3">
                                Created: {new Date(test.created_at).toLocaleDateString()}
                              </p>
                              <div className="flex gap-2 text-xs">
                                <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold">
                                  {test.total_questions} Questions
                                </span>
                                <span className={`px-3 py-1 rounded-full font-bold ${
                                  new Date(test.deadline) > new Date() 
                                    ? 'bg-green-50 text-green-600' 
                                    : 'bg-red-50 text-red-600'
                                }`}>
                                  {new Date(test.deadline) > new Date() ? 'Active' : 'Expired'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="border-t pt-4 mt-4">
                            <p className="text-xs text-slate-400 font-bold mb-2">DEADLINE</p>
                            <p className="text-sm font-bold text-slate-700">
                              {new Date(test.deadline).toLocaleString()}
                            </p>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 mt-6">
                            <div className="bg-slate-50 p-3 rounded-xl text-center">
                              <p className="text-2xl font-black text-emerald-600">{test.total_submissions || 0}</p>
                              <p className="text-[10px] text-slate-400 uppercase font-bold">Submissions</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl text-center">
                              <p className="text-2xl font-black text-blue-600">{test.average_score || 0}%</p>
                              <p className="text-[10px] text-slate-400 uppercase font-bold">Avg Score</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl text-center">
                              <p className="text-2xl font-black text-slate-600">{test.passed_count || 0}</p>
                              <p className="text-[10px] text-slate-400 uppercase font-bold">Passed</p>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => handleViewTestSubmissions(test)}
                            className="w-full mt-6 bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-xs hover:bg-emerald-700 transition-all"
                          >
                            View Student Submissions
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-10 rounded-[3rem] shadow-xl">
                <h2 className="text-2xl font-black mb-8">Create MCQ Test</h2>
                
                <div className="space-y-6 mb-8">
                  <input type="text" placeholder="Test Title" className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={testForm.title} onChange={e => setTestForm({...testForm, title: e.target.value})} />
                  <textarea placeholder="Description" className="w-full p-4 bg-slate-50 rounded-xl font-medium h-24" value={testForm.description} onChange={e => setTestForm({...testForm, description: e.target.value})} />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-2 block">Start Date & Time</label>
                      <input type="datetime-local" className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={testForm.start_date} onChange={e => setTestForm({...testForm, start_date: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-2 block">Deadline (End Date & Time)</label>
                      <input type="datetime-local" className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={testForm.deadline} onChange={e => setTestForm({...testForm, deadline: e.target.value})} />
                    </div>
                  </div>
                </div>
                
                {/* CSV Upload Section */}
                <div className="border-t pt-8 mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black">Add Questions ({questions.length} added)</h3>
                    <button
                      onClick={() => document.getElementById('csv-upload').click()}
                      className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 flex items-center gap-2"
                    >
                      Upload CSV
                    </button>
                    <input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCSVUpload}
                    />
                  </div>
                  
                  {/* CSV Format Help */}
                  <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-xs font-bold text-blue-800 mb-2">CSV Format:</p>
                    <code className="text-xs text-blue-700 block">
                      question,option_a,option_b,option_c,option_d,correct_answer
                    </code>
                    <p className="text-xs text-blue-600 mt-2">
                      Example: "What is 2+2?,2,3,4,5,C" (correct_answer: A/B/C/D)
                    </p>
                  </div>
                  
                  <div className="bg-slate-50 p-6 rounded-2xl space-y-4 mb-4">
                    <h4 className="text-sm font-bold text-slate-600 mb-2">Add Question Manually</h4>
                    <input 
                      type="text" 
                      placeholder="Question text" 
                      className="w-full p-4 bg-white border border-slate-200 rounded-xl" 
                      value={currentQuestion.question} 
                      onChange={e => setCurrentQuestion({...currentQuestion, question: e.target.value})} 
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="text" 
                        placeholder="Option A" 
                        className="p-4 bg-white border border-slate-200 rounded-xl" 
                        value={currentQuestion.a} 
                        onChange={e => setCurrentQuestion({...currentQuestion, a: e.target.value})} 
                      />
                      <input 
                        type="text" 
                        placeholder="Option B" 
                        className="p-4 bg-white border border-slate-200 rounded-xl" 
                        value={currentQuestion.b} 
                        onChange={e => setCurrentQuestion({...currentQuestion, b: e.target.value})} 
                      />
                      <input 
                        type="text" 
                        placeholder="Option C" 
                        className="p-4 bg-white border border-slate-200 rounded-xl" 
                        value={currentQuestion.c} 
                        onChange={e => setCurrentQuestion({...currentQuestion, c: e.target.value})} 
                      />
                      <input 
                        type="text" 
                        placeholder="Option D" 
                        className="p-4 bg-white border border-slate-200 rounded-xl" 
                        value={currentQuestion.d} 
                        onChange={e => setCurrentQuestion({...currentQuestion, d: e.target.value})} 
                      />
                    </div>
                    <select 
                      className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold" 
                      value={currentQuestion.correct} 
                      onChange={e => setCurrentQuestion({...currentQuestion, correct: e.target.value})}
                    >
                      <option value="A">Correct Answer: A</option>
                      <option value="B">Correct Answer: B</option>
                      <option value="C">Correct Answer: C</option>
                      <option value="D">Correct Answer: D</option>
                    </select>
                    <button 
                      onClick={handleAddQuestion} 
                      className="w-full bg-emerald-600 text-white p-4 rounded-xl font-black uppercase text-xs hover:bg-emerald-700 transition-colors"
                      disabled={questions.length >= 20}
                    >
                      {questions.length >= 20 ? 'Maximum Questions Reached' : 'Add This Question'}
                    </button>
                  </div>
                  
                  {questions.length > 0 && (
                    <div className="mt-6 space-y-2">
                      <div className="flex justify-between items-center mb-3 p-3 bg-emerald-50 rounded-xl">
                        <span className="text-sm font-bold text-emerald-700">
                          {questions.length} question{questions.length !== 1 ? 's' : ''} added - {questions.length >= 5 ? 'Ready to create test' : `Add ${5 - questions.length} more (minimum 5 required)`}
                        </span>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to clear all questions?')) {
                              setQuestions([]);
                            }
                          }}
                          className="text-xs font-bold text-red-600 hover:text-red-700 px-3 py-1 rounded-lg hover:bg-red-50"
                        >
                          Clear All
                        </button>
                      </div>
                      {questions.map((q, i) => (
                        <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl flex justify-between items-start hover:border-emerald-300 transition-colors">
                          <div className="flex-1">
                            <span className="font-bold text-sm text-slate-700">{i + 1}. {q.question}</span>
                            <div className="text-xs text-slate-500 mt-2 grid grid-cols-2 gap-2">
                              <div>A: {q.a}</div>
                              <div>B: {q.b}</div>
                              <div>C: {q.c}</div>
                              <div>D: {q.d}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-4">
                            <span className="text-xs text-white font-black bg-emerald-600 px-3 py-1 rounded-lg">Ans: {q.correct}</span>
                            <button
                              onClick={() => {
                                if (confirm('Remove this question?')) {
                                  setQuestions(questions.filter((_, idx) => idx !== i));
                                }
                              }}
                              className="text-red-600 hover:text-red-700 font-bold text-lg w-8 h-8 flex items-center justify-center hover:bg-red-50 rounded-lg"
                              title="Remove question"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-4">
                  <button onClick={() => {setShowCreateTest(false); setQuestions([]);}} className="flex-1 bg-slate-100 text-slate-600 p-4 rounded-xl font-black uppercase text-xs">Cancel</button>
                  <button onClick={handleCreateTest} className="flex-1 bg-slate-900 text-white p-4 rounded-xl font-black uppercase text-xs">Create Test</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Class Roster - Filtering Interface */}
            {allAllocations.length === 0 ? (
              <div className="text-center py-24 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </div>
                <p className="text-slate-400 font-medium mb-2">No classes allocated yet</p>
                <p className="text-xs text-slate-500">Contact admin to assign students to your classes</p>
              </div>
            ) : (
              <div>
                {/* Filter Mode Selection */}
                <div className="mb-8 bg-white p-6 rounded-[2rem] shadow-lg border-2 border-slate-100">
                  <h3 className="text-sm font-black text-slate-600 uppercase mb-4">Filter By:</h3>
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setFilterMode('department');
                        setSelectedDepartment('');
                        setSelectedDeptSection('');
                        setSelectedSubject('');
                      }}
                      className={`flex-1 py-4 px-6 rounded-xl font-black uppercase text-sm transition-all ${
                        filterMode === 'department'
                          ? 'bg-emerald-600 text-white shadow-lg'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Department & Section
                    </button>
                    <button
                      onClick={() => {
                        setFilterMode('subject');
                        setSelectedDepartment('');
                        setSelectedDeptSection('');
                        setSelectedSubject('');
                      }}
                      className={`flex-1 py-4 px-6 rounded-xl font-black uppercase text-sm transition-all ${
                        filterMode === 'subject'
                          ? 'bg-emerald-600 text-white shadow-lg'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Subject
                    </button>
                  </div>
                </div>

                {/* Department-based Filtering */}
                {filterMode === 'department' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* Step 1: Select Department */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-lg border-2 border-slate-100">
                      <h3 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-widest">
                        1. Select Department
                      </h3>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {getUniqueDepartments().map(dept => (
                          <button
                            key={dept}
                            onClick={() => {
                              setSelectedDepartment(dept);
                              setSelectedDeptSection('');
                            }}
                            className={`w-full p-4 rounded-xl text-left font-bold transition-all ${
                              selectedDepartment === dept
                                ? 'bg-emerald-600 text-white shadow-lg'
                                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {dept}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Step 2: Select Section */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-lg border-2 border-slate-100">
                      <h3 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-widest">
                        2. Select Section
                      </h3>
                      {selectedDepartment ? (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {getSectionsForDepartment(selectedDepartment).map(section => (
                            <button
                              key={section}
                              onClick={() => setSelectedDeptSection(section)}
                              className={`w-full p-4 rounded-xl text-left font-bold transition-all ${
                                selectedDeptSection === section
                                  ? 'bg-blue-600 text-white shadow-lg'
                                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              Section {section}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="h-32 flex items-center justify-center text-slate-300 text-sm italic">
                          Select a department first
                        </div>
                      )}
                    </div>

                    {/* Step 3: Summary */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-lg border-2 border-slate-100">
                      <h3 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-widest">
                        3. Summary
                      </h3>
                      {selectedDepartment && selectedDeptSection ? (
                        <div className="space-y-4">
                          <div className="p-4 bg-emerald-50 rounded-xl">
                            <p className="text-xs text-emerald-600 font-bold uppercase">Department</p>
                            <p className="text-lg font-black text-emerald-800">{selectedDepartment}</p>
                          </div>
                          <div className="p-4 bg-blue-50 rounded-xl">
                            <p className="text-xs text-blue-600 font-bold uppercase">Section</p>
                            <p className="text-lg font-black text-blue-800">{selectedDeptSection}</p>
                          </div>
                          <div className="p-4 bg-slate-900 rounded-xl text-white">
                            <p className="text-xs text-emerald-400 font-bold uppercase">Students</p>
                            <p className="text-3xl font-black">{filteredStudents.length}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="h-32 flex items-center justify-center text-slate-300 text-sm italic">
                          Make selections to see summary
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Subject-based Filtering */}
                {filterMode === 'subject' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Step 1: Select Subject */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-lg border-2 border-slate-100">
                      <h3 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-widest">
                        1. Select Subject
                      </h3>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {getUniqueSubjects().map(subject => (
                          <button
                            key={subject}
                            onClick={() => setSelectedSubject(subject)}
                            className={`w-full p-4 rounded-xl text-left font-bold transition-all ${
                              selectedSubject === subject
                                ? 'bg-purple-600 text-white shadow-lg'
                                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {subject}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Step 2: Summary */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-lg border-2 border-slate-100">
                      <h3 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-widest">
                        2. Classes Teaching This Subject
                      </h3>
                      {selectedSubject ? (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                          {getStudentsBySubject(selectedSubject).map((allocation, idx) => (
                            <div key={idx} className="p-4 bg-purple-50 rounded-xl border-2 border-purple-200">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="text-sm font-black text-purple-800">
                                    {allocation.department} - Section {allocation.section}
                                  </p>
                                  <p className="text-xs text-purple-600 font-bold">{allocation.subject}</p>
                                </div>
                                <div className="bg-purple-600 text-white px-3 py-1 rounded-full">
                                  <span className="text-xs font-black">{allocation.students.length} students</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="p-4 bg-slate-900 rounded-xl text-white mt-4">
                            <p className="text-xs text-emerald-400 font-bold uppercase">Total Students</p>
                            <p className="text-3xl font-black">{filteredStudents.length}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="h-32 flex items-center justify-center text-slate-300 text-sm italic">
                          Select a subject to see classes
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Student List Display */}
                {filteredStudents.length > 0 && (
                  <div className="bg-white p-8 rounded-[2rem] shadow-lg border-2 border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-xl font-black text-slate-800">Student List</h3>
                        {filterMode === 'department' && (
                          <p className="text-sm text-slate-500">
                            {selectedDepartment} - Section {selectedDeptSection}
                          </p>
                        )}
                        {filterMode === 'subject' && (
                          <p className="text-sm text-slate-500">
                            Subject: {selectedSubject}
                          </p>
                        )}
                      </div>
                      <span className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-black">
                        {filteredStudents.length} Students
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredStudents.map((student, idx) => (
                        <div
                          key={idx}
                          onClick={() => viewStudentProgress(student)}
                          className="p-6 bg-slate-50 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 border-2 border-transparent transition-all cursor-pointer"
                        >
                          <div className="w-10 h-10 bg-slate-200 rounded-full mb-3 flex items-center justify-center font-black text-slate-500 text-sm">
                            {student.name.charAt(0)}
                          </div>
                          <h4 className="font-black text-slate-800 text-sm mb-1">{student.name}</h4>
                          <p className="text-xs text-slate-500 font-bold">{student.reg_no}</p>
                          {filterMode === 'subject' && (
                            <p className="text-xs text-purple-600 font-bold mt-2">
                              {student.department} {student.section}
                            </p>
                          )}
                          {filterMode === 'department' && (
                            <p className="text-xs text-emerald-600 font-bold mt-2">
                              {allAllocations.find(a => 
                                a.department === selectedDepartment && 
                                a.section === selectedDeptSection
                              )?.subject}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Student Progress Modal */}
            {showProgressModal && studentProgress && selectedStudent && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-8" onClick={() => setShowProgressModal(false)}>
                <div className="bg-white rounded-[3rem] p-10 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <h2 className="text-3xl font-black mb-2">{selectedStudent.name}</h2>
                  <p className="text-slate-400 mb-8">{selectedStudent.reg_no}</p>
                  
                  {/* Module Progress Section */}
                  {studentProgress.moduleProgress && (
                    <div className="mb-8 p-6 bg-purple-50 rounded-2xl border-2 border-purple-200">
                      <h3 className="font-black text-purple-800 mb-4 flex items-center gap-2">
                        Module Progress
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-xl text-center">
                          <p className="text-2xl font-black text-purple-600">
                            {studentProgress.moduleProgress.completed_modules || 0}
                          </p>
                          <p className="text-xs text-slate-600 font-bold uppercase">Completed</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl text-center">
                          <p className="text-2xl font-black text-slate-600">
                            {studentProgress.moduleProgress.total_modules || 0}
                          </p>
                          <p className="text-xs text-slate-600 font-bold uppercase">Total</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl text-center">
                          <p className="text-2xl font-black text-emerald-600">
                            {studentProgress.moduleProgress.completion_percentage || 0}%
                          </p>
                          <p className="text-xs text-slate-600 font-bold uppercase">Progress</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Test Progress Section */}
                  <h3 className="font-black mb-4 flex items-center gap-2">Test Performance</h3>
                  <div className="grid grid-cols-4 gap-4 mb-8">
                    <div className="bg-emerald-50 p-6 rounded-2xl text-center">
                      <p className="text-3xl font-black text-emerald-600">{studentProgress.student?.tests_completed || 0}</p>
                      <p className="text-xs text-slate-600 font-bold uppercase">Completed</p>
                    </div>
                    <div className="bg-red-50 p-6 rounded-2xl text-center">
                      <p className="text-3xl font-black text-red-600">{studentProgress.student?.tests_overdue || 0}</p>
                      <p className="text-xs text-slate-600 font-bold uppercase">Overdue</p>
                    </div>
                    <div className="bg-blue-50 p-6 rounded-2xl text-center">
                      <p className="text-3xl font-black text-blue-600">{studentProgress.student?.average_score || 0}%</p>
                      <p className="text-xs text-slate-600 font-bold uppercase">Avg Score</p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl text-center">
                      <p className="text-3xl font-black text-slate-600">{studentProgress.student?.total_tests_assigned || 0}</p>
                      <p className="text-xs text-slate-600 font-bold uppercase">Total Tests</p>
                    </div>
                  </div>
                  
                  <h3 className="font-black mb-4">Test History</h3>
                  {studentProgress.tests && studentProgress.tests.length > 0 ? (
                    <div className="space-y-3">
                      {studentProgress.tests.map(test => (
                        <div key={test.test_id} className={`p-6 rounded-2xl border-2 ${test.is_completed ? 'bg-emerald-50 border-emerald-200' : test.is_overdue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-bold">{test.test_title}</h4>
                              <p className="text-xs text-slate-500">Deadline: {new Date(test.test_deadline).toLocaleDateString()}</p>
                            </div>
                            {test.is_completed ? (
                              <div className="text-right">
                                <p className="text-2xl font-black text-emerald-600">{test.percentage}%</p>
                                <p className="text-xs text-slate-500">{test.score} correct</p>
                              </div>
                            ) : test.is_overdue ? (
                              <span className="text-xs font-black text-red-600 uppercase">Overdue</span>
                            ) : (
                              <span className="text-xs font-black text-slate-400 uppercase">Pending</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl">
                      <p className="text-slate-400">No tests assigned yet</p>
                    </div>
                  )}
                  
                  <button onClick={() => setShowProgressModal(false)} className="w-full mt-8 bg-slate-900 text-white p-4 rounded-xl font-black uppercase text-xs">Close</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      
      {/* Chat Component */}
      {showChat && <Chat onClose={() => setShowChat(false)} />}
    </div>
  );
}

export default TeacherDashboard;