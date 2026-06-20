import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';

type Screen = 'start' | 'timers' | 'mode' | 'game' | 'win' | 'lose';
type Mode = 'easy' | 'hard';

interface TimerOption {
  label: string;
  seconds: number;
}

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
  if (seconds < 60) return `${seconds} сек`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} дней`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} мес`;
  if (seconds < 315360000) return `${Math.floor(seconds / 31536000)} лет`;
  return `${Math.floor(seconds / 31536000)} лет`;
};

const genCode = (): string => {
  let code = '';
  for (let i = 0; i < 7; i++) code += Math.floor(Math.random() * 10);
  return code;
};

const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  let os = 'Неизвестно';
  let browser = 'Неизвестно';
  let device = 'Компьютер';

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

const loadAchievements = (): Achievement[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
};

const saveAchievements = (list: Achievement[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
};

const grid: React.CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(#cfe8ff 1px, transparent 1px), linear-gradient(90deg, #cfe8ff 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

export default function Index() {
  const [screen, setScreen] = useState<Screen>('start');
  const [selected, setSelected] = useState<TimerOption | null>(null);
  const [mode, setMode] = useState<Mode>('easy');
  const [remaining, setRemaining] = useState(0);
  const [winCode, setWinCode] = useState('');
  const [attempts, setAttempts] = useState(0);

  // hard mode
  const [phase, setPhase] = useState<'wait' | 'press'>('wait');
  const [phaseTime, setPhaseTime] = useState(30);
  const [strikes, setStrikes] = useState(0);

  // achievements modal
  const [showAchievements, setShowAchievements] = useState(false);
  const [achievements, setAchievements] = useState<Achievement[]>(loadAchievements);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [addCodeInput, setAddCodeInput] = useState('');
  const [addCodeMode, setAddCodeMode] = useState(false);
  const [addCodeError, setAddCodeError] = useState('');

  const lastTickRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<'wait' | 'press'>('wait');
  const phaseTimeRef = useRef<number>(30);
  const strikesRef = useRef<number>(0);
  const endedRef = useRef<boolean>(false);
  const attemptsRef = useRef<number>(0);
  const winMetaRef = useRef<{ code: string; achievement: Achievement } | null>(null);

  const startGame = useCallback(
    (chosenMode: Mode, isRetry = false) => {
      if (!selected) return;
      if (!isRetry) attemptsRef.current = 0;
      attemptsRef.current += 1;
      setAttempts(attemptsRef.current);
      setMode(chosenMode);
      setRemaining(selected.seconds);
      setStrikes(0);
      setPhase('wait');
      setPhaseTime(30);
      strikesRef.current = 0;
      phaseRef.current = 'wait';
      phaseTimeRef.current = 30;
      endedRef.current = false;
      lastTickRef.current = Date.now();
      setScreen('game');
    },
    [selected]
  );

  const win = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const code = genCode();
    const { os, browser, device } = getDeviceInfo();
    const achievement: Achievement = {
      id: Date.now().toString(),
      code,
      mode,
      timerLabel: selected?.label ?? '',
      timerSeconds: selected?.seconds ?? 0,
      attempts: attemptsRef.current,
      date: new Date().toLocaleString('ru-RU'),
      device,
      os,
      browser,
    };
    winMetaRef.current = { code, achievement };
    setWinCode(code);
    setScreen('win');
  }, [mode, selected]);

  const lose = useCallback(() => {
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

      if (delta > 2) { lose(); return; }

      setRemaining((prev) => {
        const next = prev - delta;
        if (next <= 0) { win(); return 0; }
        return next;
      });

      if (mode === 'hard') {
        let pt = phaseTimeRef.current - delta;
        if (pt <= 0) {
          if (phaseRef.current === 'wait') {
            phaseRef.current = 'press';
            pt = 6;
            setPhase('press');
          } else {
            lose(); return;
          }
        }
        phaseTimeRef.current = pt;
        setPhaseTime(pt);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    const onHidden = () => { if (document.visibilityState === 'hidden') lose(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onHidden);
    window.addEventListener('pagehide', onHidden);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', onHidden);
      window.removeEventListener('pagehide', onHidden);
    };
  }, [screen, mode, win, lose]);

  const handlePressButton = () => {
    if (mode !== 'hard' || endedRef.current) return;
    if (phaseRef.current === 'press') {
      phaseRef.current = 'wait';
      phaseTimeRef.current = 30;
      setPhase('wait');
      setPhaseTime(30);
    } else {
      const ns = strikesRef.current + 1;
      strikesRef.current = ns;
      setStrikes(ns);
      if (ns >= 2) lose();
    }
  };

  const handleAddCode = () => {
    const code = addCodeInput.trim();
    if (!/^\d{7}$/.test(code)) {
      setAddCodeError('Код должен состоять из 7 цифр');
      return;
    }
    const found = achievements.find((a) => a.code === code);
    if (!found) {
      setAddCodeError('Код не найден. Проверьте правильность ввода.');
      return;
    }
    setAddCodeError('');
    setAddCodeInput('');
    setAddCodeMode(false);
    setSelectedAchievement(found);
  };

  const handleSaveAchievement = () => {
    if (!winMetaRef.current) return;
    const { achievement } = winMetaRef.current;
    const updated = [achievement, ...achievements];
    setAchievements(updated);
    saveAchievements(updated);
    winMetaRef.current = null;
  };

  // ===== SCREENS =====

  const MedalButton = () => (
    <button
      onClick={() => setShowAchievements(true)}
      className="absolute top-4 left-4 w-12 h-12 bg-white border-2 border-sky-400 rounded-xl flex items-center justify-center shadow hover:bg-sky-50 active:scale-95 transition z-10"
    >
      <Icon name="Medal" size={22} className="text-amber-500" />
    </button>
  );

  if (screen === 'start') {
    return (
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center font-oswald relative">
        <MedalButton />
        <h1 className="text-6xl md:text-8xl font-bold tracking-wider text-sky-600 drop-shadow-sm">
          ДУРКА<span className="text-slate-800"> PLAY</span>
        </h1>
        <button
          onClick={() => setScreen('timers')}
          className="mt-10 px-16 py-5 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-3xl font-semibold rounded-2xl shadow-lg tracking-widest"
        >
          ПЛЭЙ
        </button>
        <AchievementsModal />
      </div>
    );
  }

  if (screen === 'timers') {
    return (
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
        <MedalButton />
        <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8 tracking-wide">ВЫБЕРИ ВРЕМЯ</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 max-w-3xl">
          {TIMERS.map((t) => (
            <button
              key={t.label}
              onClick={() => { setSelected(t); setScreen('mode'); }}
              className="aspect-square flex items-center justify-center bg-white border-2 border-sky-400 hover:bg-sky-500 hover:text-white active:scale-95 transition text-sky-700 text-xl md:text-2xl font-semibold rounded-xl shadow"
            >
              {t.label}
            </button>
          ))}
        </div>
        <AchievementsModal />
      </div>
    );
  }

  if (screen === 'mode') {
    return (
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
        <MedalButton />
        <h2 className="text-7xl md:text-9xl font-bold text-slate-800 mb-12">???</h2>
        <div className="flex flex-col sm:flex-row gap-6">
          <button
            onClick={() => startGame('easy')}
            className="px-12 py-6 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg tracking-wide"
          >
            ЛЁГКИЙ РЕЖИМ
          </button>
          <button
            onClick={() => startGame('hard')}
            className="px-12 py-6 bg-red-500 hover:bg-red-600 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg tracking-wide"
          >
            СЛОЖНЫЙ РЕЖИМ
          </button>
        </div>
        <button
          onClick={() => setScreen('timers')}
          className="mt-10 text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <Icon name="ArrowLeft" size={18} /> назад
        </button>
        <AchievementsModal />
      </div>
    );
  }

  if (screen === 'game') {
    return (
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
        {mode === 'hard' && strikes > 0 && (
          <div className="absolute top-6 right-6">
            <span className="text-5xl font-bold text-red-500">{strikes}</span>
          </div>
        )}
        <p className="text-xl text-slate-500 mb-4 tracking-widest">{selected?.label}</p>
        <div className="text-6xl md:text-8xl font-bold text-slate-800 tabular-nums tracking-wider">
          {formatTime(remaining)}
        </div>
        {mode === 'hard' && (
          <div className="mt-12 flex flex-col items-center">
            <button
              onClick={handlePressButton}
              className={`w-44 h-44 rounded-full text-white text-2xl font-bold shadow-xl active:scale-90 transition ${
                phase === 'press' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}
            >
              {phase === 'press' ? 'ЖМИ!' : 'КНОПКА'}
            </button>
            <div className="mt-6 text-4xl font-bold text-slate-700 tabular-nums">
              {Math.ceil(phaseTime)}
            </div>
            <p className="mt-1 text-slate-500">
              {phase === 'press' ? 'Нажми кнопку!' : 'Не нажимай!'}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (screen === 'win') {
    return (
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
        <MedalButton />
        <Icon name="Trophy" size={80} className="text-amber-400 mb-4" />
        <h2 className="text-5xl md:text-7xl font-bold text-sky-600 mb-6">ВЫ ПОБЕДИЛИ</h2>
        <p className="text-slate-500 mb-2">Ваш секретный код:</p>
        <div className="text-5xl md:text-6xl font-bold text-slate-800 tracking-[0.3em] bg-white px-8 py-4 rounded-2xl border-2 border-sky-400 shadow">
          {winCode}
        </div>
        {winMetaRef.current && (
          <button
            onClick={handleSaveAchievement}
            className="mt-6 px-8 py-3 bg-amber-500 hover:bg-amber-600 active:scale-95 transition text-white text-lg font-semibold rounded-xl shadow flex items-center gap-2"
          >
            <Icon name="Medal" size={20} /> Сохранить достижение
          </button>
        )}
        <button
          onClick={() => setScreen('timers')}
          className="mt-4 px-12 py-4 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-xl font-semibold rounded-2xl shadow"
        >
          НА ГЛАВНУЮ
        </button>
        <AchievementsModal />
      </div>
    );
  }

  // lose
  return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
      <MedalButton />
      <Icon name="Skull" size={80} className="text-red-500 mb-4" />
      <h2 className="text-5xl md:text-7xl font-bold text-red-500 mb-12">ВЫ ПРОИГРАЛИ</h2>
      <div className="flex flex-col sm:flex-row gap-6">
        <button
          onClick={() => startGame(mode, true)}
          className="px-12 py-5 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg"
        >
          ЗАНОВО
        </button>
        <button
          onClick={() => setScreen('timers')}
          className="px-12 py-5 bg-slate-700 hover:bg-slate-800 active:scale-95 transition text-white text-2xl font-semibold rounded-2xl shadow-lg"
        >
          НА ГЛАВНУЮ
        </button>
      </div>
      <AchievementsModal />
    </div>
  );

  // ===== ACHIEVEMENTS MODAL =====
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
              <Row icon="Shield" label="Режим" value={a.mode === 'easy' ? 'Лёгкий' : 'Сложный'} color={a.mode === 'easy' ? 'text-sky-600' : 'text-red-500'} />
              <Row icon="Timer" label="Время испытания" value={a.timerLabel + ' (' + formatFullTime(a.timerSeconds) + ')'} />
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

            <button
              onClick={() => setSelectedAchievement(null)}
              className="mt-6 w-full py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-xl transition"
            >
              Закрыть
            </button>
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
            <button onClick={() => { setShowAchievements(false); setAddCodeMode(false); setAddCodeInput(''); setAddCodeError(''); }} className="text-slate-400 hover:text-slate-600">
              <Icon name="X" size={24} />
            </button>
          </div>

          {addCodeMode ? (
            <div className="flex flex-col gap-3 mb-4">
              <p className="text-slate-500 text-sm">Введи секретный код победителя (7 цифр):</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={7}
                value={addCodeInput}
                onChange={(e) => { setAddCodeInput(e.target.value.replace(/\D/g, '')); setAddCodeError(''); }}
                className="border-2 border-sky-300 rounded-xl px-4 py-3 text-center text-3xl font-bold tracking-[0.2em] text-slate-800 outline-none focus:border-sky-500"
                placeholder="0000000"
                autoFocus
              />
              {addCodeError && <p className="text-red-500 text-sm text-center">{addCodeError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setAddCodeMode(false); setAddCodeInput(''); setAddCodeError(''); }}
                  className="flex-1 py-2 rounded-xl border-2 border-slate-200 text-slate-500 hover:border-slate-300 transition font-semibold"
                >
                  Отмена
                </button>
                <button
                  onClick={handleAddCode}
                  className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white transition font-semibold"
                >
                  Найти
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddCodeMode(true)}
              className="mb-4 w-full py-3 border-2 border-dashed border-sky-300 rounded-2xl text-sky-500 hover:bg-sky-50 transition font-semibold flex items-center justify-center gap-2"
            >
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
            ) : (
              achievements.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAchievement(a)}
                  className="w-full text-left bg-gradient-to-r from-white to-sky-50 border-2 border-sky-200 hover:border-sky-400 rounded-2xl px-4 py-3 transition active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${a.mode === 'easy' ? 'bg-sky-100 text-sky-700' : 'bg-red-100 text-red-600'}`}>
                        {a.mode === 'easy' ? 'ЛЁГКИЙ' : 'СЛОЖНЫЙ'}
                      </span>
                      <span className="text-slate-800 font-bold">{a.timerLabel}</span>
                    </div>
                    <Icon name="ChevronRight" size={16} className="text-slate-400" />
                  </div>
                  <div className="flex gap-4 mt-1.5 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <Icon name="RefreshCw" size={12} /> {a.attempts} попыток
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="Calendar" size={12} /> {a.date.split(',')[0]}
                    </span>
                  </div>
                </button>
              ))
            )}
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
