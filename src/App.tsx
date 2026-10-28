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
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Edit3,
  Lock,
  Copy
} from 'lucide-react';

// ---------- Firebase ----------
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyASul4jQiqOCeQrVrZGX6Y0A5yZoqS6ZsI",
  authDomain: "hayul-homework.firebaseapp.com",
  projectId: "hayul-homework",
  storageBucket: "hayul-homework.firebasestorage.app",
  messagingSenderId: "327804325462",
  appId: "1:327804325462:web:b686a9057817480839f5f7"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ---------- Types ----------
type Role = 'child' | 'parent';
type TaskType = 'weekly' | 'period' | 'onetime';
type TaskStatus = 'pending' | 'submitted' | 'approved' | 'revision';

interface Task {
  id: string;
  title: string;
  type: TaskType;
  days: number[];
  startDate: string;
  endDate: string;
  targetTime: string;
  onTimePoints: number;
  latePoints: number;
  note: string;
  createdDate: string; // 'YYYY-MM-DD' - 이 날짜부터 숙제가 나타남
  order?: number; // 목록 순서 (작을수록 위)
  // 예전 버전에서 쓰던 값 (한 번 기록으로 옮긴 뒤에는 사용하지 않음)
  status?: TaskStatus;
  submittedAt?: string | null;
  isOnTime?: boolean;
  earnedPoints?: number;
  wasRevised?: boolean;
}

// 날짜별 숙제 기록 (같은 숙제도 날짜마다 따로 기록)
interface HwRecord {
  key: string; // `${taskId}_${date}`
  taskId: string;
  date: string;
  status: TaskStatus | 'dismissed'; // dismissed = 그 날짜 것만 삭제
  submittedAt: string | null;
  isOnTime: boolean;
  earnedPoints: number;
  wasRevised: boolean;
  approvedDate: string | null; // 승인한 날짜 (다음 날 화면에서 사라짐)
}

// 화면에 보여주는 숙제 1건 = 숙제 정의 + 그 날짜의 진행 상태
interface Occurrence extends Task {
  key: string;
  date: string;
  status: TaskStatus;
  submittedAt: string | null;
  isOnTime: boolean;
  earnedPoints: number;
  wasRevised: boolean;
}

interface BankInfo {
  bank: string;
  account: string;
  owner: string;
}

interface SyncData {
  tasks: Task[];
  records: HwRecord[];
  pointLogs: PointLog[];
  paidPoints: number;
  pointRate: number;
  childTossId: string;
  childBankInfo: BankInfo;
  parentPin: string;
}

interface PointLog {
  id: string; // 생성 시각(ms) - 월간 통계에 사용
  taskTitle: string;
  points: number;
  date: string;
  time: string;
  type: string;
  kind?: 'homework' | 'sticker';
}

interface TaskForm {
  title: string;
  type: TaskType;
  days: number[];
  startDate: string;
  endDate: string;
  targetTime: string;
  onTimePoints: number;
  latePoints: number;
  note: string;
}

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

// ---------- 날짜 헬퍼 (기기의 현지 시간 기준) ----------
const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const toDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDateStr = (ds: string): Date => {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addDaysStr = (ds: string, n: number): string => {
  const dt = parseDateStr(ds);
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
};

const weekdayOf = (ds: string): number => parseDateStr(ds).getDay();

const formatDateLabel = (ds: string): string => {
  const dt = parseDateStr(ds);
  return `${dt.getMonth() + 1}/${dt.getDate()}(${WEEKDAY_NAMES[dt.getDay()]})`;
};

// 오늘로부터 몇 일 전까지의 밀린 숙제를 보여줄지
const LOOKBACK_DAYS = 60;

// 그 날짜에 해당 숙제가 나타나는지
const isActiveOn = (task: Task, ds: string, fallbackCreated: string): boolean => {
  const created = task.createdDate || fallbackCreated;
  if (ds < created) return false;
  if (task.type === 'weekly') return task.days.includes(weekdayOf(ds));
  if (task.type === 'period') return (task.startDate || '') <= ds && ds <= (task.endDate || '');
  return ds === created; // onetime: 만든 날에만 생성 (이후엔 미완료로 계속 남음)
};

// 예전 형식(상태가 숙제 안에 들어있던) 데이터를 새 형식으로
const stripLegacy = (t: Task, today: string): Task => ({
  id: t.id,
  title: t.title,
  type: t.type,
  days: t.days || [],
  startDate: t.startDate || '',
  endDate: t.endDate || '',
  targetTime: t.targetTime || '18:00',
  onTimePoints: t.onTimePoints ?? 3,
  latePoints: t.latePoints ?? 1,
  note: t.note || '',
  createdDate: today
});

// 기본 숙제 (Firestore에 데이터가 없을 때 초기값)
const createDefaultTasks = (): Task[] => {
  const today = toDateStr(new Date());
  return [
    {
      id: '1',
      title: '수학 문제집 2장 풀기',
      type: 'weekly',
      days: [1, 2, 3, 4, 5],
      startDate: '',
      endDate: '',
      targetTime: '17:00',
      onTimePoints: 3,
      latePoints: 1,
      note: '풀이 과정 꼭 적기!',
      createdDate: today
    },
    {
      id: '2',
      title: '영어 단어 10개 암기 및 시험',
      type: 'weekly',
      days: [1, 3, 5],
      startDate: '',
      endDate: '',
      targetTime: '18:30',
      onTimePoints: 5,
      latePoints: 2,
      note: '단어장 테스트 체크',
      createdDate: today
    },
    {
      id: '3',
      title: '방 청소 및 책상 정리하기',
      type: 'onetime',
      days: [new Date().getDay()],
      startDate: '',
      endDate: '',
      targetTime: '20:00',
      onTimePoints: 3,
      latePoints: 1,
      note: '돌발 숙제! 서랍 정리 포함',
      createdDate: today
    }
  ];
};

export default function App() {
  // Current Active Day
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());

  // Role State: 'child' | 'parent'
  // 엄마아빠/하율 모드는 이 기기에만 기억 (새로고침해도 유지)
  const [role, setRole] = useState<Role>(() => {
    try {
      return localStorage.getItem('kids_homework_role') === 'parent' ? 'parent' : 'child';
    } catch (e) {
      return 'child';
    }
  });
  const [parentPin, setParentPin] = useState('0000');
  const [inputPin, setInputPin] = useState('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Settings & Allowance config
  const [pointRate, setPointRate] = useState(100); // 1 point = 100 KRW
  const [childTossId, setChildTossId] = useState('');
  const [childBankInfo, setChildBankInfo] = useState<BankInfo>({ bank: '토스뱅크', account: '1000-1234-5678', owner: '아이 이름' });
  const [paidPoints, setPaidPoints] = useState(0);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Homework Tasks Array
  const [tasks, setTasks] = useState<Task[]>(createDefaultTasks);
  const [records, setRecords] = useState<HwRecord[]>([]);
  const [, setTick] = useState(0); // 날짜 변경 감지용

  // Point History Log
  const [pointLogs, setPointLogs] = useState<PointLog[]>([]);

  // Modal Controls
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isTossModalOpen, setIsTossModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 재결재 포인트 선택 / 칭찬 스티커 / 월간 통계
  const [approvalTarget, setApprovalTarget] = useState<Occurrence | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; type: TaskType; date: string | null } | null>(null);
  const [customPoints, setCustomPoints] = useState('');
  const [isStickerOpen, setIsStickerOpen] = useState(false);
  const [stickerForm, setStickerForm] = useState({ points: '1', reason: '' });
  const [statsMonth, setStatsMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // New Homework Form State
  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: '',
    type: 'weekly',
    days: [1, 2, 3, 4, 5],
    startDate: toDateStr(new Date()),
    endDate: toDateStr(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    targetTime: '18:00',
    onTimePoints: 3,
    latePoints: 1,
    note: ''
  });

  useEffect(() => {
    try {
      localStorage.setItem('kids_homework_role', role);
    } catch (e) {}
  }, [role]);

  // 날짜가 바뀌면 화면 갱신 (1분마다 확인)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ---------- Firebase Realtime Sync (Firestore) ----------
  useEffect(() => {
    const docRef = doc(db, 'homework_data', 'main');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const today = toDateStr(new Date());
          const rawTasks: Task[] = data.tasks || [];
          const newRecords: HwRecord[] = [...(data.records || [])];
          const migratedIds: string[] = [];

          // 예전 데이터(날짜 없는 숙제)를 새 형식으로 한 번 변환
          const normalizedTasks: Task[] = rawTasks.map((t) => {
            if (t.createdDate) return t;
            migratedIds.push(t.id);
            if (t.status && t.status !== 'pending') {
              newRecords.push({
                key: `${t.id}_${today}`,
                taskId: t.id,
                date: today,
                status: t.status,
                submittedAt: t.submittedAt || null,
                isOnTime: !!t.isOnTime,
                earnedPoints: t.earnedPoints || 0,
                wasRevised: !!t.wasRevised,
                approvedDate: t.status === 'approved' ? today : null
              });
            }
            return stripLegacy(t, today);
          });

          setTasks(normalizedTasks);
          setRecords(newRecords);
          if (data.pointLogs) setPointLogs(data.pointLogs);
          if (data.paidPoints !== undefined) setPaidPoints(data.paidPoints);
          if (data.pointRate !== undefined) setPointRate(data.pointRate);
          if (data.childTossId !== undefined) setChildTossId(data.childTossId);
          if (data.childBankInfo) setChildBankInfo(data.childBankInfo);
          if (data.parentPin) setParentPin(data.parentPin);

          if (migratedIds.length > 0) {
            setDoc(docRef, {
              tasks: normalizedTasks,
              records: newRecords,
              pointLogs: data.pointLogs || [],
              paidPoints: data.paidPoints ?? 0,
              pointRate: data.pointRate ?? 100,
              childTossId: data.childTossId ?? '',
              childBankInfo: data.childBankInfo || { bank: '토스뱅크', account: '1000-1234-5678', owner: '아이 이름' },
              parentPin: data.parentPin || '0000'
            }).catch((error) => console.error('Firebase migrate error: ', error));
          }
        } else {
          // 데이터가 없으면 초기값 저장
          setDoc(docRef, {
            tasks: createDefaultTasks(),
            records: [],
            pointLogs: [],
            paidPoints: 0,
            pointRate: 100,
            childTossId: '',
            childBankInfo: { bank: '토스뱅크', account: '1000-1234-5678', owner: '아이 이름' },
            parentPin: '0000'
          }).catch((error) => console.error('Firebase init error: ', error));
        }
      },
      (error) => {
        console.error('Firebase snapshot error: ', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // 데이터 변경 시 Firebase에 저장 (바뀐 값만 overrides로 넘기면 나머지는 현재 값 사용)
  const syncToFirebase = (overrides: Partial<SyncData> = {}) => {
    const data: SyncData = {
      tasks,
      records,
      pointLogs,
      paidPoints,
      pointRate,
      childTossId,
      childBankInfo,
      parentPin,
      ...overrides
    };
    // 오래된 기록은 정리 (표시 기간보다 조금 더 보관)
    const cutoff = toDateStr(new Date(Date.now() - (LOOKBACK_DAYS + 2) * 24 * 60 * 60 * 1000));
    const docRef = doc(db, 'homework_data', 'main');
    setDoc(docRef, {
      ...data,
      records: data.records.filter(r => r.date >= cutoff)
    }, { merge: true }).catch((error) => {
      console.error('Firebase sync error: ', error);
    });
  };

  // Total Points Calculation
  // 총 포인트는 지급 기록(숙제 승인 + 칭찬 스티커)의 합계
  const totalEarnedPoints = pointLogs.reduce((sum, l) => sum + (l.points || 0), 0);
  const unpaidPoints = Math.max(0, totalEarnedPoints - paidPoints);
  const unpaidAllowance = unpaidPoints * pointRate;

  // Helper: Get Time String (HH:MM)
  const getCurrentTimeStr = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Switch Role Handler with PIN check
  const handleRoleSwitch = (targetRole: Role) => {
    if (targetRole === 'parent' && role === 'child') {
      setIsPinModalOpen(true);
    } else {
      setRole(targetRole);
    }
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPin === parentPin || inputPin === '0000') {
      setRole('parent');
      setIsPinModalOpen(false);
      setInputPin('');
      showToast('엄마아빠 모드로 전환되었습니다.');
    } else {
      window.alert('비밀번호가 일치하지 않습니다. (기본 비밀번호: 0000)');
    }
  };

  // ---------- 날짜별 숙제 기록 ----------
  const todayStr = toDateStr(new Date());

  // 자정이 지나 날짜가 바뀌면 요일 탭도 오늘로 이동
  useEffect(() => {
    setSelectedDay(new Date().getDay());
  }, [todayStr]);

  // 특정 날짜의 숙제 기록을 갱신한 새 배열을 반환
  const upsertRecord = (taskId: string, date: string, patch: Partial<HwRecord>): HwRecord[] => {
    const key = `${taskId}_${date}`;
    const base: HwRecord = records.find(r => r.key === key) || {
      key,
      taskId,
      date,
      status: 'pending',
      submittedAt: null,
      isOnTime: false,
      earnedPoints: 0,
      wasRevised: false,
      approvedDate: null
    };
    return [...records.filter(r => r.key !== key), { ...base, ...patch }];
  };

  // Child: Submit Homework (밀린 숙제를 나중에 제출하면 시간 초과로 처리)
  const handleChildSubmit = (occ: Occurrence) => {
    const currentTime = getCurrentTimeStr();
    const isOnTime = occ.date === todayStr && currentTime <= occ.targetTime;
    const newRecords = upsertRecord(occ.id, occ.date, {
      status: 'submitted',
      submittedAt: currentTime,
      isOnTime
    });
    setRecords(newRecords);
    syncToFirebase({ records: newRecords });
    showToast('숙제를 제출했습니다! 부모님 검수를 기다려주세요.');
  };

  // Parent: Approve Homework with chosen points
  const approveWithPoints = (occ: Occurrence, points: number) => {
    let typeLabel = '직접 지정';
    if (points === 0) typeLabel = '포인트 없음';
    else if (points === (occ.onTimePoints ?? 3)) typeLabel = occ.wasRevised ? '재수정 후 전체 지급' : '정시 완수 (전체)';
    else if (points === (occ.latePoints ?? 1)) typeLabel = occ.wasRevised ? '재수정 후 부분 지급' : '지연 완수 (부분)';

    const newLog: PointLog = {
      id: Date.now().toString(),
      taskTitle: occ.title,
      points,
      date: new Date().toLocaleDateString('ko-KR'),
      time: getCurrentTimeStr(),
      type: typeLabel,
      kind: 'homework'
    };
    const updatedLogs = [newLog, ...pointLogs];
    const newRecords = upsertRecord(occ.id, occ.date, {
      status: 'approved',
      earnedPoints: points,
      approvedDate: todayStr
    });

    setRecords(newRecords);
    setPointLogs(updatedLogs);
    syncToFirebase({ records: newRecords, pointLogs: updatedLogs });
    setApprovalTarget(null);
    setCustomPoints('');
    showToast(points > 0 ? '숙제를 승인하고 포인트를 지급했습니다! 🎉' : '숙제를 승인했습니다. (포인트 없음)');
  };

  // 승인 버튼: 시간 내 + 첫 제출이면 바로 전체 포인트, 아니면 포인트 선택창
  const requestApprove = (occ: Occurrence) => {
    if (occ.isOnTime && !occ.wasRevised) {
      approveWithPoints(occ, occ.onTimePoints ?? 3);
    } else {
      setCustomPoints('');
      setApprovalTarget(occ);
    }
  };

  // Parent: Put on Hold (재수정 요청)
  const handleParentHold = (occ: Occurrence) => {
    const newRecords = upsertRecord(occ.id, occ.date, {
      status: 'revision',
      wasRevised: true
    });
    setRecords(newRecords);
    syncToFirebase({ records: newRecords });
    showToast('숙제를 보류 처리했습니다. 아이가 다시 수정 후 제출합니다.');
  };

  // Parent: 칭찬 스티커 (숙제와 상관없이 포인트 지급)
  const handleGiveSticker = (e: React.FormEvent) => {
    e.preventDefault();
    const points = Math.floor(Number(stickerForm.points));
    if (!(points > 0)) return;

    const newLog: PointLog = {
      id: Date.now().toString(),
      taskTitle: stickerForm.reason.trim() || '칭찬 스티커',
      points,
      date: new Date().toLocaleDateString('ko-KR'),
      time: getCurrentTimeStr(),
      type: '칭찬 스티커',
      kind: 'sticker'
    };
    const updatedLogs = [newLog, ...pointLogs];
    setPointLogs(updatedLogs);
    syncToFirebase({ pointLogs: updatedLogs });
    setIsStickerOpen(false);
    setStickerForm({ points: '1', reason: '' });
    showToast('칭찬 포인트를 선물했어요! ⭐');
  };

  // Parent: Create or Update Task
  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return;

    let updatedTasks: Task[];
    if (editingTask) {
      updatedTasks = tasks.map(t => t.id === editingTask.id ? {
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
      } : t);
      showToast('숙제 정보가 수정되었습니다.');
    } else {
      const newTask: Task = {
        id: Date.now().toString(),
        title: taskForm.title,
        type: taskForm.type,
        days: taskForm.type === 'weekly' ? taskForm.days : [selectedDay],
        startDate: taskForm.type === 'period' ? taskForm.startDate : '',
        endDate: taskForm.type === 'period' ? taskForm.endDate : '',
        targetTime: taskForm.targetTime,
        onTimePoints: Number(taskForm.onTimePoints),
        latePoints: Number(taskForm.latePoints),
        note: taskForm.note,
        createdDate: todayStr,
        order: Date.now() // 새 숙제는 맨 아래부터
      };
      updatedTasks = [...tasks, newTask];
      showToast(taskForm.type === 'weekly' ? '새 숙제가 등록되었습니다! 해당 요일부터 나타나요.' : '새 숙제가 등록되었습니다!');
    }

    setTasks(updatedTasks);
    syncToFirebase({ tasks: updatedTasks });
    resetTaskForm();
    setIsAddTaskOpen(false);
  };

  const resetTaskForm = () => {
    setEditingTask(null);
    setTaskForm({
      title: '',
      type: 'weekly',
      days: [1, 2, 3, 4, 5],
      startDate: toDateStr(new Date()),
      endDate: toDateStr(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      targetTime: '18:00',
      onTimePoints: 3,
      latePoints: 1,
      note: ''
    });
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      type: task.type,
      days: task.days || [1, 2, 3, 4, 5],
      startDate: task.startDate || toDateStr(new Date()),
      endDate: task.endDate || toDateStr(new Date()),
      targetTime: task.targetTime || '18:00',
      onTimePoints: task.onTimePoints ?? 3,
      latePoints: task.latePoints ?? 1,
      note: task.note || ''
    });
    setIsAddTaskOpen(true);
  };

  // Parent: Delete (이 날짜만 / 숙제 전체)
  const confirmDelete = (scope: 'one' | 'all') => {
    if (!deleteTarget) return;
    if (scope === 'one' && deleteTarget.date) {
      const newRecords = upsertRecord(deleteTarget.id, deleteTarget.date, {
        status: 'dismissed',
        approvedDate: null
      });
      setRecords(newRecords);
      syncToFirebase({ records: newRecords });
      showToast('이 날짜의 숙제를 삭제했습니다.');
    } else {
      const updatedTasks = tasks.filter(t => t.id !== deleteTarget.id);
      const newRecords = records.filter(r => r.taskId !== deleteTarget.id);
      setTasks(updatedTasks);
      setRecords(newRecords);
      syncToFirebase({ tasks: updatedTasks, records: newRecords });
      showToast('숙제가 삭제되었습니다.');
    }
    setDeleteTarget(null);
  };

  // Settle: 지금까지 획득한 포인트를 모두 정산 처리
  const markAllPaid = () => {
    setPaidPoints(totalEarnedPoints);
    syncToFirebase({ paidPoints: totalEarnedPoints });
  };

  // Save Settings
  const handleSaveSettings = () => {
    syncToFirebase();
    setIsSettingsOpen(false);
    showToast('설정이 저장되었습니다.');
  };

  // ---------- 화면에 보여줄 숙제 목록 (날짜 규칙) ----------
  // - 오늘 해당하는 숙제는 항상 표시
  // - 지난 날짜의 숙제는 승인 전(미제출/제출/보류)이면 계속 표시
  // - 승인된 숙제는 승인한 날에만 표시되고 다음 날부터 사라짐
  const occurrences: Occurrence[] = [];
  const recordMap = new Map<string, HwRecord>();
  records.forEach(r => recordMap.set(r.key, r));
  const lookbackStart = addDaysStr(todayStr, -LOOKBACK_DAYS);

  tasks.forEach(task => {
    const created = task.createdDate || todayStr;
    const from = created > lookbackStart ? created : lookbackStart;
    for (let ds = from; ds <= todayStr; ds = addDaysStr(ds, 1)) {
      if (!isActiveOn(task, ds, todayStr)) continue;
      const key = `${task.id}_${ds}`;
      const rec = recordMap.get(key);
      const status: TaskStatus | 'dismissed' = rec ? rec.status : 'pending';
      if (status === 'dismissed') continue;
      if (status === 'approved' && !(rec && rec.approvedDate === todayStr)) continue;
      occurrences.push({
        ...task,
        key,
        date: ds,
        status,
        submittedAt: rec ? rec.submittedAt : null,
        isOnTime: rec ? rec.isOnTime : false,
        earnedPoints: rec ? rec.earnedPoints : 0,
        wasRevised: rec ? rec.wasRevised : false
      });
    }
  });
  // 같은 날짜 안에서는 직접 정한 순서(▲▼)대로, 순서가 같으면 목표 시간순
  const orderMap = new Map<string, number>();
  tasks.forEach((t, i) => orderMap.set(t.id, t.order !== undefined ? t.order : i));
  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const diff = (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0);
    return diff !== 0 ? diff : a.targetTime.localeCompare(b.targetTime);
  });
  const filteredTasks: Occurrence[] = occurrences;

  // 같은 이름의 숙제가 여러 건이면 날짜 표시로 구분
  const titleCounts: Record<string, number> = {};
  occurrences.forEach(o => {
    titleCounts[o.title] = (titleCounts[o.title] || 0) + 1;
  });

  // 두 숙제의 순서를 맞바꿈 (현재 순서대로 0, 1, 2... 번호를 다시 매긴 뒤 교환)
  const swapTaskOrder = (idA: string, idB: string) => {
    const sorted = [...tasks].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    const numbered = new Map<string, number>();
    sorted.forEach((t, i) => numbered.set(t.id, i));
    const a = numbered.get(idA) ?? 0;
    const b = numbered.get(idB) ?? 0;
    numbered.set(idA, b);
    numbered.set(idB, a);

    const updatedTasks = tasks.map(t => ({ ...t, order: numbered.get(t.id) ?? 0 }));
    setTasks(updatedTasks);
    syncToFirebase({ tasks: updatedTasks });
  };

  // Parent: 오늘 목록에서 위/아래로 옮기기 (같은 날짜 안에서만)
  const moveTask = (occ: Occurrence, dir: -1 | 1) => {
    const idx = occurrences.findIndex(o => o.key === occ.key);
    const neighbor = occurrences[idx + dir];
    if (idx < 0 || !neighbor || neighbor.date !== occ.date) return;
    swapTaskOrder(occ.id, neighbor.id);
  };

  // 오늘이 아닌 요일 탭: 예정된 반복 숙제 미리보기
  const isTodayTab = selectedDay === new Date().getDay();
  const previewTasks = tasks
    .filter(t =>
      t.type === 'weekly'
        ? t.days.includes(selectedDay)
        : t.type === 'period'
        ? (t.endDate || '') >= todayStr
        : false
    )
    .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  // Parent: 다른 요일 탭(예정 목록)에서 위/아래로 옮기기
  const movePreviewTask = (task: Task, dir: -1 | 1) => {
    const idx = previewTasks.findIndex(t => t.id === task.id);
    const neighbor = previewTasks[idx + dir];
    if (idx < 0 || !neighbor) return;
    swapTaskOrder(task.id, neighbor.id);
  };

  // Pending Reviews Count
  const pendingReviewCount = occurrences.filter(o => o.status === 'submitted').length;

  // ---------- 월간 통계 ----------
  const nowForStats = new Date();
  const isCurrentStatsMonth =
    statsMonth.year === nowForStats.getFullYear() && statsMonth.month === nowForStats.getMonth();
  const monthLogs = pointLogs.filter(l => {
    const d = new Date(Number(l.id));
    return !isNaN(d.getTime()) && d.getFullYear() === statsMonth.year && d.getMonth() === statsMonth.month;
  });
  const monthTotal = monthLogs.reduce((sum, l) => sum + (l.points || 0), 0);
  const monthStickerPoints = monthLogs
    .filter(l => l.kind === 'sticker')
    .reduce((sum, l) => sum + (l.points || 0), 0);
  const monthHomeworkPoints = monthTotal - monthStickerPoints;
  const monthApprovedCount = monthLogs.filter(l => l.kind !== 'sticker').length;
  const monthDaysCount = new Date(statsMonth.year, statsMonth.month + 1, 0).getDate();
  const dailyPoints: number[] = Array.from({ length: monthDaysCount }, () => 0);
  monthLogs.forEach(l => {
    const day = new Date(Number(l.id)).getDate();
    dailyPoints[day - 1] += l.points || 0;
  });
  const maxDailyPoints = Math.max(1, ...dailyPoints);
  const monthByTitle: { title: string; points: number }[] = [];
  monthLogs.forEach(l => {
    const found = monthByTitle.find(x => x.title === l.taskTitle);
    if (found) found.points += l.points || 0;
    else monthByTitle.push({ title: l.taskTitle, points: l.points || 0 });
  });
  monthByTitle.sort((a, b) => b.points - a.points);

  const moveStatsMonth = (delta: number) => {
    const d = new Date(statsMonth.year, statsMonth.month + delta, 1);
    setStatsMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

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
              <h1 className="font-extrabold text-base text-slate-900 leading-tight">하율 숙제 & 용돈 정산</h1>
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
              <span>하율</span>
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
              <span>엄마아빠</span>
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
                {role === 'child' ? '시간 내 완성하면 약속된 최고 포인트 지급!' : '엄마아빠 모드 - 검수 및 용돈 정산 관리'}
              </p>
              <p className="text-xs opacity-90 mt-0.5">
                {role === 'child'
                  ? '마감 시간 전에 완료하고 승인을 받으면 full 포인트를 획득해요!'
                  : '아이가 제출한 숙제를 확인하고 포인트를 승인하거나 보류(재수정)하세요.'}
              </p>
            </div>
          </div>
        </div>

        {/* Dashboard Cards (Points) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          {!isTodayTab ? (
            <>
              <div className="bg-slate-100 text-slate-500 text-xs rounded-xl px-4 py-2.5">
                📅 {DAYS.find(d => d.key === selectedDay)?.full} 예정 숙제 미리보기예요. 오늘 할 숙제는 오늘 요일 탭에서 확인하세요.
              </div>
              {previewTasks.length === 0 ? (
                <div className="bg-white p-8 text-center rounded-2xl border border-dashed border-slate-300 text-slate-400">
                  <p className="font-medium text-sm">이 요일에 예정된 반복 숙제가 없습니다.</p>
                </div>
              ) : (
                previewTasks.map((task, previewIndex) => (
                  <div
                    key={task.id}
                    className="bg-white p-4 rounded-2xl border border-dashed border-slate-300 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">예정</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                          task.type === 'weekly' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {task.type === 'weekly' ? '매주 반복' : '특정 기간'}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-700 text-base">{task.title}</h3>
                      <p className="text-xs text-slate-500">
                        목표 완료: <strong className="text-slate-700">{task.targetTime}</strong>까지 · 정시 {task.onTimePoints}P / 지연 {task.latePoints}P
                      </p>
                    </div>
                    {role === 'parent' && (
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => movePreviewTask(task, -1)}
                          disabled={previewIndex === 0}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition disabled:opacity-25 disabled:hover:text-slate-400"
                          title="위로"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => movePreviewTask(task, 1)}
                          disabled={previewIndex === previewTasks.length - 1}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition disabled:opacity-25 disabled:hover:text-slate-400"
                          title="아래로"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditTask(task)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition"
                          title="수정"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: task.id, title: task.title, type: task.type, date: null })}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          ) : filteredTasks.length === 0 ? (
            <div className="bg-white p-8 text-center rounded-2xl border border-dashed border-slate-300 text-slate-400 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto opacity-40" />
              <p className="font-medium text-sm">지금 해야 할 숙제가 없어요. 🎉</p>
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
            filteredTasks.map((task, taskIndex) => {
              const canMoveUp = taskIndex > 0 && filteredTasks[taskIndex - 1].date === task.date;
              const canMoveDown = taskIndex < filteredTasks.length - 1 && filteredTasks[taskIndex + 1].date === task.date;
              return (
                <div
                  key={task.key}
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

                        {/* 날짜 구분 (밀린 숙제이거나 같은 이름이 여러 건일 때) */}
                        {(task.date !== todayStr || (titleCounts[task.title] || 0) > 1) && (
                          <span className="bg-violet-100 text-violet-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                            📅 {task.date === todayStr ? '오늘' : formatDateLabel(task.date)}
                          </span>
                        )}

                        {/* Custom Points Tag */}
                        <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center space-x-1">
                          <Award className="w-3 h-3 text-amber-500" />
                          <span>정시: {task.onTimePoints ?? 3}P / 지연·재수정: {task.latePoints ?? 1}P</span>
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
                            <span>부모님 검수 대기 ({task.isOnTime ? '시간 내 완성' : '시간 초과 제출'}{task.wasRevised ? ' · 재제출' : ''})</span>
                          </span>
                        )}
                        {task.status === 'revision' && (
                          <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md flex items-center space-x-1">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>보류 (재수정 필요)</span>
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
                              onClick={() => handleChildSubmit(task)}
                              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5"
                            >
                              <Check className="w-4 h-4" />
                              <span>완료했어요! 제출하기</span>
                            </button>
                          )}

                          {task.status === 'revision' && (
                            <button
                              onClick={() => handleChildSubmit(task)}
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
                                onClick={() => handleParentHold(task)}
                                className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs px-3 py-2 rounded-xl transition flex items-center space-x-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>보류/재수정</span>
                              </button>
                              <button
                                onClick={() => requestApprove(task)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition flex items-center space-x-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{task.isOnTime && !task.wasRevised ? `승인 (${task.onTimePoints ?? 3}점)` : '승인 · 점수 선택'}</span>
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
                              onClick={() => moveTask(task, -1)}
                              disabled={!canMoveUp}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition disabled:opacity-25 disabled:hover:text-slate-400"
                              title="위로"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => moveTask(task, 1)}
                              disabled={!canMoveDown}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition disabled:opacity-25 disabled:hover:text-slate-400"
                              title="아래로"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditTask(task)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition"
                              title="수정"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ id: task.id, title: task.title, type: task.type, date: task.date })}
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

        {/* 칭찬 스티커 (부모 전용) */}
        {role === 'parent' && (
          <button
            onClick={() => { setStickerForm({ points: '1', reason: '' }); setIsStickerOpen(true); }}
            className="w-full bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-extrabold text-sm py-3 rounded-2xl shadow-sm transition flex items-center justify-center space-x-2"
          >
            <span>⭐</span>
            <span>칭찬 포인트 주기</span>
          </button>
        )}

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

        {/* 월간 포인트 통계 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
              <span>📊</span>
              <span>월간 포인트 통계</span>
            </h3>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => moveStatsMonth(-1)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition"
                title="이전 달"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-extrabold text-slate-800 min-w-[84px] text-center">
                {statsMonth.year}년 {statsMonth.month + 1}월
              </span>
              <button
                onClick={() => moveStatsMonth(1)}
                disabled={isCurrentStatsMonth}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition disabled:opacity-30 disabled:hover:bg-transparent"
                title="다음 달"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400">이달 획득</p>
              <p className="text-lg font-black text-slate-900">{monthTotal}<span className="text-xs font-semibold text-slate-500"> P</span></p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-emerald-600">환산 금액</p>
              <p className="text-lg font-black text-emerald-700">{(monthTotal * pointRate).toLocaleString()}<span className="text-xs font-semibold text-emerald-600"> 원</span></p>
            </div>
            <div className="bg-indigo-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-indigo-600">숙제 포인트</p>
              <p className="text-lg font-black text-indigo-700">{monthHomeworkPoints}<span className="text-xs font-semibold text-indigo-600"> P</span></p>
              <p className="text-[10px] text-indigo-500">{monthApprovedCount}건 승인</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-amber-600">칭찬 포인트</p>
              <p className="text-lg font-black text-amber-700">{monthStickerPoints}<span className="text-xs font-semibold text-amber-600"> P</span></p>
            </div>
          </div>

          {monthLogs.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-4">이 달에는 아직 지급된 포인트가 없어요.</p>
          ) : (
            <>
              <div>
                <p className="text-[11px] font-bold text-slate-500 mb-2">일별 획득 포인트</p>
                <div className="flex items-end gap-px h-24">
                  {dailyPoints.map((v, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`${i + 1}일: ${v}P`}>
                      <div
                        className={v > 0 ? 'bg-indigo-500 rounded-t-sm' : 'bg-slate-200'}
                        style={{ height: v > 0 ? `${Math.max(8, (v / maxDailyPoints) * 100)}%` : '2px' }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>1일</span>
                  <span>{monthDaysCount}일</span>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 mb-1">포인트 많이 받은 항목</p>
                <div className="divide-y divide-slate-100 text-xs">
                  {monthByTitle.slice(0, 5).map(item => (
                    <div key={item.title} className="py-2 flex justify-between items-center">
                      <span className="font-medium text-slate-700 truncate pr-2">{item.title}</span>
                      <span className="font-extrabold text-indigo-600 whitespace-nowrap">{item.points} P</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
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
                    <p className="font-bold text-slate-800">{log.kind === 'sticker' ? '⭐ ' : ''}{log.taskTitle}</p>
                    <p className="text-slate-400 text-[10px]">{log.date} {log.time} · {log.type}</p>
                  </div>
                  <span className="font-extrabold text-indigo-600 text-sm">+{log.points} P</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 환경설정 (엄마아빠 모드 전용) */}
        {role === 'parent' && (
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-sm py-3 rounded-2xl shadow-sm transition flex items-center justify-center space-x-2"
          >
            <Settings className="w-4 h-4" />
            <span>환경설정</span>
          </button>
        )}
      </main>

      {/* MODAL D: 삭제 범위 선택 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">숙제 삭제</h3>
                <p className="text-xs text-slate-500 mt-1">{deleteTarget.title}</p>
              </div>
              <button onClick={() => setDeleteTarget(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-2">
              {deleteTarget.type !== 'onetime' && deleteTarget.date && (
                <button
                  onClick={() => confirmDelete('one')}
                  className="w-full text-left bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-sm px-4 py-3 rounded-xl transition"
                >
                  <span className="block">이 날짜({formatDateLabel(deleteTarget.date)})만 삭제</span>
                  <span className="block text-[11px] font-medium text-amber-700 mt-0.5">반복 숙제는 유지되고, 다음 날짜부터 계속 나와요.</span>
                </button>
              )}
              <button
                onClick={() => confirmDelete('all')}
                className="w-full text-left bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-sm px-4 py-3 rounded-xl transition"
              >
                <span className="block">{deleteTarget.type === 'onetime' ? '삭제' : '반복 숙제 전체 삭제'}</span>
                {deleteTarget.type !== 'onetime' && (
                  <span className="block text-[11px] font-medium text-rose-600 mt-0.5">지난 기록과 앞으로의 숙제가 모두 사라져요.</span>
                )}
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2.5 rounded-xl transition"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL A: 승인 포인트 선택 (지연 제출 / 재제출) */}
      {approvalTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">지급할 포인트 선택</h3>
                <p className="text-xs text-slate-500 mt-1">{approvalTarget.title}{approvalTarget.date !== todayStr ? ` (${formatDateLabel(approvalTarget.date)})` : ''}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {approvalTarget.isOnTime ? '시간 내 제출' : '시간 초과 제출'}
                  {approvalTarget.wasRevised ? ' · 재수정 후 재제출' : ''}
                </p>
              </div>
              <button onClick={() => setApprovalTarget(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => approveWithPoints(approvalTarget, approvalTarget.onTimePoints ?? 3)}
                className="w-full flex justify-between items-center bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-sm px-4 py-3 rounded-xl transition"
              >
                <span>전체 포인트 (깎지 않고)</span>
                <span>{approvalTarget.onTimePoints ?? 3}점</span>
              </button>
              <button
                onClick={() => approveWithPoints(approvalTarget, approvalTarget.latePoints ?? 1)}
                className="w-full flex justify-between items-center bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-sm px-4 py-3 rounded-xl transition"
              >
                <span>부분 포인트 (지연·재수정)</span>
                <span>{approvalTarget.latePoints ?? 1}점</span>
              </button>
              <button
                onClick={() => approveWithPoints(approvalTarget, 0)}
                className="w-full flex justify-between items-center bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm px-4 py-3 rounded-xl transition"
              >
                <span>포인트 없이 승인</span>
                <span>0점</span>
              </button>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="number"
                  min="0"
                  placeholder="직접 입력"
                  value={customPoints}
                  onChange={(e) => setCustomPoints(e.target.value)}
                  className="flex-1 text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-indigo-600"
                />
                <button
                  onClick={() => {
                    const p = Math.floor(Number(customPoints));
                    if (customPoints !== '' && p >= 0) approveWithPoints(approvalTarget, p);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-3 rounded-xl transition whitespace-nowrap"
                >
                  이 점수로 승인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL B: 칭찬 포인트 주기 */}
      {isStickerOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-lg">⭐ 칭찬 포인트 주기</h3>
              <button onClick={() => setIsStickerOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            <form onSubmit={handleGiveSticker} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">칭찬 이유 (선택)</label>
                <input
                  type="text"
                  placeholder="예: 동생이랑 사이좋게 놀았어요"
                  value={stickerForm.reason}
                  onChange={(e) => setStickerForm({ ...stickerForm, reason: e.target.value })}
                  className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">줄 포인트</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    required
                    value={stickerForm.points}
                    onChange={(e) => setStickerForm({ ...stickerForm, points: e.target.value })}
                    className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-amber-700"
                  />
                  <span className="text-xs font-bold text-slate-500">점</span>
                </div>
                <div className="flex space-x-2 mt-2">
                  {[1, 3, 5, 10].map(n => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setStickerForm({ ...stickerForm, points: String(n) })}
                      className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs py-2 rounded-lg transition"
                    >
                      +{n}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm py-3 rounded-xl shadow-md transition"
              >
                포인트 선물하기
              </button>
            </form>
          </div>
        </div>
      )}

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
                  onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value as TaskType })}
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
                        onChange={(e) => setTaskForm({ ...taskForm, onTimePoints: Number(e.target.value) })}
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
                        onChange={(e) => setTaskForm({ ...taskForm, latePoints: Number(e.target.value) })}
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
                      if (window.confirm('토스 송금 완료 후, 이 금액을 정산 완료 처리하시겠습니까?')) {
                        markAllPaid();
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
                    markAllPaid();
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
                <label className="block text-xs font-bold text-slate-700 mb-1">엄마아빠 모드 전환 비밀번호 (PIN)</label>
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
              <h3 className="font-extrabold text-slate-900 text-base">엄마아빠 모드 비밀번호</h3>
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
