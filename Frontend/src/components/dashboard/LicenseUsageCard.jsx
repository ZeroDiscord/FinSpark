import React from 'react';
import { Card, CardContent, CardTitle } from '../ui/Card.jsx';
import ChartWrapper from '../ui/ChartWrapper.jsx';
import { Layers } from 'lucide-react';

export default function LicenseUsageCard({ data = [], loading = false, error = null }) {
  // Use mock data if no data provided
  const hasData = data && data.length > 0;
  
  // Example dummy data
  const chartData = hasData ? data : [
    { module: 'Identity Verification', licensed: 15, used: 12 },
    { module: 'Credit Bureau Pull', licensed: 4, used: 0 },
    { module: 'Fraud Detection API', licensed: 8, used: 8 },
    { module: 'E-Signature', licensed: 3, used: 1 },
  ];

  return (
    <Card className="col-span-12 xl:col-span-6 bg-slate-900/50 backdrop-blur-md border border-white/10 shadow-xl overflow-hidden hover:border-blue-500/30 transition-all duration-300">
      <CardTitle className="bg-gradient-to-r from-blue-900/40 to-transparent p-4 flex items-center gap-3">
        <Layers className="w-5 h-5 text-blue-400" />
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-white">License vs Invocation Intelligence</h3>
          <p className="text-xs text-slate-400 mt-0.5">Which features are configured but never used?</p>
        </div>
      </CardTitle>
      <CardContent className="p-0">
        <ChartWrapper loading={loading} error={error}>
          <div className="p-4 space-y-4">
            {chartData.map((item, i) => {
              const utilPercent = item.licensed > 0 ? (item.used / item.licensed) * 100 : 0;
              const isUnused = item.used === 0;
              
              return (
                <div key={i} className="relative group">
                  <div className="flex justify-between text-xs mb-1.5 px-1">
                    <span className={`font-medium ${isUnused ? 'text-rose-400' : 'text-slate-300'}`}>
                      {item.module} {isUnused && <span className="ml-2 px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded text-[10px]">Unused Config</span>}
                    </span>
                    <span className="text-slate-400">{item.used} / {item.licensed} features used</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${isUnused ? 'bg-rose-500/20' : 'bg-blue-500'}`}
                      style={{ width: `${utilPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartWrapper>
      </CardContent>
    </Card>
  );
}
