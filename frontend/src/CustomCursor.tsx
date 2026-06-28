import { useEffect, useState } from 'react';

export type CursorStyle = 'none' | 'trailing' | 'invert';

export const CustomCursor = ({ type }: { type: CursorStyle }) => {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const updatePosition = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      
      const target = e.target as HTMLElement;
      // Check if the element we are hovering over is interactive
      const isClickable = target.closest('button') || target.closest('a') || target.closest('input') || target.closest('select');
      setIsHovering(!!isClickable);
    };

    if (type !== 'none') {
      window.addEventListener('mousemove', updatePosition);
    }
    
    return () => {
      window.removeEventListener('mousemove', updatePosition);
    };
  }, [type]);

  if (type === 'none') return null;

  if (type === 'trailing') {
    return (
      <>
        {/* Solid Dot */}
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '8px', height: '8px',
          backgroundColor: 'var(--accent-primary)', borderRadius: '50%',
          transform: `translate(${position.x - 4}px, ${position.y - 4}px)`,
          pointerEvents: 'none', zIndex: 9999,
          transition: 'width 0.2s, height 0.2s'
        }} />
        {/* Trailing Ring */}
        <div style={{
          position: 'fixed', top: 0, left: 0,
          width: isHovering ? '48px' : '32px',
          height: isHovering ? '48px' : '32px',
          border: '2px solid var(--accent-primary)', borderRadius: '50%',
          transform: `translate(${position.x - (isHovering ? 24 : 16)}px, ${position.y - (isHovering ? 24 : 16)}px)`,
          pointerEvents: 'none', zIndex: 9998,
          transition: 'transform 0.15s ease-out, width 0.2s, height 0.2s',
          backgroundColor: isHovering ? 'var(--accent-primary)' : 'transparent',
          opacity: isHovering ? 0.2 : 1
        }} />
      </>
    );
  }

  if (type === 'invert') {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0,
        width: isHovering ? '64px' : '24px',
        height: isHovering ? '64px' : '24px',
        backgroundColor: 'white', borderRadius: '50%',
        transform: `translate(${position.x - (isHovering ? 32 : 12)}px, ${position.y - (isHovering ? 32 : 12)}px)`,
        pointerEvents: 'none', zIndex: 9999,
        transition: 'width 0.2s, height 0.2s',
        mixBlendMode: 'difference'
      }} />
    );
  }

  return null;
};
