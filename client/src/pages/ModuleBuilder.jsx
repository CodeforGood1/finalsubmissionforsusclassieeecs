import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config/api';

function ModuleBuilder({ selectedSection, authHeaders, allocatedSections }) {
  // Debug logging
  console.log('[ModuleBuilder] Component mounted/updated', {
    selectedSection,
    hasAuthHeaders: !!authHeaders,
    allocatedSections,
    allocatedSectionsType: typeof allocatedSections,
    isArray: Array.isArray(allocatedSections)
  });
  
  const [existingModules, setExistingModules] = useState([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [moduleQueue, setModuleQueue] = useState([]);
  const [topicTitle, setTopicTitle] = useState("");
  const [contentType, setContentType] = useState("text");
  const [editingModuleId, setEditingModuleId] = useState(null);
  const [targetSection, setTargetSection] = useState(selectedSection || ""); // Section for this module
  const [targetSubject, setTargetSubject] = useState(""); // Subject for this module
  const [uploadingVideo, setUploadingVideo] = useState(false);
  
  // Bulk module steps upload state (supports PDFs and videos)
  const [showBulkPdfModal, setShowBulkPdfModal] = useState(false);
  const [bulkPdfFiles, setBulkPdfFiles] = useState([]); // Array of {file, stepName}
  const [bulkPdfTopic, setBulkPdfTopic] = useState("");
  const [bulkPdfSubject, setBulkPdfSubject] = useState("");
  const [bulkPdfSection, setBulkPdfSection] = useState("");
  const [uploadingBulkPdf, setUploadingBulkPdf] = useState(false);
  
  // Current step being added
  const [currentStepName, setCurrentStepName] = useState("");
  const [currentStepFile, setCurrentStepFile] = useState(null);
  
  // Section editing modal state
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSectionModuleId, setEditingSectionModuleId] = useState(null);
  const [selectedSectionsForEdit, setSelectedSectionsForEdit] = useState([]);
  
  const [textData, setTextData] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [mcqData, setMcqData] = useState({ question: '', a: '', b: '', c: '', d: '', correct: 'A' });
  const [codeStarter, setCodeStarter] = useState("// Write your solution code here");
  
  // Jitsi Live Video State
  const [jitsiData, setJitsiData] = useState({
    roomName: "",
    scheduledTime: "",
    duration: 60 // minutes
  });
  
  // Coding Problem States
  const [codingProblem, setCodingProblem] = useState({
    description: "",
    starterCode: {
      java: "import java.util.*;\n\npublic class Solution {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    // Write your code here\n  }\n}",
      python: "# Write your solution here\n",
      javascript: "// Write your solution here\n",
      cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n  // Write your code here\n  return 0;\n}"
    },
    testCases: [{ id: 1, input: "", expected: "", isHidden: false }],
    allowedLanguages: ["java", "python", "javascript", "cpp"],
    timeLimit: 5000,
    memoryLimit: 256
  });

  // Update targetSection when selectedSection changes
  useEffect(() => {
    if (selectedSection) setTargetSection(selectedSection);
  }, [selectedSection]);

  const fetchModules = useCallback(async () => {
    if (!authHeaders) return;
    try {
      // If teacher has no allocations or no selected section, fetch ALL their modules
      // Otherwise, fetch modules for the selected section
      const hasAllocations = allocatedSections && allocatedSections.length > 0;
      const endpoint = hasAllocations && selectedSection 
        ? `${API_BASE_URL}/api/teacher/modules/${selectedSection}`
        : `${API_BASE_URL}/api/teacher/my-modules`;
      
      console.log('[ModuleBuilder] Fetching modules from:', endpoint);
      const res = await fetch(endpoint, { headers: authHeaders() });
      const data = await res.json();
      setExistingModules(Array.isArray(data) ? data : []);
    } catch (err) { console.error("Error fetching modules:", err); }
  }, [selectedSection, authHeaders, allocatedSections]);

  useEffect(() => { fetchModules(); }, [fetchModules]);

  // Handle video file upload to local server
  const handleVideoUpload = async (file) => {
    if (!file) return null;
    
    setUploadingVideo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      console.log("Uploading file:", file.name, file.type, file.size);
      
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        console.error("Upload failed:", data);
        throw new Error(data.error || "Upload failed");
      }
      
      console.log("Upload successful:", data);
      setUploadingVideo(false);
      return data.url;
    } catch (err) {
      console.error("Video upload error:", err);
      alert("Failed to upload video: " + err.message);
      setUploadingVideo(false);
      return null;
    }
  };

  const addStepToQueue = async () => {
    if (!topicTitle) return alert("Please enter a Topic Header first.");
    
    console.log("Adding step:", contentType, "Topic:", topicTitle);
    
    let stepData;
    
    if (contentType === 'video') {
      if (videoFile) {
        // Upload video to local server
        const uploadedUrl = await handleVideoUpload(videoFile);
        if (!uploadedUrl) return;
        stepData = uploadedUrl;
      } else if (videoUrl) {
        // Use provided URL
        stepData = videoUrl;
      } else {
        return alert("Please upload a video file or provide a URL");
      }
    } else if (contentType === 'jitsi') {
      // Validate Jitsi live video
      if (!jitsiData.roomName) return alert("Please provide a room name for the live session");
      if (!jitsiData.scheduledTime) return alert("Please set a scheduled time for the live session");
      stepData = {
        roomName: jitsiData.roomName.replace(/\s+/g, '-').toLowerCase(),
        scheduledTime: jitsiData.scheduledTime,
        duration: jitsiData.duration,
        meetingUrl: `https://8x8.vc/${jitsiData.roomName.replace(/\s+/g, '-').toLowerCase()}`
      };
    } else if (contentType === 'mcq') {
      // Validate MCQ
      if (!mcqData.question) return alert("Please add a question");
      if (!mcqData.a || !mcqData.b || !mcqData.c || !mcqData.d) return alert("Please fill all answer options");
      stepData = mcqData;
    } else if (contentType === 'coding') {
      // Validate coding problem
      if (!codingProblem.description) return alert("Please add a problem description");
      // Test cases are optional - if provided, expected output is required
      const filledTestCases = codingProblem.testCases.filter(tc => tc.input || tc.expected);
      if (filledTestCases.length > 0 && filledTestCases.some(tc => !tc.expected)) {
        return alert("Test cases with input must have an expected output");
      }
      stepData = codingProblem;
    } else if (contentType === 'code') {
      // Code example - don't require content, use default starter code
      stepData = codeStarter || "// Write your code here";
    } else {
      // Text content - don't require content, use placeholder if empty
      stepData = textData || "Sample text content";
    }

    const newStep = { type: contentType, header: topicTitle, data: stepData, id: Date.now() };
    console.log("Adding step to queue:", newStep);
    setModuleQueue([...moduleQueue, newStep]);
    
    alert("Step added to module! Add more steps or publish the full module.");
    
    // Reset inputs but keep topic title if user wants to add more steps to same topic
    setTopicTitle(""); // Clear topic title too so they enter new one for next step
    setTextData(""); 
    setVideoUrl(""); 
    setVideoFile(null);
    setMcqData({ question: '', a: '', b: '', c: '', d: '', correct: 'A' });
    setJitsiData({ roomName: "", scheduledTime: "", duration: 60 });
    setCodingProblem({
      description: "",
      starterCode: {
        java: "import java.util.*;\n\npublic class Solution {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    // Write your code here\n  }\n}",
        python: "# Write your solution here\n",
        javascript: "// Write your solution here\n",
        cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n  // Write your code here\n  return 0;\n}"
      },
      testCases: [{ id: 1, input: "", expected: "", isHidden: false }],
      allowedLanguages: ["java", "python", "javascript", "cpp"],
      timeLimit: 5000,
      memoryLimit: 256
    });
  };

  const handleUploadFullModule = async () => {
    console.log("Upload attempt - moduleQueue:", moduleQueue);
    console.log("Upload attempt - targetSection:", targetSection);
    console.log("Upload attempt - targetSubject:", targetSubject);
    
    if (moduleQueue.length === 0) {
      console.log("ERROR: Roadmap is empty!");
      return alert("Roadmap is empty! Please add at least one step first.");
    }
    if (!targetSection) return alert("Please select a section for this module!");
    if (!targetSubject) return alert("Please select a subject for this module!");
    
    try {
      const url = editingModuleId 
        ? `${API_BASE_URL}/api/teacher/module/${editingModuleId}`
        : `${API_BASE_URL}/api/teacher/upload-module`;
      
      const method = editingModuleId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ 
            section: targetSection,
            subject: targetSubject,
            topic: moduleQueue[0].header, 
            steps: moduleQueue 
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert(editingModuleId ? "Module Updated!" : "Module Published!");
        setModuleQueue([]); 
        setIsBuilding(false); 
        setEditingModuleId(null);
        setTargetSection(selectedSection || "");
        setTargetSubject("");
        fetchModules();
      } else {
        console.error("Upload error:", data);
        alert("Error: " + (data.error || 'Upload failed'));
      }
    } catch (err) { 
      console.error("Upload error:", err);
      alert("Network error: " + err.message); 
    }
  };

  const handleEditModule = async (moduleId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/teacher/module/${moduleId}`, { 
        headers: authHeaders() 
      });
      const module = await res.json();
      
      setTopicTitle(module.topic_title);
      setModuleQueue(module.steps);
      setEditingModuleId(moduleId);
      // Also load section and subject for editing
      setTargetSection(module.section || '');
      setTargetSubject(module.subject || '');
      setIsBuilding(true);
    } catch (err) {
      alert("Failed to load module for editing");
    }
  };

  const handleDeleteModule = async (moduleId) => {
    if (!confirm("Are you sure you want to delete this module? This cannot be undone.")) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/teacher/module/${moduleId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      
      if (res.ok) {
        alert("Module Deleted!");
        fetchModules();
      } else {
        alert("Failed to delete module");
      }
    } catch (err) {
      alert("Server error");
    }
  };

  // Handle changing module section(s) - supports multi-section
  const handleSectionChange = async () => {
    if (!editingSectionModuleId || selectedSectionsForEdit.length === 0) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/teacher/module/${editingSectionModuleId}/section`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: selectedSectionsForEdit })
      });
      
      if (res.ok) {
        alert(`Section${selectedSectionsForEdit.length > 1 ? 's' : ''} updated!`);
        setShowSectionModal(false);
        setEditingSectionModuleId(null);
        setSelectedSectionsForEdit([]);
        fetchModules();
      } else {
        const data = await res.json();
        alert("Error: " + (data.error || 'Failed to update section'));
      }
    } catch (err) {
      alert("Server error: " + err.message);
    }
  };

  const toggleSectionSelection = (section) => {
    setSelectedSectionsForEdit(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const openSectionModal = (moduleId, currentSections) => {
    setEditingSectionModuleId(moduleId);
    // currentSections could be a string or array
    const sectionsArray = Array.isArray(currentSections) 
      ? currentSections 
      : (currentSections ? [currentSections] : []);
    setSelectedSectionsForEdit(sectionsArray);
    setShowSectionModal(true);
  };

  // Handle bulk PDF upload
  // Handle adding a step to the bulk upload list
  const handleAddStepToBulk = () => {
    if (!currentStepName || !currentStepName.trim()) {
      return alert("Please enter a step name");
    }
    if (!currentStepFile) {
      return alert("Please select a PDF or video file");
    }
    
    // Validate file type
    if (currentStepFile.type !== 'application/pdf' && !currentStepFile.type.startsWith('video/')) {
      return alert("Only PDF and video files are allowed");
    }
    
    // Add to list
    setBulkPdfFiles([...bulkPdfFiles, {
      file: currentStepFile,
      stepName: currentStepName.trim()
    }]);
    
    // Reset current step inputs
    setCurrentStepName("");
    setCurrentStepFile(null);
    
    // Clear file input
    const fileInput = document.getElementById('bulk-step-file-input');
    if (fileInput) fileInput.value = '';
  };
  
  // Handle removing a step from the list
  const handleRemoveStepFromBulk = (index) => {
    setBulkPdfFiles(bulkPdfFiles.filter((_, idx) => idx !== index));
  };

  // Handle bulk PDF upload - now supports mixed media with custom step names
  const handleBulkPdfUpload = async () => {
    if (bulkPdfFiles.length === 0) {
      return alert("Please add at least one step with a file");
    }
    if (!bulkPdfTopic) {
      return alert("Please enter a module title");
    }
    if (!bulkPdfSubject) {
      return alert("Please enter a subject");
    }
    if (!bulkPdfSection) {
      return alert("Please select a section");
    }
    
    setUploadingBulkPdf(true);
    
    try {
      const formData = new FormData();
      
      // Append all files and their step names
      bulkPdfFiles.forEach((item, index) => {
        formData.append('files', item.file);
        formData.append(`stepName_${index}`, item.stepName);
      });
      
      // Append metadata
      formData.append('topic', bulkPdfTopic);
      formData.append('subject', bulkPdfSubject);
      formData.append('section', bulkPdfSection);
      formData.append('stepCount', bulkPdfFiles.length);
      
      const res = await fetch(`${API_BASE_URL}/api/teacher/upload-module-mixed`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      
      const pdfCount = data.pdfCount || 0;
      const videoCount = data.videoCount || 0;
      alert(`Success! Module created with ${pdfCount} PDF${pdfCount !== 1 ? 's' : ''} and ${videoCount} video${videoCount !== 1 ? 's' : ''}.`);
      
      // Reset and close modal
      setBulkPdfFiles([]);
      setBulkPdfTopic("");
      setBulkPdfSubject("");
      setBulkPdfSection("");
      setCurrentStepName("");
      setCurrentStepFile(null);
      setShowBulkPdfModal(false);
      
      // Refresh modules list
      fetchModules();
    } catch (err) {
      console.error("Bulk upload error:", err);
      alert("Failed to upload files: " + err.message);
    } finally {
      setUploadingBulkPdf(false);
    }
  };

  // Safety check to prevent blank screen
  if (!allocatedSections || !authHeaders) {
    console.log('[ModuleBuilder] Showing loading state - missing required props');
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-slate-50 border-2 border-slate-200 rounded-3xl p-12 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-slate-200 rounded w-3/4 mx-auto"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2 mx-auto"></div>
          </div>
          <p className="text-slate-400 mt-4">Loading teacher data...</p>
        </div>
      </div>
    );
  }
  
  console.log('[ModuleBuilder] Rendering main content', {
    allocatedSectionsLength: allocatedSections.length,
    isBuilding
  });

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* Show info if no sections allocated, but still allow module creation */}
      {allocatedSections.length === 0 && !isBuilding && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-8 mb-6">
          <div className="flex items-start gap-4">
            <svg className="w-8 h-8 text-amber-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-lg font-bold text-amber-700 mb-1">No Sections Assigned Yet</h3>
              <p className="text-amber-600 text-sm">You don't have sections allocated, but you can still create modules. Just type your target section manually below.</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Always show module builder - works with or without allocations */}
      {!isBuilding ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Live Modules</h3>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowBulkPdfModal(true)} 
                className="bg-purple-500 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-lg hover:bg-purple-600 transition-colors"
              >
                Bulk Module Steps Upload
              </button>
              <button 
                onClick={() => setIsBuilding(true)} 
                className="bg-emerald-500 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-lg hover:bg-emerald-600 transition-colors"
              >
                Create New Module
              </button>
            </div>
          </div>
          
          {existingModules.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
              <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <h3 className="text-xl font-bold text-slate-500 mb-2">No Modules Yet</h3>
              <p className="text-slate-400 mb-4">Click "Create New Module" to build your first learning module</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {existingModules.map(mod => {
                // Parse sections - could be a JSON string, array, or just the section field
                let sectionsArray = [];
                if (mod.sections) {
                  sectionsArray = typeof mod.sections === 'string' ? JSON.parse(mod.sections) : mod.sections;
                } else if (mod.section) {
                  sectionsArray = [mod.section];
                }
                
                return (
                <div key={mod.id} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <p className="text-[10px] font-black text-emerald-500 uppercase">Module</p>
                  <h4 className="text-lg font-black text-slate-800 uppercase mb-2 truncate">{mod.topic_title}</h4>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {sectionsArray.length > 0 ? (
                      <button 
                        onClick={() => openSectionModal(mod.id, sectionsArray)}
                        className="text-[9px] font-bold text-white bg-blue-500 px-2 py-1 rounded-full hover:bg-blue-600 cursor-pointer"
                        title="Click to change sections"
                      >
                        {sectionsArray.length > 1 
                          ? `${sectionsArray.length} Sections ✎` 
                          : `${sectionsArray[0]} ✎`}
                      </button>
                    ) : (
                      <button 
                        onClick={() => openSectionModal(mod.id, [])}
                        className="text-[9px] font-bold text-white bg-amber-500 px-2 py-1 rounded-full hover:bg-amber-600 cursor-pointer"
                      >
                        + Add Section
                      </button>
                    )}
                    <span className="text-[9px] font-bold text-white bg-slate-400 px-2 py-1 rounded-full">{mod.step_count} STEPS</span>
                  </div>
                  
                  {/* Show all sections as tags if multiple */}
                  {sectionsArray.length > 1 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {sectionsArray.map(sec => (
                        <span key={sec} className="text-[8px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                          {sec}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex gap-2 mt-4">
                    <button 
                      onClick={() => handleEditModule(mod.id)}
                      className="flex-1 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-blue-100"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteModule(mod.id)}
                      className="flex-1 bg-red-50 text-red-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          <div className="lg:col-span-3 bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-50">
            <div className="space-y-8">
              {/* Section & Subject Selector */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-emerald-50 p-6 rounded-2xl border-2 border-emerald-200">
                  <label className="text-xs font-black text-emerald-700 uppercase mb-3 block">
                    Target Section
                  </label>
                  {allocatedSections && allocatedSections.length > 0 ? (
                    <select 
                      className="w-full p-4 bg-white rounded-xl font-bold border-2 border-emerald-300 focus:border-emerald-500 outline-none"
                      value={targetSection}
                      onChange={e => setTargetSection(e.target.value)}
                    >
                      <option value="">-- Choose Section --</option>
                      {allocatedSections.map(sec => (
                        <option key={sec} value={sec}>{sec}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g., CS A, ECE B (manually enter)"
                      maxLength={20}
                      className="w-full p-4 bg-white rounded-xl font-bold border-2 border-emerald-300 focus:border-emerald-500 outline-none"
                      value={targetSection}
                      onChange={e => setTargetSection(e.target.value.toUpperCase().slice(0, 20))}
                    />
                  )}
                  {!targetSection && (
                    <p className="text-xs text-red-600 font-bold mt-2">Required</p>
                  )}
                  {allocatedSections.length === 0 && (
                    <p className="text-xs text-emerald-600 font-bold mt-2">No sections assigned - type section name (e.g., "CS A")</p>
                  )}
                </div>

                <div className="bg-purple-50 p-6 rounded-2xl border-2 border-purple-200">
                  <label className="text-xs font-black text-purple-700 uppercase mb-3 block">
                    Target Subject
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Mathematics, Physics"
                    maxLength={60}
                    className="w-full p-4 bg-white rounded-xl font-bold border-2 border-purple-300 focus:border-purple-500 outline-none"
                    value={targetSubject}
                    onChange={e => setTargetSubject(e.target.value.slice(0, 60))}
                  />
                  {!targetSubject && (
                    <p className="text-xs text-red-600 font-bold mt-2">Required</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <input type="text" placeholder="Step Topic" maxLength={100} className="p-6 bg-slate-50 rounded-2xl font-bold" value={topicTitle} onChange={e => setTopicTitle(e.target.value.slice(0, 100))} />
                <select className="p-6 bg-slate-50 rounded-2xl font-bold" value={contentType} onChange={e => setContentType(e.target.value)}>
                  <option value="text">Text Lesson</option>
                  <option value="video">Video Upload</option>
                  <option value="jitsi">Live Video (Jitsi)</option>
                  <option value="mcq">Quiz (MCQ)</option>
                  <option value="coding">Coding Problem</option>
                  <option value="code">Code Example</option>
                </select>
              </div>

              {contentType === 'text' && <textarea placeholder="Write lesson..." maxLength={20000} className="w-full p-8 bg-slate-50 rounded-2xl h-64 font-medium" value={textData} onChange={e => setTextData(e.target.value.slice(0, 20000))} />}
              
              {contentType === 'video' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-6 rounded-2xl border-2 border-blue-200">
                    <label className="text-xs font-black text-blue-700 uppercase mb-3 block">
                      Upload Video (Local Server)
                    </label>
                    <input 
                      type="file" 
                      accept="video/*"
                      className="w-full p-4 bg-white rounded-xl border-2 border-blue-300"
                      onChange={e => setVideoFile(e.target.files[0])}
                    />
                    {videoFile && (
                      <p className="text-xs text-blue-600 font-bold mt-2">
                        Selected: {videoFile.name}
                      </p>
                    )}
                    {uploadingVideo && (
                      <p className="text-xs text-blue-600 font-bold mt-2 animate-pulse">
                        Uploading video...
                      </p>
                    )}
                  </div>
                  
                  <div className="text-center text-slate-400 font-bold text-xs">OR</div>
                  
                  <input 
                    type="text" 
                    placeholder="Or paste YouTube/Video URL" 
                    maxLength={500}
                    className="w-full p-8 bg-slate-50 rounded-2xl font-mono text-blue-500" 
                    value={videoUrl} 
                    onChange={e => setVideoUrl(e.target.value.slice(0, 500))} 
                  />
                </div>
              )}
              
              {contentType === 'jitsi' && (
                <div className="space-y-4 bg-gradient-to-br from-indigo-50 to-purple-50 p-8 rounded-2xl border-2 border-indigo-200">
                  <div className="bg-white p-6 rounded-2xl border-2 border-indigo-200">
                    <label className="text-xs font-black text-indigo-700 uppercase mb-3 block">
                      Room Name (No spaces)
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g., math-class-10a"
                      maxLength={50}
                      className="w-full p-4 bg-slate-50 rounded-xl border-2 border-indigo-300 font-mono"
                      value={jitsiData.roomName}
                      onChange={e => setJitsiData({...jitsiData, roomName: e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 50).toLowerCase()})}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-2xl border-2 border-indigo-200">
                      <label className="text-xs font-black text-indigo-700 uppercase mb-3 block">
                        Scheduled Date/Time
                      </label>
                      <input 
                        type="datetime-local" 
                        className="w-full p-4 bg-slate-50 rounded-xl border-2 border-indigo-300"
                        value={jitsiData.scheduledTime}
                        onChange={e => setJitsiData({...jitsiData, scheduledTime: e.target.value})}
                      />
                    </div>
                    
                    <div className="bg-white p-6 rounded-2xl border-2 border-indigo-200">
                      <label className="text-xs font-black text-indigo-700 uppercase mb-3 block">
                        Duration (minutes)
                      </label>
                      <input 
                        type="number" 
                        min="15"
                        max="180"
                        className="w-full p-4 bg-slate-50 rounded-xl border-2 border-indigo-300"
                        value={jitsiData.duration}
                        onChange={e => setJitsiData({...jitsiData, duration: Math.min(180, Math.max(15, parseInt(e.target.value) || 60))})}
                      />
                    </div>
                  </div>
                  
                  <div className="bg-indigo-100 p-4 rounded-xl text-sm text-indigo-700">
                    <p className="font-bold">Live Session Info:</p>
                    <p>Students will be able to join the Jitsi meeting at the scheduled time.</p>
                    <p className="mt-2 font-mono text-xs">
                      Meeting URL: https://localhost:8443/{jitsiData.roomName.replace(/\s+/g, '-').toLowerCase() || 'room-name'}
                    </p>
                    <p className="text-xs text-indigo-600 mt-2">✅ Using local Jitsi server (on-premise)</p>
                  </div>
                </div>
              )}
              
              {contentType === 'mcq' && (
                <div className="space-y-4 bg-slate-50 p-8 rounded-2xl">
                  <input type="text" placeholder="Question" maxLength={500} className="w-full p-4 rounded-xl border" value={mcqData.question} onChange={e => setMcqData({...mcqData, question: e.target.value.slice(0, 500)})} />
                  <div className="grid grid-cols-2 gap-4">
                    {['a', 'b', 'c', 'd'].map(opt => (
                      <input key={opt} type="text" placeholder={`Option ${opt.toUpperCase()}`} maxLength={200} className="p-4 rounded-xl border" value={mcqData[opt]} onChange={e => setMcqData({...mcqData, [opt]: e.target.value.slice(0, 200)})} />
                    ))}
                  </div>
                  <select className="w-full p-4 rounded-xl border font-bold" value={mcqData.correct} onChange={e => setMcqData({...mcqData, correct: e.target.value})}>
                    {['A','B','C','D'].map(v => <option key={v} value={v}>Correct: {v}</option>)}
                  </select>
                  
                  {/* CSV Format Example */}
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mt-4">
                    <p className="text-xs font-black text-amber-700 uppercase mb-2">📋 Bulk Upload via CSV</p>
                    <p className="text-sm text-amber-800 mb-2">For uploading multiple MCQs at once, use a CSV file with this format:</p>
                    <div className="bg-white rounded-lg p-3 font-mono text-xs text-slate-700 overflow-x-auto">
                      <p className="font-bold text-slate-500 mb-1">Header Row:</p>
                      <p>question,a,b,c,d,correct</p>
                      <p className="font-bold text-slate-500 mt-2 mb-1">Example Data:</p>
                      <p>"What is 2+2?","3","4","5","6","B"</p>
                      <p>"Capital of France?","London","Paris","Berlin","Rome","B"</p>
                      <p>"Largest planet?","Mars","Jupiter","Saturn","Earth","B"</p>
                    </div>
                    <p className="text-xs text-amber-600 mt-2">💡 Upload CSV in the Test Knowledge section for full quiz creation.</p>
                  </div>
                </div>
              )}
              {contentType === 'code' && <textarea placeholder="Paste reference solution code here..." className="w-full p-8 bg-slate-900 text-emerald-400 rounded-2xl h-64 font-mono" value={codeStarter} onChange={e => setCodeStarter(e.target.value)} />}

              {contentType === 'coding' && (
                <div className="space-y-6 bg-gradient-to-br from-slate-50 to-blue-50 p-8 rounded-3xl border-2 border-blue-200">
                  {/* Problem Description */}
                  <div>
                    <label className="text-xs font-black text-slate-700 uppercase mb-2 block">
                      Problem Description
                    </label>
                    <textarea 
                      placeholder="Describe the coding problem. Example: Write a program that takes two numbers as input and prints their sum."
                      maxLength={2000}
                      className="w-full p-6 bg-white rounded-2xl border-2 border-blue-300 h-32 font-medium resize-none"
                      value={codingProblem.description}
                      onChange={e => setCodingProblem({...codingProblem, description: e.target.value.slice(0, 2000)})}
                    />
                  </div>

                  {/* Starter Code Templates */}
                  <div>
                    <label className="text-xs font-black text-slate-700 uppercase mb-3 block">
                      Starter Code Templates (Students will see this)
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.keys(codingProblem.starterCode).map(lang => (
                        <div key={lang} className="bg-white p-4 rounded-xl border-2 border-slate-200">
                          <p className="text-xs font-bold text-slate-600 uppercase mb-2">{lang}</p>
                          <textarea
                            className="w-full p-3 bg-slate-900 text-emerald-400 rounded-lg font-mono text-xs h-32 resize-none"
                            value={codingProblem.starterCode[lang]}
                            onChange={e => setCodingProblem({
                              ...codingProblem,
                              starterCode: {...codingProblem.starterCode, [lang]: e.target.value}
                            })}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Test Cases */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-xs font-black text-slate-700 uppercase">
                        Test Cases (For Auto-Grading)
                      </label>
                      <button
                        type="button"
                        onClick={() => setCodingProblem({
                          ...codingProblem,
                          testCases: [...codingProblem.testCases, { 
                            id: Date.now(), 
                            input: "", 
                            expected: "", 
                            isHidden: false 
                          }]
                        })}
                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-600"
                      >
                        + Add Test Case
                      </button>
                    </div>
                    
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {codingProblem.testCases.map((tc, idx) => (
                        <div key={tc.id} className="bg-white p-5 rounded-xl border-2 border-slate-200 relative">
                          <button
                            type="button"
                            onClick={() => setCodingProblem({
                              ...codingProblem,
                              testCases: codingProblem.testCases.filter(t => t.id !== tc.id)
                            })}
                            className="absolute top-3 right-3 text-red-400 hover:text-red-600 font-bold"
                          >
                            ✕
                          </button>
                          
                          <div className="flex items-center gap-3 mb-3">
                            <p className="text-xs font-black text-slate-500">TEST CASE #{idx + 1}</p>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={tc.isHidden}
                                onChange={e => setCodingProblem({
                                  ...codingProblem,
                                  testCases: codingProblem.testCases.map(t => 
                                    t.id === tc.id ? {...t, isHidden: e.target.checked} : t
                                  )
                                })}
                                className="w-4 h-4"
                              />
                              <span className="text-xs font-bold text-purple-600">Hidden (Students can't see)</span>
                            </label>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-bold text-slate-600 mb-1 block">Input (STDIN)</label>
                              <textarea
                                placeholder="e.g., 5 10"
                                maxLength={1000}
                                className="w-full p-3 bg-slate-50 rounded-lg border text-sm font-mono resize-none h-20"
                                value={tc.input}
                                onChange={e => setCodingProblem({
                                  ...codingProblem,
                                  testCases: codingProblem.testCases.map(t => 
                                    t.id === tc.id ? {...t, input: e.target.value.slice(0, 1000)} : t
                                  )
                                })}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-600 mb-1 block">Expected Output</label>
                              <textarea
                                placeholder="e.g., 15"
                                maxLength={1000}
                                className="w-full p-3 bg-slate-50 rounded-lg border text-sm font-mono resize-none h-20"
                                value={tc.expected}
                                onChange={e => setCodingProblem({
                                  ...codingProblem,
                                  testCases: codingProblem.testCases.map(t => 
                                    t.id === tc.id ? {...t, expected: e.target.value.slice(0, 1000)} : t
                                  )
                                })}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Constraints */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-xl border-2 border-slate-200">
                      <label className="text-xs font-bold text-slate-600 mb-2 block">Time Limit (ms) — max 10 000</label>
                      <input
                        type="number"
                        min={1000}
                        max={10000}
                        className="w-full p-3 bg-slate-50 rounded-lg border font-bold"
                        value={codingProblem.timeLimit}
                        onChange={e => setCodingProblem({...codingProblem, timeLimit: e.target.value === '' ? '' : parseInt(e.target.value)})}
                        onBlur={() => setCodingProblem(prev => ({...prev, timeLimit: Math.min(10000, Math.max(1000, parseInt(prev.timeLimit) || 5000))}))}
                      />
                    </div>
                    <div className="bg-white p-4 rounded-xl border-2 border-slate-200">
                      <label className="text-xs font-bold text-slate-600 mb-2 block">Memory Limit (MB) — max 128</label>
                      <input
                        type="number"
                        min={16}
                        max={128}
                        className="w-full p-3 bg-slate-50 rounded-lg border font-bold"
                        value={codingProblem.memoryLimit}
                        onChange={e => setCodingProblem({...codingProblem, memoryLimit: e.target.value === '' ? '' : parseInt(e.target.value)})}
                        onBlur={() => setCodingProblem(prev => ({...prev, memoryLimit: Math.min(128, Math.max(16, parseInt(prev.memoryLimit) || 64))}))}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button onClick={addStepToQueue} disabled={uploadingVideo} className="flex-1 bg-emerald-100 text-emerald-700 p-6 rounded-2xl font-black uppercase text-xs hover:bg-emerald-200 disabled:opacity-50">
                  {uploadingVideo ? 'Uploading...' : 'Add Step to Queue'}
                </button>
                <button 
                  onClick={() => {
                    console.log("Publish button clicked - moduleQueue:", moduleQueue);
                    handleUploadFullModule();
                  }} 
                  disabled={uploadingVideo || moduleQueue.length === 0} 
                  className={`flex-1 p-6 rounded-2xl font-black uppercase text-xs shadow-xl disabled:opacity-50 ${
                    moduleQueue.length === 0 
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {editingModuleId ? 'Update Module' : `Publish Module (${moduleQueue.length} steps)`}
                </button>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-900 rounded-[2rem] p-8 text-white h-fit shadow-2xl">
             <h3 className="text-[10px] font-black text-emerald-400 uppercase mb-6 tracking-widest">Roadmap Preview</h3>
             {(targetSection || targetSubject) && (
               <div className="mb-4 space-y-2">
                 {targetSection && (
                   <div className="p-3 bg-emerald-600 rounded-xl">
                     <p className="text-xs font-bold">Section: {targetSection}</p>
                   </div>
                 )}
                 {targetSubject && (
                   <div className="p-3 bg-purple-600 rounded-xl">
                     <p className="text-xs font-bold">Subject: {targetSubject}</p>
                   </div>
                 )}
               </div>
             )}
             <div className="space-y-3">
              {moduleQueue.map((s, i) => (
                  <div key={s.id} className="p-4 bg-white/5 rounded-2xl border border-white/10">
                      <p className="text-[10px] text-emerald-500 font-black uppercase">{s.type}</p>
                      <p className="text-xs font-bold truncate">{i+1}. {s.header}</p>
                  </div>
              ))}
             </div>
             <button onClick={() => {setIsBuilding(false); setModuleQueue([]); setEditingModuleId(null);}} className="w-full mt-6 text-red-500 text-[10px] font-black uppercase p-4">Discard</button>
          </div>
        </div>
      )}
      
      {/* Section Edit Modal - Multi-Section Support */}
      {showSectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-black text-slate-800 mb-4">Allocate Module to Sections</h3>
            <p className="text-sm text-slate-500 mb-4">Select one or more sections for this module:</p>
            
            <div className="max-h-60 overflow-y-auto space-y-2 mb-6">
              {allocatedSections && allocatedSections.map(sec => (
                <label 
                  key={sec} 
                  className={`flex items-center p-4 rounded-xl cursor-pointer border-2 transition-all ${
                    selectedSectionsForEdit.includes(sec) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSectionsForEdit.includes(sec)}
                    onChange={() => toggleSectionSelection(sec)}
                    className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span className="ml-3 font-bold text-slate-700">{sec}</span>
                </label>
              ))}
            </div>
            
            {selectedSectionsForEdit.length > 0 && (
              <div className="bg-blue-50 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-blue-600 uppercase mb-1">Selected Sections ({selectedSectionsForEdit.length})</p>
                <p className="text-sm text-blue-800">{selectedSectionsForEdit.join(', ')}</p>
              </div>
            )}
            
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowSectionModal(false); setEditingSectionModuleId(null); setSelectedSectionsForEdit([]); }}
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleSectionChange}
                disabled={selectedSectionsForEdit.length === 0}
                className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 disabled:bg-slate-300"
              >
                Save ({selectedSectionsForEdit.length})
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Bulk PDF Upload Modal */}
      {showBulkPdfModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800">Bulk Module Steps Upload</h3>
              <button 
                onClick={() => setShowBulkPdfModal(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
              >
                ✕
              </button>
            </div>
            
            <p className="text-sm text-slate-600 mb-6">
              Upload multiple PDF files or videos at once. Each file will become a separate step in the module.
            </p>
            
            <div className="space-y-6">
              {/* Module Title */}
              <div className="bg-emerald-50 p-6 rounded-2xl border-2 border-emerald-200">
                <label className="text-xs font-black text-emerald-700 uppercase mb-3 block">
                  Module Title
                </label>
                <input
                  type="text"
                  placeholder="e.g., Introduction to Biology"
                  maxLength={100}
                  className="w-full p-4 bg-white rounded-xl font-bold border-2 border-emerald-300 focus:border-emerald-500 outline-none"
                  value={bulkPdfTopic}
                  onChange={e => setBulkPdfTopic(e.target.value.slice(0, 100))}
                />
              </div>
              
              {/* Subject */}
              <div className="bg-purple-50 p-6 rounded-2xl border-2 border-purple-200">
                <label className="text-xs font-black text-purple-700 uppercase mb-3 block">
                  Subject
                </label>
                <input
                  type="text"
                  placeholder="e.g., Biology, Mathematics"
                  maxLength={60}
                  className="w-full p-4 bg-white rounded-xl font-bold border-2 border-purple-300 focus:border-purple-500 outline-none"
                  value={bulkPdfSubject}
                  onChange={e => setBulkPdfSubject(e.target.value.slice(0, 60))}
                />
              </div>
              
              {/* Section */}
              <div className="bg-blue-50 p-6 rounded-2xl border-2 border-blue-200">
                <label className="text-xs font-black text-blue-700 uppercase mb-3 block">
                  Target Section
                </label>
                {allocatedSections && allocatedSections.length > 0 ? (
                  <select 
                    className="w-full p-4 bg-white rounded-xl font-bold border-2 border-blue-300 focus:border-blue-500 outline-none"
                    value={bulkPdfSection}
                    onChange={e => setBulkPdfSection(e.target.value)}
                  >
                    <option value="">-- Choose Section --</option>
                    {allocatedSections.map(sec => (
                      <option key={sec} value={sec}>{sec}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g., CS A, ECE B"
                    maxLength={20}
                    className="w-full p-4 bg-white rounded-xl font-bold border-2 border-blue-300 focus:border-blue-500 outline-none"
                    value={bulkPdfSection}
                    onChange={e => setBulkPdfSection(e.target.value.toUpperCase().slice(0, 20))}
                  />
                )}
              </div>
              
              {/* PDF Files */}
              {/* PDF and Video Files */}
              <div className="bg-amber-50 p-6 rounded-2xl border-2 border-amber-200">
                <label className="text-xs font-black text-amber-700 uppercase mb-3 block">
                  Add Steps (PDF or Video)
                </label>
                
                {/* Current Step Input */}
                <div className="bg-white rounded-xl p-4 mb-4 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-2 block">Step Name</label>
                    <input 
                      type="text"
                      placeholder="e.g., Introduction to Cells"
                      maxLength={100}
                      className="w-full p-3 bg-slate-50 rounded-lg border-2 border-amber-300 font-medium"
                      value={currentStepName}
                      onChange={e => setCurrentStepName(e.target.value.slice(0, 100))}
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-2 block">Select File (PDF or Video)</label>
                    <input 
                      id="bulk-step-file-input"
                      type="file" 
                      accept="application/pdf,video/*"
                      className="w-full p-3 bg-slate-50 rounded-lg border-2 border-amber-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-white hover:file:bg-amber-600"
                      onChange={e => setCurrentStepFile(e.target.files[0])}
                    />
                    {currentStepFile && (
                      <p className="text-xs text-amber-700 mt-2 flex items-center gap-2">
                        <span>{currentStepFile.type === 'application/pdf' ? '📄' : '🎬'}</span>
                        <span className="truncate">{currentStepFile.name}</span>
                        <span className="text-slate-400">({(currentStepFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                      </p>
                    )}
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleAddStepToBulk}
                    disabled={!currentStepName || !currentStepFile}
                    className="w-full px-4 py-3 bg-emerald-500 text-white rounded-lg font-bold hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    ➕ Add Step to Module
                  </button>
                </div>
                
                {/* Steps List */}
                {bulkPdfFiles.length > 0 && (
                  <div className="mt-4 bg-white rounded-xl p-4 max-h-64 overflow-y-auto">
                    <p className="text-xs font-black text-amber-700 uppercase mb-3">
                      Steps in Module ({bulkPdfFiles.length})
                    </p>
                    <ul className="space-y-2">
                      {bulkPdfFiles.map((item, idx) => {
                        const isPdf = item.file.type === 'application/pdf';
                        return (
                          <li key={idx} className="bg-slate-50 p-3 rounded-lg flex items-center gap-3">
                            <span className="text-slate-500 font-bold text-sm">{idx + 1}.</span>
                            <span className={isPdf ? "text-red-500 text-lg" : "text-blue-500 text-lg"}>
                              {isPdf ? '📄' : '🎬'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-slate-800 truncate">{item.stepName}</p>
                              <p className="text-xs text-slate-500 truncate">{item.file.name} ({(item.file.size / 1024 / 1024).toFixed(2)} MB)</p>
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                              isPdf ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                            }`}>
                              {isPdf ? 'PDF' : 'VIDEO'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveStepFromBulk(idx)}
                              className="text-red-500 hover:text-red-700 font-bold text-lg"
                              title="Remove step"
                            >
                              ✕
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              
              {/* Info Box */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                  <span className="font-bold">💡 How it works:</span> Add multiple steps one by one. For each step, enter a custom name and upload a PDF or video. All steps will be published together as ONE module.
                </p>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setShowBulkPdfModal(false);
                    setBulkPdfFiles([]);
                    setBulkPdfTopic("");
                    setBulkPdfSubject("");
                    setBulkPdfSection("");
                    setCurrentStepName("");
                    setCurrentStepFile(null);
                  }}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200"
                  disabled={uploadingBulkPdf}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkPdfUpload}
                  disabled={uploadingBulkPdf || bulkPdfFiles.length === 0 || !bulkPdfTopic || !bulkPdfSubject || !bulkPdfSection}
                  className="flex-1 px-6 py-4 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {uploadingBulkPdf ? 'Uploading...' : `Publish Module (${bulkPdfFiles.length} step${bulkPdfFiles.length !== 1 ? 's' : ''})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModuleBuilder;
