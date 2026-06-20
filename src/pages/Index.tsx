import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';

type Screen = 'start' | 'timers' | 'mode' | 'game' | 'win' | 'lose';
type Mode = 'easy' | 'hard';

interface TimerOption {
  label: string;
  seconds: number;
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

const formatTime = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) {
    return `${days}д ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const genCode = (): string => {
  let code = '';
  for (let i = 0; i < 7; i++) code += Math.floor(Math.random() * 10);
  return code;
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

  // hard mode state
  const [phase, setPhase] = useState<'wait' | 'press'>('wait');
  const [phaseTime, setPhaseTime] = useState(30);
  const [strikes, setStrikes] = useState(0);

  const lastTickRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<'wait' | 'press'>('wait');
  const phaseTimeRef = useRef<number>(30);
  const strikesRef = useRef<number>(0);
  const endedRef = useRef<boolean>(false);

  const startGame = useCallback(
    (chosenMode: Mode) => {
      if (!selected) return;
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
    setWinCode(genCode());
    setScreen('win');
  }, []);

  const lose = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setScreen('lose');
  }, []);

  // main countdown loop — detects device sleep/freeze via real-time gap
  useEffect(() => {
    if (screen !== 'game') return;

    let stopped = false;

    const loop = () => {
      if (stopped || endedRef.current) return;
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      // device froze/slept/locked — gap too big => lose (both modes)
      if (delta > 2) {
        lose();
        return;
      }

      // main timer
      setRemaining((prev) => {
        const next = prev - delta;
        if (next <= 0) {
          win();
          return 0;
        }
        return next;
      });

      // hard mode phase logic via refs (no nested setState)
      if (mode === 'hard') {
        let pt = phaseTimeRef.current - delta;
        if (pt <= 0) {
          if (phaseRef.current === 'wait') {
            phaseRef.current = 'press';
            pt = 6;
            setPhase('press');
          } else {
            // press window expired without pressing => lose
            lose();
            return;
          }
        }
        phaseTimeRef.current = pt;
        setPhaseTime(pt);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    // device lock / app switch / tab hidden => lose
    const onHidden = () => {
      if (document.visibilityState === 'hidden') lose();
    };
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
      // correct press
      phaseRef.current = 'wait';
      phaseTimeRef.current = 30;
      setPhase('wait');
      setPhaseTime(30);
    } else {
      // pressed during wait — strike
      const ns = strikesRef.current + 1;
      strikesRef.current = ns;
      setStrikes(ns);
      if (ns >= 2) lose();
    }
  };

  // ===== SCREENS =====
  if (screen === 'start') {
    return (
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center font-oswald">
        <h1 className="text-6xl md:text-8xl font-bold tracking-wider text-sky-600 drop-shadow-sm">
          ДУРКА<span className="text-slate-800"> PLAY</span>
        </h1>
        <button
          onClick={() => setScreen('timers')}
          className="mt-10 px-16 py-5 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-3xl font-semibold rounded-2xl shadow-lg tracking-widest"
        >
          ПЛЭЙ
        </button>
      </div>
    );
  }

  if (screen === 'timers') {
    return (
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8 tracking-wide">
          ВЫБЕРИ ВРЕМЯ
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 max-w-3xl">
          {TIMERS.map((t) => (
            <button
              key={t.label}
              onClick={() => {
                setSelected(t);
                setScreen('mode');
              }}
              className="aspect-square flex items-center justify-center bg-white border-2 border-sky-400 hover:bg-sky-500 hover:text-white active:scale-95 transition text-sky-700 text-xl md:text-2xl font-semibold rounded-xl shadow"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (screen === 'mode') {
    return (
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald">
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
      </div>
    );
  }

  if (screen === 'game') {
    return (
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald relative">
        {mode === 'hard' && (
          <div className="absolute top-6 right-6 flex items-center gap-2">
            {strikes > 0 && (
              <span className="text-5xl font-bold text-red-500">{strikes}</span>
            )}
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
                phase === 'press'
                  ? 'bg-green-500 animate-pulse'
                  : 'bg-red-500'
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
      <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald">
        <Icon name="Trophy" size={80} className="text-amber-400 mb-4" />
        <h2 className="text-5xl md:text-7xl font-bold text-sky-600 mb-6">ВЫ ПОБЕДИЛИ</h2>
        <p className="text-slate-500 mb-2">Ваш секретный код:</p>
        <div className="text-5xl md:text-6xl font-bold text-slate-800 tracking-[0.3em] bg-white px-8 py-4 rounded-2xl border-2 border-sky-400 shadow">
          {winCode}
        </div>
        <button
          onClick={() => setScreen('timers')}
          className="mt-10 px-12 py-4 bg-sky-500 hover:bg-sky-600 active:scale-95 transition text-white text-xl font-semibold rounded-2xl shadow"
        >
          НА ГЛАВНУЮ
        </button>
      </div>
    );
  }

  // lose
  return (
    <div style={grid} className="min-h-screen flex flex-col items-center justify-center p-6 font-oswald">
      <Icon name="Skull" size={80} className="text-red-500 mb-4" />
      <h2 className="text-5xl md:text-7xl font-bold text-red-500 mb-12">ВЫ ПРОИГРАЛИ</h2>
      <div className="flex flex-col sm:flex-row gap-6">
        <button
          onClick={() => startGame(mode)}
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
    </div>
  );
}