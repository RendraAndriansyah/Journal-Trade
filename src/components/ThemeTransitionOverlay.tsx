import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';

interface Props {
  isTransitioning: boolean;
  targetTheme: 'dark' | 'light';
}

export function ThemeTransitionOverlay({ isTransitioning, targetTheme }: Props) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (isTransitioning) {
      setVisible(true);
      setFading(false);
    } else if (visible) {
      // Trigger fade-out
      setFading(true);
      const t = setTimeout(() => {
        setVisible(false);
        setFading(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isTransitioning, visible]);

  if (!visible) return null;

  const isDark = targetTheme === 'dark';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(11,14,20,0.85)' : 'rgba(247,249,247,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 300ms ease',
        pointerEvents: 'none',
      }}
    >
      {/* Outer ripple ring */}
      <div
        style={{
          position: 'absolute',
          width: 120,
          height: 120,
          borderRadius: '50%',
          border: `1.5px solid ${isDark ? 'rgba(52,211,153,0.25)' : 'rgba(5,150,105,0.25)'}`,
          animation: 'theme-ripple 0.8s ease-out forwards',
        }}
      />
      {/* Middle ring */}
      <div
        style={{
          position: 'absolute',
          width: 80,
          height: 80,
          borderRadius: '50%',
          border: `1.5px solid ${isDark ? 'rgba(52,211,153,0.4)' : 'rgba(5,150,105,0.4)'}`,
          animation: 'theme-ripple 0.8s 0.08s ease-out forwards',
        }}
      />
      {/* Icon container */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          backgroundColor: isDark ? 'rgba(52,211,153,0.12)' : 'rgba(5,150,105,0.1)',
          border: `1.5px solid ${isDark ? 'rgba(52,211,153,0.35)' : 'rgba(5,150,105,0.35)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'theme-icon-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards',
        }}
      >
        <Coins
          style={{
            width: 22,
            height: 22,
            color: isDark ? '#34d399' : '#059669',
            animation: 'theme-spin-once 0.5s ease-in-out forwards',
          }}
        />
      </div>

      {/* Label */}
      <div
        style={{
          position: 'absolute',
          marginTop: 90,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: isDark ? 'rgba(52,211,153,0.7)' : 'rgba(5,150,105,0.7)',
          animation: 'theme-fade-up 0.4s 0.1s ease forwards',
          opacity: 0,
        }}
      >
        {isDark ? 'Dark Mode' : 'Light Mode'}
      </div>

      {/* Keyframe styles injected inline */}
      <style>{`
        @keyframes theme-ripple {
          0%   { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes theme-icon-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes theme-spin-once {
          0%   { transform: rotate(-30deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes theme-fade-up {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
