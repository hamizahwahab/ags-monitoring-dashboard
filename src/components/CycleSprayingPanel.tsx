'use client';

import { useState, useEffect } from 'react';
import { API_CONFIG } from '@/config/api';
import { SprayingPlot } from '@/types';

export default function CycleSprayingPanel() {
  const [plots, setPlots] = useState<SprayingPlot[]>([]);

  const fetchPlots = async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getCycleSpraying();
        setPlots(data || []);
      } else {
        // Fallback: fetch via HTTP
        const response = await fetch(`${API_CONFIG.BASE_URL}/api/cycle-spraying`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          setPlots(Array.isArray(data) ? data : []);
        }
      }
    } catch (err) {
      console.log('Error fetching cycle spraying plots:', err);
    }
  };

  useEffect(() => {
    fetchPlots();

    // Listen for real-time updates
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onRefreshSprayingPlots(() => {
        fetchPlots();
      });

      window.electronAPI.onNewSprayingPlot(() => {
        fetchPlots();
      });
    }

    // Polling fallback
    const pollInterval = setInterval(fetchPlots, API_CONFIG.POLL_INTERVAL);

    return () => {
      clearInterval(pollInterval);
      if (typeof window !== 'undefined' && window.electronAPI) {
        window.electronAPI.removeNewSprayingPlotListener();
      }
    };
  }, []);

  const overdue = plots.filter(p => p.status === 'overdue');
  const pending = plots.filter(p => p.status === 'pending');

  return (
    <div className="h-full flex flex-col bg-tv-panel">
      <div className="px-3 py-3 border-b border-white/10">
        <h2 className="text-base font-bold text-white/70">
          CYCLE SPRAYING
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-4 space-y-3">
        {/* Overdue section (red) */}
        {overdue.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-1.5">
            {overdue.map((item, index) => (
              <div
                key={`overdue-${item.id || index}`}
                className="flex items-center justify-between gap-1 px-2 py-1.5 rounded text-xs bg-red-700/80 text-white blink-overdue"
              >
                <span className="font-semibold">{item.field}</span>
                <span className="opacity-80">P{item.plot}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pending section (yellow) */}
        {pending.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-1.5">
            {pending.map((item, index) => (
              <div
                key={`pending-${item.id || index}`}
                className="flex items-center justify-between gap-1 px-2 py-1.5 rounded text-xs bg-yellow-600/80 text-white"
              >
                <span className="font-semibold">{item.field}</span>
                <span className="opacity-80">P{item.plot}</span>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {plots.length === 0 && (
          <div className="text-center text-base text-white/40 py-12">
            No cycle spraying data
          </div>
        )}
      </div>
    </div>
  );
}