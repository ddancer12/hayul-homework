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
  Copy
} from 'lucide-react';

// ---------- Firebase CDN Imports ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---------- Firebase Config ----------
const firebaseConfig = {
  apiKey: "AIzaSyASul4jQiqOCeQrVrZGX6Y0A5yZoqS6ZsI",
  authDomain: "hayul-homework.firebaseapp.com",
  projectId: "hayul-homework",
  storageBucket: "hayul-homework.firebasestorage.app",
  messagingSenderId: "327804325462",
  appId: "1:327804325462:web:b686a9057817480839f5f7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
  status: TaskStatus;
  submittedAt: string | null;
  isOnTime: boolean;
  earnedPoints: number;
  note: string;
}

interface PointLog {
  id: string;
  taskTitle: string;
  points: number;
  date: string;
  time: string;
  type: string;
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

export default function App() {
  // Current Active Day
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());

  // Role State: 'child' | 'parent'
  const [role, setRole] = useState<Role>('child');
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Homework
