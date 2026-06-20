import { useState, useEffect, useRef, useCallback } from 'react';

interface ParrotProps {
  enabled: boolean;
}

interface ParrotInstance {
  id: number;
  direction: 'ltr' | 'rtl'; // left-to-right or right-to-left
  y: number; // percent of screen height
  fed: boolean;
  hearts: boolean;
}

// Popugai emoji frames to animate wings
const FRAMES = ['🦜', '🦜'];

export default function Parrot({ enabled }: ParrotProps) {
  const [parrots, setParrots] = useState<ParrotInstance[]>([]);
  const [fedSet, setFedSet] = useState<Set<number>>(new Set());
  const counterRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spawnParrot = useCallback(() => {
    const id = ++counterRef.current;
    const direction = Math.random() > 0.5 ? 'ltr' : 'rtl';
    const y = 10 + Math.random() * 75; // 10%–85% from top
    setParrots(prev => [...prev, { id, direction, y, fed: false, hearts: false }]);
    // remove after animation (~8s)
    setTimeout(() => {
      setParrots(prev => prev.filter(p => p.id !== id));
      setFedSet(prev => { const s = new Set(prev); s.delete(id); return s; });
    }, 9000);
  }, []);

  // Schedule random spawns
  useEffect(() => {
    if (!enabled) { setParrots([]); return; }

    const schedule = () => {
      const delay = 8000 + Math.random() * 18000; // 8–26 sec
      timerRef.current = setTimeout(() => {
        spawnParrot();
        schedule();
      }, delay);
    };
    // first spawn quickly
    timerRef.current = setTimeout(spawnParrot, 2000 + Math.random() * 5000);
    schedule();

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [enabled, spawnParrot]);

  const feed = (id: number) => {
    setFedSet(prev => new Set(prev).add(id));
    setParrots(prev => prev.map(p => p.id === id ? { ...p, fed: true, hearts: true } : p));
    setTimeout(() => {
      setParrots(prev => prev.map(p => p.id === id ? { ...p, hearts: false } : p));
    }, 1500);
  };

  if (!enabled || parrots.length === 0) return null;

  return (
    <>
      {parrots.map(p => (
        <ParrotBird key={p.id} parrot={p} onFeed={() => feed(p.id)} fed={fedSet.has(p.id)} />
      ))}
    </>
  );
}

function ParrotBird({ parrot, onFeed, fed }: { parrot: ParrotInstance; onFeed: () => void; fed: boolean }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), 220);
    return () => clearInterval(iv);
  }, []);

  const isLtr = parrot.direction === 'ltr';

  // animation: fly across screen in 8s
  const style: React.CSSProperties = {
    position: 'fixed',
    top: `${parrot.y}%`,
    zIndex: 9999,
    pointerEvents: 'auto',
    animation: isLtr
      ? 'parrot-fly-ltr 8s linear forwards'
      : 'parrot-fly-rtl 8s linear forwards',
    userSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  };

  return (
    <div style={style}>
      {parrot.hearts && (
        <div style={{ display: 'flex', gap: '2px', animation: 'hearts-pop 1.4s ease-out forwards' }}>
          <span style={{ fontSize: '14px' }}>❤️</span>
          <span style={{ fontSize: '10px', marginTop: '4px' }}>❤️</span>
          <span style={{ fontSize: '14px' }}>❤️</span>
        </div>
      )}
      <div style={{ fontSize: '28px', transform: isLtr ? 'scaleX(1)' : 'scaleX(-1)', cursor: 'pointer', filter: fed ? 'drop-shadow(0 0 6px #ff69b4)' : 'none', transition: 'filter 0.3s' }}
        title="Покормить попугая"
        onClick={onFeed}
      >
        {FRAMES[frame]}
      </div>
      {/* Feed button below parrot */}
      {!fed && (
        <button
          onClick={onFeed}
          style={{
            background: '#fff',
            border: '2px solid #38bdf8',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '11px',
            fontFamily: 'Oswald, sans-serif',
            fontWeight: 600,
            color: '#0284c7',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          🌾 Корм
        </button>
      )}
      <style>{`
        @keyframes parrot-fly-ltr {
          from { left: -80px; }
          to   { left: calc(100vw + 80px); }
        }
        @keyframes parrot-fly-rtl {
          from { right: -80px; left: auto; transform-origin: center; }
          to   { right: calc(100vw + 80px); }
        }
        @keyframes hearts-pop {
          0%   { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-30px) scale(1.4); }
        }
      `}</style>
    </div>
  );
}
