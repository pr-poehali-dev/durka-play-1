import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';

type Screen = 'start' | 'timers' | 'mode' | 'game' | 'win' | 'lose'
            | 'inf_mode' | 'inf_game' | 'inf_save' | 'inf_finish';
type Mode = 'easy' | 'hard';

interface TimerOption { label: string; seconds: number; }

interface Achievement {
  id: string;
  code: string;
  mode: Mode;
  timerLabel: string;
  timerSeconds: number;
  attempts: number;
  date: string;
  device: string;
  os: string;
  browser: string;
  isInfinite?: boolean;
  elapsed?: number; // seconds survived in infinite mode
}

// Infinite save-state stored by 10-digit code
interface InfSave {
  code: string;
  mode: Mode;
  elapsed: number; // seconds
  savedAt: number; // timestamp ms
}

const TIMERS: TimerOption[] = [
  { label: '1мин', seconds: 60 },
  { label: '5мин', seconds: 300 },
  { label: '10мин', seconds: 600 },
  { label: '30мин', seconds: 1800 },
  { label: '1ч', seconds: 3600 },
  { label: '6ч', seconds: 21600 },
  { label: '8ч', seconds: 28800 },
  { label: '12ч', seconds: 43200 },
  { label: '24ч', seconds: 86400 },
  { label: '48ч', seconds: 172800 },
  { label: '100ч', seconds: 360000 },
  { label: '500ч', seconds: 1800000 },
  { label: '1год', seconds: 31536000 },
  { label: '5лет', seconds: 157680000 },
  { label: '10лет', seconds: 315360000 },
];

const STORAGE_KEY = 'durka_achievements';
const INF_SAVES_KEY = 'durka_inf_saves';

const formatTime = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}д ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const formatFullTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.floor(seconds)} сек`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} дней`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} мес`;
  return `${Math.floor(seconds / 31536000)} лет`;
};

const genCode7 = (): string => { let c = ''; for (let i = 0; i < 7; i++) c += Math.floor(Math.random() * 10); return c; };
const genCode10 = (): string => { let c = ''; for (let i = 0; i < 10; i++) c += Math.floor(Math.random() * 10); return c; };

const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  let os = 'Неизвестно', browser = 'Неизвестно', device = 'Компьютер';
  if (/android/i.test(ua)) { os = 'Android'; device = 'Телефон'; }
  else if (/iphone/i.test(ua)) { os = 'iOS'; device = 'iPhone'; }
  else if (/ipad/i.test(ua)) { os = 'iPadOS'; device = 'iPad'; }
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/edg/i.test(ua)) browser = 'Edge';
  else if (/yabrowser/i.test(ua)) browser = 'Яндекс';
  return { os, browser, device };
};

const loadAchievements = (): Achievement[] => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
const saveAchievements = (list: Achievement[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
const loadInfSaves = (): InfSave[] => { try { return JSON.parse(localStorage.getItem(INF_SAVES_KEY) || '[]'); } catch { return []; } };
const saveInfSaves = (list: InfSave[]) => localStorage.setItem(INF_SAVES_KEY, JSON.stringify(list));

const grid: React.CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage: 'linear-gradient(#cfe8ff 1px, transparent 1px), linear-gradient(90deg, #cfe8ff 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

export default function Index() {
  // ── regular game ──
  const [screen, setScreen] = useState<Screen>('start');
  const [selected, setSelected] = useState<TimerOption | null>(null);
  const [mode, setMode] = useState<Mode>('easy');
  const [remaining, setRemaining] = useState(0);
  const [winCode, setWinCode] = useState('');
  const [phase, setPhase] = useState<'wait' | 'press'>('wait');
  const [phaseTime, setPhaseTime] = useState(30);
  const [strikes, setStrikes] = useState(0);

  // ── infinite mode ──
  const [infMode, setInfMode] = useState<Mode>('easy');
  const [infElapsed, setInfElapsed] = useState(0);      // seconds counting up
  const [infPhase, setInfPhase] = useState<'wait' | 'press'>('wait');
  const [infPhaseTime, setInfPhaseTime] = useState(30);
  const [infStrikes, setInfStrikes] = useState(0);
  const [infSaveCode, setInfSaveCode] = useState('');    // code shown after save
  const [infFinishCode, setInfFinishCode] = useState('');
  const [infElapsedOnEnd, setInfElapsedOnEnd] = useState(0);
  // enter-code screen
  const [infCodeInput, setInfCodeInput] = useState('');
  const [infCodeError, setInfCodeError] = useState('');
  const [infCodeScreen, setInfCodeScreen] = useState(false); // show code input on inf_mode
  const [infResumeCountdown, setInfResumeCountdown] = useState(0); // 5-4-3-2-1
  const [infResuming, setInfResuming] = useState(false);

  // ── achievements ──
  const [showAchievements, setShowAchievements] = useState(false);
  const [achievements, setAchievements] = useState<Achievement[]>(loadAchievements);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [addCodeInput, setAddCodeInput] = useState('');
  const [addCodeMode, setAddCodeMode] = useState(false);
  const [addCodeError, setAddCodeError] = useState('');
  // pending achievement to save (from win/inf_finish)
  const winMetaRef = useRef<Achievement | null>(null);

  // ── refs regular ──
  const lastTickRef = useRef(0);
  const rafRef = useRef(0);
  const phaseRef = useRef<'wait' | 'press'>('wait');
  const phaseTimeRef = useRef(30);
  const strikesRef = useRef(0);
  const endedRef = useRef(false);
  const attemptsRef = useRef(0);

  // ── refs infinite ──
  const infLastTickRef = useRef(0);
  const infRafRef = useRef(0);
  const infPhaseRef = useRef<'wait' | 'press'>('wait');
  const infPhaseTimeRef = useRef(30);
  const infStrikesRef = useRef(0);
  const infElapsedRef = useRef(0);
  const infEndedRef = useRef(false);

  // ════════════════════════════════════════
  // REGULAR GAME
  // ════════════════════════════════════════

  const startGame = useCallback((chosenMode: Mode, isRetry = false) => {
    if (!selected) return;
    if (!isRetry) attemptsRef.current = 0;
    attemptsRef.current += 1;
    setMode(chosenMode);
    setRemaining(selected.seconds);
    setStrikes(0); setPhase('wait'); setPhaseTime(30);
    strikesRef.current = 0; phaseRef.current = 'wait'; phaseTimeRef.current = 30;
    endedRef.current = false;
    lastTickRef.current = Date.now();
    setScreen('game');
  }, [selected]);

  const winGame = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const code = genCode7();
    const { os, browser, device } = getDeviceInfo();
    winMetaRef.current = {
      id: Date.now().toString(), code, mode,
      timerLabel: selected?.label ?? '', timerSeconds: selected?.seconds ?? 0,
      attempts: attemptsRef.current, date: new Date().toLocaleString('ru-RU'),
      device, os, browser,
    };
    setWinCode(code);
    setScreen('win');
  }, [mode, selected]);

  const loseGame = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setScreen('lose');
  }, []);

  useEffect(() => {
    if (screen !== 'game') return;
    let stopped = false;
    const loop = () => {
      if (stopped || endedRef.current) return;
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      if (delta > 2) { loseGame(); return; }
      setRemaining(prev => { const n = prev - delta; if (n <= 0) { winGame(); return 0; } return n; });
      if (mode === 'hard') {
        let pt = phaseTimeRef.current - delta;
        if (pt <= 0) {
          if (phaseRef.current === 'wait') { phaseRef.current = 'press'; pt = 6; setPhase('press'); }
          else { loseGame(); return; }
        }
        phaseTimeRef.current = pt; setPhaseTime(pt);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    const onHidden = () => { if (document.visibilityState === 'hidden') loseGame(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onHidden);
    window.addEventListener('pagehide', onHidden);
    return () => {
      stopped = true; cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', onHidden);
      window.removeEventListener('pagehide', onHidden);
    };
  }, [screen, mode, winGame, loseGame]);

  const handlePressButton = () => {
    if (mode !== 'hard' || endedRef.current) return;
    if (phaseRef.current === 'press') {
      phaseRef.current = 'wait'; phaseTimeRef.current = 30; setPhase('wait'); setPhaseTime(30);
    } else {
      const ns = strikesRef.current + 1; strikesRef.current = ns; setStrikes(ns);
      if (ns >= 2) loseGame();
    }
  };

  // ════════════════════════════════════════
  // INFINITE GAME
  // ════════════════════════════════════════

  const startInfGame = useCallback((chosenMode: Mode, fromElapsed = 0) => {
    setInfMode(chosenMode);
    setInfElapsed(fromElapsed);
    infElapsedRef.current = fromElapsed;
    setInfStrikes(0); setInfPhase('wait'); setInfPhaseTime(30);
    infStrikesRef.current = 0; infPhaseRef.current = 'wait'; infPhaseTimeRef.current = 30;
    infEndedRef.current = false;
    infLastTickRef.current = Date.now();
    setScreen('inf_game');
  }, []);

  const loseInfGame = useCallback(() => {
    if (infEndedRef.current) return;
    infEndedRef.current = true;
    setScreen('lose');
  }, []);

  useEffect(() => {
    if (screen !== 'inf_game') return;
    let stopped = false;
    const loop = () => {
      if (stopped || infEndedRef.current) return;
      const now = Date.now();
      const delta = (now - infLastTickRef.current) / 1000;
      infLastTickRef.current = now;
      if (delta > 2) { loseInfGame(); return; }
      infElapsedRef.current += delta;
      setInfElapsed(infElapsedRef.current);
      if (infMode === 'hard') {
        let pt = infPhaseTimeRef.current - delta;
        if (pt <= 0) {
          if (infPhaseRef.current === 'wait') { infPhaseRef.current = 'press'; pt = 6; setInfPhase('press'); }
          else { loseInfGame(); return; }
        }
        infPhaseTimeRef.current = pt; setInfPhaseTime(pt);
      }
      infRafRef.current = requestAnimationFrame(loop);
    };
    infRafRef.current = requestAnimationFrame(loop);
    const onHidden = () => { if (document.visibilityState === 'hidden') loseInfGame(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onHidden);
    window.addEventListener('pagehide', onHidden);
    return () => {
      stopped = true; cancelAnimationFrame(infRafRef.current);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', onHidden);
      window.removeEventListener('pagehide', onHidden);
    };
  }, [screen, infMode, loseInfGame]);

  const handleInfPressButton = () => {
    if (infMode !== 'hard' || infEndedRef.current) return;
    if (infPhaseRef.current === 'press') {
      infPhaseRef.current = 'wait'; infPhaseTimeRef.current = 30; setInfPhase('wait'); setInfPhaseTime(30);
    } else {
      const ns = infStrikesRef.current + 1; infStrikesRef.current = ns; setInfStrikes(ns);
      if (ns >= 2) loseInfGame();
    }
  };

  // Save & exit infinite
  const handleInfSave = () => {
    if (infEndedRef.current) return;
    infEndedRef.current = true;
    cancelAnimationFrame(infRafRef.current);
    const code = genCode10();
    const saves = loadInfSaves();
    saves.push({ code, mode: infMode, elapsed: infElapsedRef.current, savedAt: Date.now() });
    saveInfSaves(saves);
    setInfSaveCode(code);
    setScreen('inf_save');
  };

  // Finish infinite (give win code, no continue)
  const handleInfFinish = () => {
    if (infEndedRef.current) return;
    infEndedRef.current = true;
    cancelAnimationFrame(infRafRef.current);
    const code = genCode7();
    const { os, browser, device } = getDeviceInfo();
    const elapsed = infElapsedRef.current;
    setInfElapsedOnEnd(elapsed);
    winMetaRef.current = {
      id: Date.now().toString(), code, mode: infMode,
      timerLabel: '∞', timerSeconds: 0,
      attempts: 1, date: new Date().toLocaleString('ru-RU'),
      device, os, browser, isInfinite: true, elapsed,
    };
    setInfFinishCode(code);
    setScreen('inf_finish');
  };

  // Enter save code to resume
  const handleInfResume = () => {
    const code = infCodeInput.trim();
    if (!/^\d{10}$/.test(code)) { setInfCodeError('Код должен состоять из 10 цифр'); return; }
    const saves = loadInfSaves();
    const idx = saves.findIndex(s => s.code === code);
    if (idx === -1) { setInfCodeError('Код не найден. Проверьте правильность ввода.'); return; }
    const save = saves[idx];
    // delete the save (one-time)
    saves.splice(idx, 1);
    saveInfSaves(saves);
    setInfCodeInput(''); setInfCodeError(''); setInfCodeScreen(false);
    // 5 second countdown then start
    setInfResuming(true);
    setInfResumeCountdown(5);
    const savedElapsed = save.elapsed;
    const savedMode = save.mode;
    let count = 5;
    const iv = setInterval(() => {
      count -= 1;
      setInfResumeCountdown(count);
      if (count <= 0) {
        clearInterval(iv);
        setInfResuming(false);
        startInfGame(savedMode, savedElapsed);
      }
    }, 1000);
  };

  // ════════════════════════════════════════
  // ACHIEVEMENTS
  // ════════════════════════════════════════

  const handleAddCode = () => {
    const code = addCodeInput.trim();
    if (!/^\d{7}$/.test(code)) { setAddCodeError('Код должен состоять из 7 цифр'); return; }
    const found = achievements.find(a => a.code === code);
    if (!found) { setAddCodeError('Код не найден. Проверьте правильность ввода.'); return; }
    setAddCodeError(''); setAddCodeInput(''); setAddCodeMode(false);
    setSelectedAchievement(found);
  };

  const handleSaveAchievement = () => {
    if (!winMetaRef.current) return;
    const updated = [winMetaRef.current, ...achievements];
    setAchievements(updated); saveAchievements(updated);
    winMetaRef.current = null;
  };

  const handleDeleteAchievement = (id: string) => {
    const updated = achievements.filter(a => a.id !== id);
    setAchievements(updated); saveAchievements(updated);
    setSelectedAchievement(null);
  };

  // ════════════════════════════════════════
  // SHARED UI
  // ════════════════════════════════════════

  const closeAchievements = () => {
    setShowAchievements(false); setAddCodeMode(false);
    setAddCodeInput(''); setAddCodeError('');
  };

  function MedalButton() {
    return (
      <button
        onClick={() => setShowAchievements(true)}
        className="absolute top-4 left-4 w-12 h-12 bg-white border-2 border-sky-400 rounded-xl flex items-center justify-center shadow hover:bg-sky-50 active:scale-95 transition z-10"
      >
        <Icon name="Medal" size={22} className="text-amber-500" />
      </button>
    );
  }

  // ════════════════════════════════════════
  // SCREENS
  // ════════════════════════════════════════

  // START
  if (screen === 'start') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center font-oswald relative">
      <MedalButton />
      <h1 className="text-6xl md:text-8xl font-bold tracking-wider text-sky-600 drop-shadow-sm">
        ДУРКА<span className="text-slate-800"> PLAY</span>
      </h1>
      <div className="flex flex-col items-center gap-4 mt-10">
        <button
          onClick={() => setScreen('timers')}
          className="px-16 py-5 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-3xl font-semibold rounded-2xl shadow-lg tracking-widest"
        >
          ПЛЭЙ
        </button>
        <button
          onClick={() => { setInfCodeScreen(false); setInfResuming(false); setScreen('inf_mode'); }}
          className="px-10 py-4 bg-violet-500 hover:bg-violet-600 active:scale-95 transition text-white text-xl font-semibold rounded-2xl shadow-lg tracking-widest flex items-center gap-2"
        >
          <Icon name="Infinity" size={22} /> БЕСКОНЕЧНЫЙ РЕЖИМ
        </button>
      </div>
      <AchievementsModal />
    </div>
  );

  // TIMERS
  if (screen === 'timers') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      <MedalButton />
      <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8 tracking-wide">ВЫБЕРИ ВРЕМЯ</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 max-w-3xl">
        {TIMERS.map(t => (
          <button key={t.label}
            onClick={() => { setSelected(t); setScreen('mode'); }}
            className="aspect-square flex items-center justify-center bg-white border-2 border-sky-400 hover:bg-sky-500 hover:text-white active:scale-95 transition text-sky-700 text-xl md:text-2xl font-semibold rounded-xl shadow"
          >{t.label}</button>
        ))}
      </div>
      <button onClick={() => setScreen('start')} className="mt-8 text-slate-500 hover:text-slate-700 flex items-center gap-1">
        <Icon name="ArrowLeft" size={18} /> назад
      </button>
      <AchievementsModal />
    </div>
  );

  // MODE SELECT (regular)
  if (screen === 'mode') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      <MedalButton />
      <h2 className="text-7xl md:text-9xl font-bold text-slate-800 mb-12">???</h2>
      <div className="flex flex-col sm:flex-row gap-6">
        <button onClick={() => startGame('easy')}
          className="px-12 py-6 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg tracking-wide">
          ЛЁГКИЙ РЕЖИМ
        </button>
        <button onClick={() => startGame('hard')}
          className="px-12 py-6 bg-red-500 hover:bg-red-600 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg tracking-wide">
          СЛОЖНЫЙ РЕЖИМ
        </button>
      </div>
      <button onClick={() => setScreen('timers')} className="mt-10 text-slate-500 hover:text-slate-700 flex items-center gap-1">
        <Icon name="ArrowLeft" size={18} /> назад
      </button>
      <AchievementsModal />
    </div>
  );

  // REGULAR GAME
  if (screen === 'game') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      {mode === 'hard' && strikes > 0 && (
        <div className="absolute top-6 right-6">
          <span className="text-5xl font-bold text-red-500">{strikes}</span>
        </div>
      )}
      <p className="text-xl text-slate-500 mb-4 tracking-widest">{selected?.label}</p>
      <div className="text-6xl md:text-8xl font-bold text-slate-800 tabular-nums tracking-wider">{formatTime(remaining)}</div>
      {mode === 'hard' && (
        <div className="mt-12 flex flex-col items-center">
          <button onClick={handlePressButton}
            className={`w-44 h-44 rounded-full text-white text-2xl font-bold shadow-xl active:scale-90 transition ${phase === 'press' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}>
            {phase === 'press' ? 'ЖМИ!' : 'КНОПКА'}
          </button>
          <div className="mt-6 text-4xl font-bold text-slate-700 tabular-nums">{Math.ceil(phaseTime)}</div>
          <p className="mt-1 text-slate-500">{phase === 'press' ? 'Нажми кнопку!' : 'Не нажимай!'}</p>
        </div>
      )}
    </div>
  );

  // WIN
  if (screen === 'win') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      <MedalButton />
      <Icon name="Trophy" size={80} className="text-amber-400 mb-4" />
      <h2 className="text-5xl md:text-7xl font-bold text-sky-600 mb-6">ВЫ ПОБЕДИЛИ</h2>
      <p className="text-slate-500 mb-2">Ваш секретный код:</p>
      <div className="text-5xl md:text-6xl font-bold text-slate-800 tracking-[0.3em] bg-white px-8 py-4 rounded-2xl border-2 border-sky-400 shadow">{winCode}</div>
      {winMetaRef.current && (
        <button onClick={handleSaveAchievement}
          className="mt-6 px-8 py-3 bg-amber-500 hover:bg-amber-600 active:scale-95 transition text-white text-lg font-semibold rounded-xl shadow flex items-center gap-2">
          <Icon name="Medal" size={20} /> Сохранить достижение
        </button>
      )}
      <button onClick={() => setScreen('timers')}
        className="mt-4 px-12 py-4 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-xl font-semibold rounded-2xl shadow">
        НА ГЛАВНУЮ
      </button>
      <AchievementsModal />
    </div>
  );

  // LOSE
  if (screen === 'lose') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      <MedalButton />
      <Icon name="Skull" size={80} className="text-red-500 mb-4" />
      <h2 className="text-5xl md:text-7xl font-bold text-red-500 mb-12">ВЫ ПРОИГРАЛИ</h2>
      <div className="flex flex-col sm:flex-row gap-6">
        <button onClick={() => startGame(mode, true)}
          className="px-12 py-5 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg">
          ЗАНОВО
        </button>
        <button onClick={() => setScreen('start')}
          className="px-12 py-5 bg-slate-700 hover:bg-slate-800 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg">
          НА ГЛАВНУЮ
        </button>
      </div>
      <AchievementsModal />
    </div>
  );

  // ════════════ INFINITE MODE SCREENS ════════════

  // INF_MODE — choose difficulty or enter code
  if (screen === 'inf_mode') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      <MedalButton />
      <Icon name="Infinity" size={64} className="text-violet-500 mb-4" />
      <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-2">БЕСКОНЕЧНЫЙ</h2>
      <p className="text-slate-500 mb-10">Режим без ограничения времени</p>

      {infResuming ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-slate-500 text-lg">Продолжаем через...</p>
          <div className="text-8xl font-bold text-violet-600">{infResumeCountdown}</div>
        </div>
      ) : infCodeScreen ? (
        <div className="w-full max-w-xs flex flex-col gap-3">
          <p className="text-slate-500 text-sm text-center">Введи код сохранения (10 цифр):</p>
          <input
            type="text" inputMode="numeric" maxLength={10}
            value={infCodeInput}
            onChange={e => { setInfCodeInput(e.target.value.replace(/\D/g, '')); setInfCodeError(''); }}
            className="border-2 border-violet-300 rounded-xl px-4 py-3 text-center text-2xl font-bold tracking-[0.15em] text-slate-800 outline-none focus:border-violet-500"
            placeholder="0000000000"
            autoFocus
          />
          {infCodeError && <p className="text-red-500 text-sm text-center">{infCodeError}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setInfCodeScreen(false); setInfCodeInput(''); setInfCodeError(''); }}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-500 hover:border-slate-300 transition font-semibold">
              Отмена
            </button>
            <button onClick={handleInfResume}
              className="flex-1 py-3 rounded-xl bg-violet-500 hover:bg-violet-600 text-white transition font-semibold">
              Продолжить
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          <button onClick={() => startInfGame('easy')}
            className="w-full py-5 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg tracking-wide">
            ЛЁГКИЙ РЕЖИМ
          </button>
          <button onClick={() => startInfGame('hard')}
            className="w-full py-5 bg-red-500 hover:bg-red-600 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg tracking-wide">
            СЛОЖНЫЙ РЕЖИМ
          </button>
          <button onClick={() => setInfCodeScreen(true)}
            className="w-full py-4 border-2 border-dashed border-violet-400 rounded-2xl text-violet-600 hover:bg-violet-50 transition font-semibold flex items-center justify-center gap-2">
            <Icon name="KeyRound" size={18} /> ВВЕСТИ КОД
          </button>
        </div>
      )}

      <button onClick={() => setScreen('start')} className="mt-10 text-slate-500 hover:text-slate-700 flex items-center gap-1">
        <Icon name="ArrowLeft" size={18} /> назад
      </button>
      <AchievementsModal />
    </div>
  );

  // INF_GAME
  if (screen === 'inf_game') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      {infMode === 'hard' && infStrikes > 0 && (
        <div className="absolute top-6 right-6">
          <span className="text-5xl font-bold text-red-500">{infStrikes}</span>
        </div>
      )}

      {/* Top buttons */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-3">
        <button onClick={handleInfSave}
          className="px-5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 transition text-white text-sm font-bold rounded-xl shadow flex items-center gap-1.5">
          <Icon name="Save" size={16} /> СОХРАНИТЬ И ВЫЙТИ
        </button>
        <button onClick={handleInfFinish}
          className="px-5 py-2 bg-green-600 hover:bg-green-700 active:scale-95 transition text-white text-sm font-bold rounded-xl shadow flex items-center gap-1.5">
          <Icon name="Flag" size={16} /> ЗАВЕРШИТЬ
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4 mt-16">
        <Icon name="Infinity" size={28} className="text-violet-500" />
        <p className="text-xl text-slate-500 tracking-widest">{infMode === 'easy' ? 'Лёгкий' : 'Сложный'}</p>
      </div>
      <div className="text-6xl md:text-8xl font-bold text-slate-800 tabular-nums tracking-wider">
        {formatTime(infElapsed)}
      </div>
      <p className="mt-2 text-slate-400 text-sm">время в игре</p>

      {infMode === 'hard' && (
        <div className="mt-10 flex flex-col items-center">
          <button onClick={handleInfPressButton}
            className={`w-44 h-44 rounded-full text-white text-2xl font-bold shadow-xl active:scale-90 transition ${infPhase === 'press' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}>
            {infPhase === 'press' ? 'ЖМИ!' : 'КНОПКА'}
          </button>
          <div className="mt-6 text-4xl font-bold text-slate-700 tabular-nums">{Math.ceil(infPhaseTime)}</div>
          <p className="mt-1 text-slate-500">{infPhase === 'press' ? 'Нажми кнопку!' : 'Не нажимай!'}</p>
        </div>
      )}
    </div>
  );

  // INF_SAVE — after save & exit
  if (screen === 'inf_save') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      <MedalButton />
      <Icon name="Save" size={70} className="text-amber-400 mb-4" />
      <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-2">СОХРАНЕНО!</h2>
      <p className="text-slate-500 mb-6 text-center">Используй этот код чтобы продолжить игру.<br/>Код одноразовый — сохрани его!</p>
      <div className="text-4xl md:text-5xl font-bold text-slate-800 tracking-[0.2em] bg-white px-8 py-4 rounded-2xl border-2 border-amber-400 shadow">{infSaveCode}</div>
      <button onClick={() => setScreen('start')}
        className="mt-8 px-12 py-4 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-xl font-semibold rounded-2xl shadow">
        НА ГЛАВНУЮ
      </button>
      <AchievementsModal />
    </div>
  );

  // INF_FINISH — after finish
  if (screen === 'inf_finish') return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      <MedalButton />
      <Icon name="Trophy" size={80} className="text-amber-400 mb-4" />
      <h2 className="text-4xl md:text-5xl font-bold text-sky-600 mb-2">ЗАВЕРШЕНО!</h2>
      <p className="text-slate-500 mb-1">Ты продержался:</p>
      <p className="text-2xl font-bold text-slate-700 mb-6">{formatFullTime(infElapsedOnEnd)}</p>
      <p className="text-slate-500 mb-2">Секретный код победителя:</p>
      <div className="text-4xl md:text-5xl font-bold text-slate-800 tracking-[0.2em] bg-white px-8 py-4 rounded-2xl border-2 border-sky-400 shadow">{infFinishCode}</div>
      {winMetaRef.current && (
        <button onClick={handleSaveAchievement}
          className="mt-6 px-8 py-3 bg-amber-500 hover:bg-amber-600 active:scale-95 transition text-white text-lg font-semibold rounded-xl shadow flex items-center gap-2">
          <Icon name="Medal" size={20} /> Сохранить достижение
        </button>
      )}
      <button onClick={() => setScreen('start')}
        className="mt-4 px-12 py-4 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-xl font-semibold rounded-2xl shadow">
        НА ГЛАВНУЮ
      </button>
      <AchievementsModal />
    </div>
  );

  return null;

  // ════════════════════════════════════════
  // ACHIEVEMENTS MODAL
  // ════════════════════════════════════════
  function AchievementsModal() {
    if (!showAchievements) return null;

    if (selectedAchievement) {
      const a = selectedAchievement;
      return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 font-oswald">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-slate-800">Детали победы</h3>
              <button onClick={() => setSelectedAchievement(null)} className="text-slate-400 hover:text-slate-600">
                <Icon name="X" size={24} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {a.isInfinite
                ? <Row icon="Infinity" label="Режим" value="Бесконечный" color="text-violet-600" />
                : <Row icon="Shield" label="Режим" value={a.mode === 'easy' ? 'Лёгкий' : 'Сложный'} color={a.mode === 'easy' ? 'text-sky-600' : 'text-red-500'} />
              }
              {a.isInfinite
                ? <Row icon="Timer" label="Время в игре" value={formatFullTime(a.elapsed ?? 0)} />
                : <Row icon="Timer" label="Время испытания" value={`${a.timerLabel} (${formatFullTime(a.timerSeconds)})`} />
              }
              <Row icon="RefreshCw" label="Попыток" value={String(a.attempts)} />
              <Row icon="Calendar" label="Дата победы" value={a.date} />
              <Row icon="Smartphone" label="Устройство" value={a.device} />
              <Row icon="Monitor" label="Система" value={a.os} />
              <Row icon="Globe" label="Браузер" value={a.browser} />
              <div className="mt-2 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 text-center">
                <p className="text-xs text-slate-400 mb-1">Секретный код</p>
                <p className="text-3xl font-bold text-slate-800 tracking-[0.2em]">{a.code}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setSelectedAchievement(null)}
                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-xl transition">
                Закрыть
              </button>
              <button onClick={() => handleDeleteAchievement(a.id)}
                className="px-4 py-3 bg-red-100 hover:bg-red-200 text-red-600 font-semibold rounded-xl transition flex items-center gap-1">
                <Icon name="Trash2" size={18} /> Удалить
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 font-oswald flex flex-col" style={{ maxHeight: '90vh' }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Icon name="Medal" size={22} className="text-amber-500" /> Достижения
            </h3>
            <button onClick={closeAchievements} className="text-slate-400 hover:text-slate-600">
              <Icon name="X" size={24} />
            </button>
          </div>

          {addCodeMode ? (
            <div className="flex flex-col gap-3 mb-4">
              <p className="text-slate-500 text-sm">Введи секретный код победителя (7 цифр):</p>
              <input type="text" inputMode="numeric" maxLength={7}
                value={addCodeInput}
                onChange={e => { setAddCodeInput(e.target.value.replace(/\D/g, '')); setAddCodeError(''); }}
                className="border-2 border-sky-300 rounded-xl px-4 py-3 text-center text-3xl font-bold tracking-[0.2em] text-slate-800 outline-none focus:border-sky-500"
                placeholder="0000000" autoFocus
              />
              {addCodeError && <p className="text-red-500 text-sm text-center">{addCodeError}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setAddCodeMode(false); setAddCodeInput(''); setAddCodeError(''); }}
                  className="flex-1 py-2 rounded-xl border-2 border-slate-200 text-slate-500 hover:border-slate-300 transition font-semibold">Отмена</button>
                <button onClick={handleAddCode}
                  className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white transition font-semibold">Найти</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddCodeMode(true)}
              className="mb-4 w-full py-3 border-2 border-dashed border-sky-300 rounded-2xl text-sky-500 hover:bg-sky-50 transition font-semibold flex items-center justify-center gap-2">
              <Icon name="Plus" size={20} /> Ввести код победы
            </button>
          )}

          <div className="overflow-y-auto flex-1 flex flex-col gap-3">
            {achievements.length === 0 ? (
              <div className="text-center text-slate-400 py-10">
                <Icon name="Trophy" size={40} className="mx-auto mb-3 opacity-30" />
                <p>Пока нет достижений</p>
                <p className="text-sm mt-1">Победи в игре и сохрани результат</p>
              </div>
            ) : achievements.map(a => (
              <button key={a.id} onClick={() => setSelectedAchievement(a)}
                className="w-full text-left bg-gradient-to-r from-white to-sky-50 border-2 border-sky-200 hover:border-sky-400 rounded-2xl px-4 py-3 transition active:scale-[0.98]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      a.isInfinite ? 'bg-violet-100 text-violet-700'
                      : a.mode === 'easy' ? 'bg-sky-100 text-sky-700' : 'bg-red-100 text-red-600'}`}>
                      {a.isInfinite ? '∞' : a.mode === 'easy' ? 'ЛЁГКИЙ' : 'СЛОЖНЫЙ'}
                    </span>
                    <span className="text-slate-800 font-bold">{a.timerLabel}</span>
                  </div>
                  <Icon name="ChevronRight" size={16} className="text-slate-400" />
                </div>
                <div className="flex gap-4 mt-1.5 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><Icon name="RefreshCw" size={12} /> {a.attempts} попыток</span>
                  <span className="flex items-center gap-1"><Icon name="Calendar" size={12} /> {a.date.split(',')[0]}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function Row({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-100">
        <div className="flex items-center gap-2 text-slate-500">
          <Icon name={icon} size={16} />
          <span className="text-sm">{label}</span>
        </div>
        <span className={`font-semibold text-sm ${color ?? 'text-slate-800'}`}>{value}</span>
      </div>
    );
  }
}
