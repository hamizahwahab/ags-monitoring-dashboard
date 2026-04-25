'use client';

import React from 'react';
import { CrisisPanelProps } from '@/types';

export default function CrisisPanel({ crises }: CrisisPanelProps) {
  return (
    <div className="h-full flex flex-col bg-[#0d0d0d] border-r border-white/10 shadow-[5px_0_30px_rgba(0,0,0,0.5)]">
      <div className="p-4 border-b border-white/10 bg-red-950/20">
        <h2 className="text-lg font-bold text-red-500 flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          ACTIVE CRISES
        </h2>
        <div className="text-xs text-white/40 mt-1">
          {crises.length} active emergency alerts
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 px-0 space-y-3 custom-scrollbar">
        {crises.length === 0 ? (
          <div className="text-center text-sm text-white/30 py-12">
            No active crises
          </div>
        ) : (
          crises.map((crisis) => (
            <div 
              key={crisis.id} 
              className="p-3 rounded-lg bg-red-900/10 border border-red-500/30"
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-sm font-bold text-red-400">{crisis.title}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                  crisis.severity === 'high' ? 'bg-red-600 text-white' : 
                  crisis.severity === 'medium' ? 'bg-orange-500 text-white' : 
                  'bg-yellow-500 text-black'
                }`}>
                  {crisis.severity}
                </span>
              </div>
              <p className="text-xs text-white/60 line-clamp-3">{crisis.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
