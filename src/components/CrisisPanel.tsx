'use client';

import React from 'react';
import { CrisisPanelProps } from '@/types';

export default function CrisisPanel({ crises }: CrisisPanelProps) {
  return (
    <div className="h-full flex flex-col bg-[#0d0d0d] border-r border-white/10 shadow-[5px_0_30px_rgba(0,0,0,0.5)]">
      <div className="px-3 py-3 border-b border-white/10">
        <h2 className="text-base font-bold text-red-500 flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          ACTIVE CRISES
        </h2>
      </div>
      
      <div className="flex-1 py-4 px-0 space-y-3">
        {crises.length === 0 ? (
          <div className="text-center text-sm text-white/30 py-12">
            No active crises
          </div>
        ) : (
          crises.map((crisis) => (
            <div 
              key={crisis.id} 
              className="p-3 rounded-lg bg-red-700 border border-red-500"
            >
              <div className="mb-1">
                <h3 className="text-sm font-bold text-white">{crisis.title}</h3>
              </div>
              <p className="text-xs text-white/80 line-clamp-3">{crisis.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
