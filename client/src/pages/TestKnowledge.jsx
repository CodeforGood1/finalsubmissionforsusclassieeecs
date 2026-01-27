import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config/api';

export default function TestKnowledge() {
  const navigate = useNavigate();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [takingTest, setTakingTest] = useState(null);
  const [currentTest, setCurrentTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [startTime, setStartTime] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);
  
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchTests();
  }, []);
  
  const fetchTests = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/tests`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setTests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load tests:", err);
    } finally {
      setLoading(false);
    }
  };
  
  const startTest = async (testId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/test/${testId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setCurrentTest(data);
      setTakingTest(testId);
      setStartTime(Date.now());
      setAnswers({});
    } catch (err) {
      alert("Failed to load test");
      console.error(err);
    }
  };
  
  const submitTest = async () => {
    if (Object.keys(answers).length < currentTest.total_questions) {
      if (!window.confirm("You haven't answered all questions. Submit anyway?")) {
        return;
      }
    }
    
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/test/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          test_id: takingTest,
          answers: answers,
          time_taken: timeTaken
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setResult(data.submission);
        setShowResult(true);
        setTakingTest(null);
        setCurrentTest(null);
        fetchTests();
      }
    } catch (err) {
      alert("Failed to submit test");
      console.error(err);
    }
  };
  
  const pendingTests = tests.filter(t => t.completion_status === 'pending' && !t.is_overdue);
  const completedTests = tests.filter(t => t.completion_status === 'completed');
  const overdueTests = tests.filter(t => t.is_overdue);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-white text-emerald-500 font-bold">
      Loading tests...
    </div>
  );
  
  // Show result screen
  if (showResult && result) {
    return (
      <div className="min-h-screen bg-[#fdfdfd] flex items-center justify-center p-6 font-sans">
        <div className="max-w-xl w-full text-center space-y-8">
          <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 ${result.percentage >= 60 ? 'bg-emerald-100' : 'bg-amber-100'}">
            <svg className="w-10 h-10 ${result.percentage >= 60 ? 'text-emerald-600' : 'text-amber-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {result.percentage >= 60 ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              )}
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            {result.percentage >= 60 ? 'Great Job!' : 'Keep Learning!'}
          </h1>
          <div className="bg-white border border-slate-100 p-10 rounded-[2.5rem] shadow-sm">
            <p className="text-6xl font-black text-emerald-600 mb-2">{result.percentage}%</p>
            <p className="text-slate-500 mb-6">
              You scored <span className="font-bold text-emerald-600">{result.score}</span> out of {currentTest?.total_questions || result.score}
            </p>
            <p className="text-sm text-slate-400">
              {result.status === 'late' ? 'Submitted after deadline' : 'Submitted on time'}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => { setShowResult(false); setResult(null); }}
              className="px-10 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all"
            >
              Back to Tests
            </button>
            <button 
              onClick={() => navigate('/dashboard')}
              className="text-slate-400 font-bold text-sm hover:text-slate-600"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Taking test screen
  if (takingTest && currentTest) {
    return (
      <div className="min-h-screen bg-[#fdfdfd] p-8 lg:p-12 font-sans text-slate-800">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold">{currentTest.title}</h1>
            <span className="text-sm font-bold text-slate-400">
              {Object.keys(answers).length} / {currentTest.total_questions} answered
            </span>
          </div>
          
          <div className="space-y-8">
            {currentTest.questions.map((q, index) => (
              <div key={index} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                <p className="font-bold text-lg mb-6">
                  <span className="text-emerald-600 mr-2">{index + 1}.</span>
                  {q.question}
                </p>
                <div className="space-y-3">
                  {['a', 'b', 'c', 'd'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setAnswers({...answers, [index]: opt.toUpperCase()})}
                      className={`w-full text-left p-5 rounded-2xl border-2 transition-all font-medium ${
                        answers[index] === opt.toUpperCase()
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <span className="uppercase mr-4 font-bold opacity-50">{opt}</span>
                      {q[opt]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-4 mt-8 sticky bottom-8">
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to cancel? Your progress will be lost.")) {
                  setTakingTest(null);
                  setCurrentTest(null);
                  setAnswers({});
                }
              }}
              className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold"
            >
              Cancel
            </button>
            <button
              onClick={submitTest}
              className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 shadow-xl"
            >
              Submit Test
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main test list screen
  return (
    <div className="min-h-screen bg-[#fdfdfd] p-8 lg:p-12 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto">
        
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-slate-400 hover:text-emerald-600 font-medium transition-colors mb-10 text-sm"
        >
          Back to Dashboard
        </button>

        <header className="mb-12">
          <h1 className="text-3xl font-bold text-slate-900">Test Knowledge</h1>
          <p className="text-slate-500 mt-2">Complete your assigned tests before the deadline.</p>
        </header>

        {/* Pending Tests */}
        {pendingTests.length > 0 && (
          <section className="mb-12">
            <h2 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-6">Pending Tests</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pendingTests.map(test => (
                <div key={test.id} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{test.title}</h3>
                  <p className="text-sm text-slate-500 mb-4">{test.description}</p>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs text-slate-400 font-bold">
                      {test.total_questions} Questions
                    </span>
                    <span className="text-xs text-slate-400 font-bold">
                      Due: {new Date(test.deadline).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => startTest(test.id)}
                    className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all"
                  >
                    Start Test
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Overdue Tests */}
        {overdueTests.length > 0 && (
          <section className="mb-12">
            <h2 className="text-sm font-black text-red-600 uppercase tracking-widest mb-6">Overdue Tests</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {overdueTests.map(test => (
                <div key={test.id} className="bg-red-50 p-8 rounded-[2rem] border-2 border-red-200">
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{test.title}</h3>
                  <p className="text-sm text-slate-500 mb-4">{test.description}</p>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs text-red-600 font-black uppercase">
                      Overdue
                    </span>
                    <span className="text-xs text-slate-400 font-bold">
                      Was due: {new Date(test.deadline).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => startTest(test.id)}
                    className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
                  >
                    Take Test (Late)
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Completed Tests */}
        {completedTests.length > 0 && (
          <section>
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Completed Tests</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {completedTests.map(test => (
                <div key={test.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-2">{test.title}</h3>
                  <div className="text-center my-6">
                    <p className="text-4xl font-black text-emerald-600">{test.percentage}%</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {test.score} / {test.total_questions} correct
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 text-center">
                    Submitted: {new Date(test.submitted_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {tests.length === 0 && (
          <div className="text-center py-24">
            <p className="text-slate-400 font-medium">No tests assigned yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}