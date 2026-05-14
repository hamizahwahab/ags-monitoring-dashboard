'use client';

interface SprayingPlot {
  field: string;
  plot: string;
  status: 'overdue' | 'pending';
}

// Hardcoded data from CYCLE SPRAYING SDP07.xlsx
const plots: SprayingPlot[] = [
  // Overdue (red) - more than 2 days
  { field: '2021A', plot: '2', status: 'overdue' },
  { field: '2021A', plot: '6', status: 'overdue' },
  { field: '2021B', plot: '4', status: 'overdue' },
  { field: '2021B', plot: '4', status: 'overdue' },
  { field: '2021C', plot: '4', status: 'overdue' },
  { field: '2021CA', plot: '4', status: 'overdue' },
  { field: '2021CB', plot: '2', status: 'overdue' },
  { field: '2021CC', plot: '4', status: 'overdue' },
  { field: '2021D', plot: '4', status: 'overdue' },

  // Pending (yellow) - less than 2 days
  { field: '2022A', plot: '4', status: 'pending' },
  { field: '2022A', plot: '4', status: 'pending' },
  { field: '2022A', plot: '5', status: 'pending' },
  { field: '2022A', plot: '5', status: 'pending' },
  { field: '2022A', plot: '6', status: 'pending' },
  { field: '2022B', plot: '4', status: 'pending' },
  { field: '2022B', plot: '4', status: 'pending' },
  { field: '2022B', plot: '6', status: 'pending' },
  { field: '2022B', plot: '6', status: 'pending' },
  { field: '2022B', plot: '11', status: 'pending' },
  { field: '2022C', plot: '4', status: 'pending' },
  { field: '2022C', plot: '5', status: 'pending' },
  { field: '2022C', plot: '6', status: 'pending' },
  { field: '2022C', plot: '6', status: 'pending' },
  { field: '2022CA', plot: '2', status: 'pending' },
  { field: '2022D', plot: '3', status: 'pending' },
  { field: '2022D', plot: '4', status: 'pending' },
  { field: '2022D', plot: '5', status: 'pending' },
  { field: '2022D', plot: '5', status: 'pending' },
  { field: '2022E', plot: '8', status: 'pending' },
  { field: '2022E', plot: '8', status: 'pending' },
  { field: '2023CA', plot: '0', status: 'pending' },
  // Plots with no field name - treat as pending
  { field: '-', plot: '18', status: 'pending' },
  { field: '-', plot: '19', status: 'pending' },
  { field: '-', plot: '19', status: 'pending' },
  { field: '-', plot: '21', status: 'pending' },
  { field: '-', plot: '28', status: 'pending' },
  { field: '-', plot: '30', status: 'pending' },
];

export default function CycleSprayingPanel() {
  const overdue = plots.filter(p => p.status === 'overdue');
  const pending = plots.filter(p => p.status === 'pending');

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] p-3">
      <h2 className="text-base font-bold text-white/70 mb-3 border-b border-white/10 pb-2">
        CYCLE SPRAYING
      </h2>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
        {/* Overdue section (red) */}
        {overdue.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1.5">
            {overdue.map((item, index) => (
              <div
                key={`overdue-${index}`}
                className="flex items-center justify-between px-2 py-1.5 rounded text-xs bg-red-700/80 text-white"
              >
                <span className="font-semibold">{item.field}</span>
                <span className="opacity-80">P{item.plot}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pending section (yellow) - always starts on a new line */}
        {pending.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1.5">
            {pending.map((item, index) => (
              <div
                key={`pending-${index}`}
                className="flex items-center justify-between px-2 py-1.5 rounded text-xs bg-yellow-600/80 text-white"
              >
                <span className="font-semibold">{item.field}</span>
                <span className="opacity-80">P{item.plot}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}