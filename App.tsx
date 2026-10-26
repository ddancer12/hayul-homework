import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  Calendar,
  Plus,
  Trash2,
  ShieldCheck,
  UserCheck,
  Coins,
  Send,
  RotateCcw,
  AlertCircle,
  Check,
  Sparkles,
  Settings,
  ChevronRight,
  Edit3,
  Lock,
  Unlock,
  Copy,
  DollarSign,
  Info
} from 'lucide-react';

// Days of week helper
const DAYS = [
  { key: 1, name: '월', full: '월요일' },
  { key: 2, name: '화', full: '화요일' },
  { key: 3, name: '수', full: '수요일' },
  { key: 4, name: '목', full: '목요일' },
  { key: 5, name: '금', full: '금요일' },
  { key: 6, name: '토', full: '토요일' },
  { key: 0, name: '일', full: '일요일' },
];

export default function App() {
  // Current Active Day
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());

  // Role State: 'child' | 'parent'
  const [role, setRole] = useState('child');
  const [parentPin, setParentPin] = useState('0000');
  const [inputPin, setInputPin] = useState('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Settings & Allowance config
  const [pointRate, setPointRate] = useState(100); // 1 point = 100 KRW
  const [childTossId, setChildTossId] = useState('');
  const [childBankInfo, setChildBankInfo] = useState({ bank: '토스뱅크', account: '1000-1234-5678', owner: '아이 이름' });
  const [paidPoints, setPaidPoints] = useState(0);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Homework Tasks Array
  // Statuses: 'pending' | 'submitted' | 'approved' | 'revision'
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('kids_homework_tasks_v2');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return [
      {
        id: '1',
        title: '수학 문제집 2장 풀기',
        type: 'weekly', // 'weekly' | 'period' | 'onetime'
        days: [1, 2, 3, 4, 5], // Mon-Fri
        startDate: '',
        endDate: '',
        targetTime: '17:00',
        onTimePoints: 3,
        latePoints: 1,
        status: 'pending',
        submittedAt: null,
        isOnTime: false,
        earnedPoints: 0,
        note: '풀이 과정 꼭 적기!'
      },
      {
        id: '2',
        title: '영어 단어 10개 암기 및 시험',
        type: 'weekly',
        days: [1, 3, 5],
        startDate: '',
        endDate: '',
        targetTime: '18:30',
        onTimePoints: 5, // Custom higher points
        latePoints: 2,
        status: 'pending',
        submittedAt: null,
        isOnTime: false,
        earnedPoints: 0,
        note: '단어장 테스트 체크'
      },
      {
        id: '3',
        title: '방 청소 및 책상 정리하기',
        type: 'onetime',
        days: [new Date().getDay()],
        targetTime: '20:00',
        onTimePoints: 3,
        latePoints: 1,
        status: 'pending',
        submittedAt: null,
        isOnTime: false,
        earnedPoints: 0,
        note: '돌발 숙제! 서랍 정리 포함'
      }
    ];
  });

  // Point History Log
  const [pointLogs, setPointLogs] = useState(() => {
    const saved = localStorage.getItem('kids_homework_point_logs');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return [];
  });

  // Modal Controls
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isTossModalOpen, setIsTossModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // New Homework Form State
  const [taskForm, setTaskForm] = useState({
    title: '',
    type: 'weekly',
    days: [1, 2, 3, 4, 5],
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    targetTime: '18:00',
    onTimePoints: 3,
    latePoints: 1,
    note: ''
  });

  // LocalStorage Persist
  useEffect(() => {
    localStorage.setItem('kids_homework_tasks_v2', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('kids_homework_point_logs', JSON.stringify(pointLogs));
  }, [pointLogs]);

  useEffect(() => {
    const savedPaid = localStorage.getItem('kids_homework_paid_points');
    if (savedPaid) setPaidPoints(Number(savedPaid));

    const savedRate = localStorage.getItem('kids_homework_point_rate');
    if (savedRate) setPointRate(Number(savedRate));

    const savedTossId = localStorage.getItem('kids_homework_toss_id');
    if (savedTossId) setChildTossId(savedTossId);

    const savedBank = localStorage.getItem('kids_homework_bank_info');
    if (savedBank) {
      try { setChildBankInfo(JSON.parse(savedBank)); } catch (e) {}
    }

    const savedPin = localStorage.getItem('kids_homework_parent_pin');
    if (savedPin) setParentPin(savedPin);
  }, []);

  // Total Points Calculation
  const totalEarnedPoints = tasks.reduce((sum, t) => sum + (t.earnedPoints || 0), 0);
  const unpaidPoints = Math.max(0, totalEarnedPoints - paidPoints);
  const unpaidAllowance = unpaidPoints * pointRate;

  // Helper: Get Time String (HH:MM)
  const getCurrentTimeStr = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Switch Role Handler with PIN check
  const handleRoleSwitch = (targetRole) => {
    if (targetRole === 'parent' && role === 'child') {
      setIsPinModalOpen(true);
    } else {
      setRole(targetRole);
    }
  };

  const handleVerifyPin = (e) => {
    e.preventDefault();
    if (inputPin === parentPin || inputPin === '0000') {
      setRole('parent');
      setIsPinModalOpen(false);
      setInputPin('');
      showToast('부모 모드로 전환되었습니다.');
    } else {
      alert('비밀번호가 일치하지 않습니다. (기본 비밀번호: 0000)');
    }
  };

  // Child: Submit Homework
  const handleChildSubmit = (taskId) => {
    const currentTime = getCurrentTimeStr();
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const isOnTime = currentTime <= t.targetTime;
        return {
          ...t,
          status: 'submitted',
          submittedAt: currentTime,
          isOnTime: isOnTime
        };
      }
      return t;
    }));
    showToast('숙제를 제출했습니다! 부모님 검수를 기다려주세요.');
  };

  // Parent: Approve Homework & Award Points
  const handleParentApprove = (taskId) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        // Points Calculation Rule:
        // Standard full points if on-time AND not previously held for revision
        const isFullPoints = t.isOnTime && t.status !== 'revision';
        const pointsAwarded = isFullPoints ? (t.onTimePoints || 3) : (t.latePoints || 1);

        // Add Log
        const newLog = {
          id: Date.now().toString(),
          taskTitle: t.title,
          points: pointsAwarded,
          date: new Date().toLocaleDateString('ko-KR'),
          time: getCurrentTimeStr(),
          type: isFullPoints ? '정시 완수 (전체)' : '지연/수정 완수 (부분)'
        };
        setPointLogs(logs => [newLog, ...logs]);

        return {
          ...t,
          status: 'approved',
          earnedPoints: (t.earnedPoints || 0) + pointsAwarded
        };
      }
      return t;
    }));
    showToast('숙제를 승인하고 포인트를 지급했습니다! 🎉');
  };

  // Parent: Put on Hold (재수정 요청)
  const handleParentHold = (taskId) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          status: 'revision'
        };
      }
      return t;
    }));
    showToast('숙제를 보류 처리했습니다. 아이가 다시 수정 후 제출합니다.');
  };

  // Parent: Create or Update Task
  const handleSaveTask = (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return;

    if (editingTask) {
      setTasks(tasks.map(t => t.id === editingTask.id ? {
        ...t,
        title: taskForm.title,
        type: taskForm.type,
        days: taskForm.days,
        startDate: taskForm.startDate,
        endDate: taskForm.endDate,
        targetTime: taskForm.targetTime,
        onTimePoints: Number(taskForm.onTimePoints),
        latePoints: Number(taskForm.latePoints),
        note: taskForm.note
      } : t));
      showToast('숙제 정보가 수정되었습니다.');
    } else {
      const newTask = {
        id: Date.now().toString(),
        title: taskForm.title,
        type: taskForm.type,
        days: taskForm.type === 'weekly' ? taskForm.days : [selectedDay],
        startDate: taskForm.type === 'period' ? taskForm.startDate : '',
        endDate: taskForm.type === 'period' ? taskForm.endDate : '',
        targetTime: taskForm.targetTime,
        onTimePoints: Number(taskForm.onTimePoints),
        latePoints: Number(taskForm.latePoints),
        status: 'pending',
        submittedAt: null,
        isOnTime: false,
        earnedPoints: 0,
        note: taskForm.note
      };
      setTasks([...tasks, newTask]);
      showToast('새 숙제가 등록되었습니다!');
    }

    resetTaskForm();
    setIsAddTaskOpen(false);
  };

  const resetTaskForm = () => {
    setEditingTask(null);
    setTaskForm({
      title: '',
      type: 'weekly',
      days: [1, 2, 3, 4, 5],
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      targetTime: '18:00',
      onTimePoints: 3,
      latePoints: 1,
      note: ''
    });
  };

  const openEditTask = (task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      type: task.type,
      days: task.days || [1, 2, 3, 4, 5],
      startDate: task.startDate || new Date().toISOString().split('T')[0],
      endDate: task.endDate || new Date().toISOString().split('T')[0],
      targetTime: task.targetTime || '18:00',
      onTimePoints: task.onTimePoints || 3,
      latePoints: task.latePoints || 1,
      note: task.note || ''
    });
    setIsAddTaskOpen(true);
  };

  // Parent: Delete Task
  const handleDeleteTask = (taskId) => {
    if (confirm('이 숙제를 삭제하시겠습니까?')) {
      setTasks(tasks.filter(t => t.id !== taskId));
      showToast('숙제가 삭제되었습니다.');
    }
  };

  // Save Settings
  const handleSaveSettings = () => {
    localStorage.setItem('kids_homework_paid_points', paidPoints.toString());
    localStorage.setItem('kids_homework_point_rate', pointRate.toString());
    localStorage.setItem('kids_homework_toss_id', childTossId);
    localStorage.setItem('kids_homework_bank_info', JSON.stringify(childBankInfo));
    localStorage.setItem('kids_homework_parent_pin', parentPin);
    setIsSettingsOpen(false);
    showToast('설정이 저장되었습니다.');
  };

  // Filter Tasks for Selected Day
  const filteredTasks = tasks.filter(task => {
    if (task.type === 'weekly') {
      return task.days.includes(selectedDay);
    } else if (task.type === 'period') {
      const todayStr = new Date().toISOString().split('T')[0];
      return task.startDate <= todayStr && todayStr <= task.endDate;
    } else {
      return true; // Single Date / Urgent Task shown across views
    }
  });

  // Pending Reviews Count
  const pendingReviewCount = tasks.filter(t => t.status === 'submitted').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center space-x-2 text-sm font-medium animate-bounce">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Role Switcher */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="bg-indigo-600 text-white p-2 rounded-2xl shadow-md shadow-indigo-200">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-base text-slate-900 leading-tight">쑥쑥 숙제 & 용돈 정산</h1>
              <p className="text-[11px] text-slate-500">시간 내 완성시 차등 포인트 지급</p>
            </div>
          </div>

          {/* Mode Switcher Toggle */}
          <div className="bg-slate-100 p-1 rounded-full flex items-center border border-slate-200">
            <button
              onClick={() => handleRoleSwitch('child')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                role === 'child'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>아이 모드</span>
            </button>
            <button
              onClick={() => handleRoleSwitch('parent')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                role === 'parent'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>부모 모드</span>
              {pendingReviewCount > 0 && (
                <span className="bg-amber-400 text-slate-900 text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {pendingReviewCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {/* Banner Alert based on Role */}
        <div className={`p-4 rounded-2xl flex items-center justify-between shadow-sm border transition-all ${
          role === 'child'
            ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-indigo-200'
            : 'bg-gradient-to-r from-slate-900 to-emerald-900 text-white border-slate-800'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl ${role === 'child' ? 'bg-white/20' : 'bg-emerald-500/20 text-emerald-400'}`}>
              {role === 'child' ? <Clock className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div>
              <p className="font-extrabold text-sm sm:text-base">
                {role === 'child' ? '시간 내 완성하면 약속된 최고 포인트 지급!' : '부모 모드 - 검수 및 용돈 정산 관리'}
              </p>
              <p className="text-xs opacity-90 mt-0.5">
                {role === 'child'
                  ? '마감 시간 전에 완료하고 승인을 받으면 full 포인트를 획득해요!'
                  : '아이가 제출한 숙제를 확인하고 포인트를 승인하거나 보류(재수정)하세요.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition text-white"
            title="설정"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Dashboard Cards (Points & Toss Allowance) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Accumulated Points Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">총 획득 포인트</span>
              <Award className="w-5 h-5 text-amber-500" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-black text-slate-900">
                {totalEarnedPoints} <span className="text-sm font-semibold text-slate-500">P</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">1P 당 {pointRate.toLocaleString()}원 환산</p>
            </div>
          </div>

          {/* Pending Allowance Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">정산 대기 용돈</span>
              <Coins className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-black text-emerald-600">
                {unpaidAllowance.toLocaleString()} <span className="text-sm font-semibold text-slate-500">원</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">미정산 {unpaidPoints} 포인트</p>
            </div>
          </div>

          {/* Toss Quick Transfer Card */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl shadow-md text-white flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-blue-100 uppercase tracking-wider">토스 용돈 정산</span>
              <Send className="w-5 h-5 text-blue-200" />
            </div>
            <div className="mt-2">
              <p className="text-xs text-blue-100">토스 간편 송금으로 즉시 지급하기</p>
              <button
                onClick={() => setIsTossModalOpen(true)}
                className="mt-3 w-full bg-white text-blue-700 font-extrabold py-2 px-4 rounded-xl shadow hover:bg-blue-50 transition flex items-center justify-center space-x-1.5 text-xs"
              >
                <span>토스 송금 바로가기</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Day Selector & Action Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-slate-900 text-sm sm:text-base">요일별 숙제 현황</h2>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end">
              {role === 'parent' && (
                <button
                  onClick={() => { resetTaskForm(); setIsAddTaskOpen(true); }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm transition flex items-center space-x-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>새 숙제 등록</span>
                </button>
              )}
            </div>
          </div>

          {/* Days Nav Bar */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {DAYS.map(day => (
              <button
                key={day.key}
                onClick={() => setSelectedDay(day.key)}
                className={`py-2 px-1 rounded-xl text-center text-xs font-bold transition-all ${
                  selectedDay === day.key
                    ? 'bg-slate-900 text-white shadow-md scale-105'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="block text-[10px] opacity-70">{day.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Homework Items List */}
        <div className="space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="bg-white p-8 text-center rounded-2xl border border-dashed border-slate-300 text-slate-400 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto opacity-40" />
              <p className="font-medium text-sm">선택한 요일에 설정된 숙제가 없습니다.</p>
              {role === 'parent' && (
                <button
                  onClick={() => { resetTaskForm(); setIsAddTaskOpen(true); }}
                  className="text-xs text-indigo-600 font-bold hover:underline"
                >
                  + 지금 새 숙제 등록하기
                </button>
              )}
            </div>
          ) : (
            filteredTasks.map((task) => {
              return (
                <div
                  key={task.id}
                  className={`bg-white p-4 sm:p-5 rounded-2xl border transition-all ${
                    task.status === 'approved'
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : task.status === 'submitted'
                      ? 'border-amber-200 bg-amber-50/30'
                      : task.status === 'revision'
                      ? 'border-rose-200 bg-rose-50/30'
                      : 'border-slate-200 hover:border-indigo-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Homework Details */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        {/* Task Type Badge */}
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                          task.type === 'weekly' ? 'bg-indigo-100 text-indigo-700' :
                          task.type === 'period' ? 'bg-purple-100 text-purple-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {task.type === 'weekly' ? '매주 반복' : task.type === 'period' ? '특정 기간' : '돌발/하루'}
                        </span>

                        {/* Custom Points Tag */}
                        <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center space-x-1">
                          <Award className="w-3 h-3 text-amber-500" />
                          <span>정시: {task.onTimePoints || 3}P / 지연·재수정: {task.latePoints || 1}P</span>
                        </span>

                        {/* Status Badges */}
                        {task.status === 'approved' && (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>완료 (+{task.earnedPoints}P)</span>
                          </span>
                        )}
                        {task.status === 'submitted' && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md flex items-center space-x-1">
                            <Clock className="w-3 h-3 animate-spin text-amber-600" />
                            <span>부모님 검수 대기 ({task.isOnTime ? '시간 내 완성' : '시간 초과 제출'})</span>
                          </span>
                        )}
                        {task.status === 'revision' && (
                          <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md flex items-center space-x-1">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>보류 (재수정 필요 - 최종 완료시 {task.latePoints || 1}P)</span>
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-slate-900 text-base">{task.title}</h3>

                      <div className="flex items-center space-x-4 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>목표 완료: <strong className="text-slate-800">{task.targetTime}</strong>까지</span>
                        </span>

                        {task.submittedAt && (
                          <span className="text-slate-400">
                            (제출 시각: {task.submittedAt})
                          </span>
                        )}
                      </div>

                      {task.note && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1">
                          💬 {task.note}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2 justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {/* CHILD VIEW ACTIONS */}
                      {role === 'child' && (
                        <>
                          {task.status === 'pending' && (
                            <button
                              onClick={() => handleChildSubmit(task.id)}
                              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5"
                            >
                              <Check className="w-4 h-4" />
                              <span>완료했어요! 제출하기</span>
                            </button>
                          )}

                          {task.status === 'revision' && (
                            <button
                              onClick={() => handleChildSubmit(task.id)}
                              className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5"
                            >
                              <RotateCcw className="w-4 h-4" />
                              <span>수정 완료! 다시 제출</span>
                            </button>
                          )}

                          {task.status === 'submitted' && (
                            <span className="text-xs text-amber-700 font-bold bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                              부모님 검수 대기중
                            </span>
                          )}

                          {task.status === 'approved' && (
                            <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 flex items-center space-x-1">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>승인 완료 (+{task.earnedPoints}P)</span>
                            </span>
                          )}
                        </>
                      )}

                      {/* PARENT VIEW ACTIONS */}
                      {role === 'parent' && (
                        <>
                          {task.status === 'submitted' && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleParentHold(task.id)}
                                className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs px-3 py-2 rounded-xl transition flex items-center space-x-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>보류/재수정</span>
                              </button>
                              <button
                                onClick={() => handleParentApprove(task.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition flex items-center space-x-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>승인 ({task.isOnTime ? `${task.onTimePoints || 3}점` : `${task.latePoints || 1}점`})</span>
                              </button>
                            </div>
                          )}

                          {task.status === 'pending' && (
                            <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">
                              아이 제출 대기 중
                            </span>
                          )}

                          {task.status === 'revision' && (
                            <span className="text-xs text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 font-medium">
                              재수정 요청 상태
                            </span>
                          )}

                          {task.status === 'approved' && (
                            <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                              승인완료 ({task.earnedPoints}P 부여)
                            </span>
                          )}

                          {/* Edit / Delete Options */}
                          <div className="flex items-center space-x-1 border-l border-slate-200 ml-2 pl-2">
                            <button
                              onClick={() => openEditTask(task)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition"
                              title="수정"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Point Log History Table */}
        {pointLogs.length > 0 && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
              <Award className="w-4 h-4 text-amber-500" />
              <span>최근 포인트 지급 기록</span>
            </h3>

            <div className="divide-y divide-slate-100 text-xs">
              {pointLogs.slice(0, 5).map(log => (
                <div key={log.id} className="py-2.5 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-800">{log.taskTitle}</p>
                    <p className="text-slate-400 text-[10px]">{log.date} {log.time} · {log.type}</p>
                  </div>
                  <span className="font-extrabold text-indigo-600 text-sm">+{log.points} P</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: Create / Edit Task Modal */}
      {isAddTaskOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-lg">
                {editingTask ? '숙제 수정하기' : '새 숙제 등록'}
              </h3>
              <button onClick={() => setIsAddTaskOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">숙제 제목</label>
                <input
                  type="text"
                  required
                  placeholder="예: 수학 문제집 2장 풀기, 영어 단어 암기"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">반복 일정 선택</label>
                <select
                  value={taskForm.type}
                  onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}
                  className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="weekly">매주 특정 요일 반복</option>
                  <option value="period">특정 기간 지정 (방학/프로젝트)</option>
                  <option value="onetime">하루만 / 돌발 숙제</option>
                </select>
              </div>

              {taskForm.type === 'weekly' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">수행 요일 선택</label>
                  <div className="flex justify-between gap-1">
                    {DAYS.map((day) => {
                      const isSelected = taskForm.days.includes(day.key);
                      return (
                        <button
                          type="button"
                          key={day.key}
                          onClick={() => {
                            if (isSelected) {
                              setTaskForm({ ...taskForm, days: taskForm.days.filter(d => d !== day.key) });
                            } else {
                              setTaskForm({ ...taskForm, days: [...taskForm.days, day.key] });
                            }
                          }}
                          className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {day.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {taskForm.type === 'period' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">시작일</label>
                    <input
                      type="date"
                      value={taskForm.startDate}
                      onChange={(e) => setTaskForm({ ...taskForm, startDate: e.target.value })}
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">종료일</label>
                    <input
                      type="date"
                      value={taskForm.endDate}
                      onChange={(e) => setTaskForm({ ...taskForm, endDate: e.target.value })}
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>
              )}

              {/* Point Allocation Rule Settings */}
              <div className="bg-amber-50/60 p-3 rounded-2xl border border-amber-200/60 space-y-3">
                <div className="flex items-center space-x-1.5 text-xs font-extrabold text-amber-900">
                  <Award className="w-4 h-4 text-amber-600" />
                  <span>포인트 보상 자유 설정</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      정시 제출 시 (Full P)
                    </label>
                    <div className="flex items-center space-x-1">
                      <input
                        type="number"
                        min="1"
                        required
                        value={taskForm.onTimePoints}
                        onChange={(e) => setTaskForm({ ...taskForm, onTimePoints: e.target.value })}
                        className="w-full text-sm p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-indigo-600"
                      />
                      <span className="text-xs font-bold text-slate-500">점</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      지연 / 재수정 시 (Partial P)
                    </label>
                    <div className="flex items-center space-x-1">
                      <input
                        type="number"
                        min="0"
                        required
                        value={taskForm.latePoints}
                        onChange={(e) => setTaskForm({ ...taskForm, latePoints: e.target.value })}
                        className="w-full text-sm p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-600"
                      />
                      <span className="text-xs font-bold text-slate-500">점</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">목표 완료 시간</label>
                <input
                  type="time"
                  value={taskForm.targetTime}
                  onChange={(e) => setTaskForm({ ...taskForm, targetTime: e.target.value })}
                  className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">메모 / 전달사항</label>
                <input
                  type="text"
                  placeholder="예: 풀이과정 쓰기, 예쁘게 정리하기"
                  value={taskForm.note}
                  onChange={(e) => setTaskForm({ ...taskForm, note: e.target.value })}
                  className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 rounded-xl shadow-md transition"
              >
                {editingTask ? '숙제 정보 저장하기' : '숙제 등록하기'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Toss Transfer Modal */}
      {isTossModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="bg-blue-600 text-white p-1.5 rounded-lg">
                  <Send className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-lg">토스 용돈 송금안내</h3>
              </div>
              <button onClick={() => setIsTossModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-3">
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center space-y-1">
                <span className="text-xs text-blue-600 font-bold">정산 예정 금액</span>
                <div className="text-3xl font-black text-blue-900">{unpaidAllowance.toLocaleString()}원</div>
                <span className="text-xs text-blue-500">({unpaidPoints} 포인트 × {pointRate}원)</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">아이 계좌 정보:</span>
                  <span className="font-bold text-slate-800">{childBankInfo.bank} {childBankInfo.account} ({childBankInfo.owner})</span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${childBankInfo.bank} ${childBankInfo.account}`);
                    showToast('계좌번호가 복사되었습니다!');
                  }}
                  className="w-full py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold hover:bg-slate-100 flex items-center justify-center space-x-1"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>계좌번호 복사하기</span>
                </button>
              </div>

              {/* Toss App Action Buttons */}
              <div className="space-y-2 pt-2">
                <a
                  href={childTossId ? `https://toss.me/${childTossId}/${unpaidAllowance}` : `supertoss://send?amount=${unpaidAllowance}`}
                  onClick={() => {
                    setTimeout(() => {
                      if (confirm('토스 송금 완료 후, 이 금액을 정산 완료 처리하시겠습니까?')) {
                        setPaidPoints(totalEarnedPoints);
                        localStorage.setItem('kids_homework_paid_points', totalEarnedPoints.toString());
                        setIsTossModalOpen(false);
                        showToast('정산이 완료되었습니다!');
                      }
                    }, 1000);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition flex items-center justify-center space-x-2 text-sm text-center block"
                >
                  <span>토스 앱으로 이동하여 송금하기</span>
                </a>

                <button
                  onClick={() => {
                    setPaidPoints(totalEarnedPoints);
                    localStorage.setItem('kids_homework_paid_points', totalEarnedPoints.toString());
                    setIsTossModalOpen(false);
                    showToast('정산 완료 처리되었습니다!');
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition"
                >
                  송금 완료 없이 정산 처리만 하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-lg">기본 설정</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">1 포인트당 환율 금액 (원)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={pointRate}
                    onChange={(e) => setPointRate(Number(e.target.value))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">원/Point</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">아이 토스 아이디 (선택)</label>
                <input
                  type="text"
                  value={childTossId}
                  onChange={(e) => setChildTossId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                  placeholder="예: tossme아이디 (토스아이디 설정 시 링크 연동)"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">아이 계좌 정보</label>
                <input
                  type="text"
                  value={childBankInfo.bank}
                  onChange={(e) => setChildBankInfo({ ...childBankInfo, bank: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  placeholder="은행명 (예: 토스뱅크, 카카오뱅크)"
                />
                <input
                  type="text"
                  value={childBankInfo.account}
                  onChange={(e) => setChildBankInfo({ ...childBankInfo, account: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  placeholder="계좌번호"
                />
                <input
                  type="text"
                  value={childBankInfo.owner}
                  onChange={(e) => setChildBankInfo({ ...childBankInfo, owner: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  placeholder="예금주 이름"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">부모 모드 전환 비밀번호 (PIN)</label>
                <input
                  type="password"
                  maxLength={4}
                  value={parentPin}
                  onChange={(e) => setParentPin(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-center font-extrabold text-lg tracking-widest"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSaveSettings}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition"
                >
                  설정 저장하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Parent PIN Verification Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="bg-emerald-100 text-emerald-600 p-3 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-extrabold text-slate-900 text-base">부모 모드 비밀번호</h3>
              <p className="text-xs text-slate-400 mt-1">4자리 PIN 번호를 입력하세요 (기본: 0000)</p>
            </div>

            <form onSubmit={handleVerifyPin} className="space-y-3">
              <input
                type="password"
                maxLength={4}
                autoFocus
                value={inputPin}
                onChange={(e) => setInputPin(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-center font-extrabold text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-600 font-bold text-xs py-2.5 rounded-xl hover:bg-slate-200 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 text-white font-bold text-xs py-2.5 rounded-xl hover:bg-emerald-700 shadow-md transition"
                >
                  확인
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}