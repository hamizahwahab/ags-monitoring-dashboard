'use client';

import { useRef, useState, useEffect } from 'react';
import NotificationCard from './NotificationCard';
import { NotificationPanelProps } from '@/types';

export default function NotificationPanel({ notifications }: NotificationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const animFrameRef = useRef<number | null>(null);
  const isPaused = useRef(false);
  const scrollPosRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Check if content overflows the container — only then enable auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (el && content) {
      // Use a small threshold (2px) to avoid float rounding issues
      setShouldScroll(content.scrollHeight > el.clientHeight + 2);
    }
  }, [notifications]);

  // Smooth auto-scroll using requestAnimationFrame
  useEffect(() => {
    if (!shouldScroll) return;
    const el = scrollRef.current;
    if (!el) return;

    const SPEED = 30; // pixels per second
    scrollPosRef.current = 0;
    lastTimeRef.current = 0;

    const animate = (timestamp: number) => {
      if (isPaused.current) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }

      const delta = (timestamp - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = timestamp;

      scrollPosRef.current += SPEED * delta;
      const maxScroll = el.scrollHeight - el.clientHeight;

      if (scrollPosRef.current >= maxScroll) {
        scrollPosRef.current = 0;
      }

      el.scrollTop = scrollPosRef.current;
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [shouldScroll]);

  return (
    <div className="h-full bg-tv-panel">
      <div className="px-3 py-3 border-b border-white/10">
        <h2 className="text-base font-bold text-white/70">
          NOTIFICATION
        </h2>
      </div>
      
      <div
        ref={scrollRef}
        className="overflow-hidden h-[calc(100%-50px)]"
        onMouseEnter={() => { isPaused.current = true; }}
        onMouseLeave={() => { isPaused.current = false; }}
      >
        {notifications.length === 0 ? (
          <div className="text-center text-base text-white/40 py-8">
            No notifications
          </div>
        ) : (
          <div ref={contentRef} className="space-y-2">
            {notifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                title={notification.title}
                message={notification.message}
                createdAt={notification.created_at}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}