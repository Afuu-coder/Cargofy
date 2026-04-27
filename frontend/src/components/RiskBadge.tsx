import React from 'react';

type Category = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface RiskBadgeProps {
  score: number;          // 0–100
  category: Category;
}

const CONFIG: Record<Category, { bg: string; text: string; dot: string }> = {
  LOW:      { bg: 'bg-green-500/15 border border-green-500/30',  text: 'text-green-400',  dot: 'bg-green-400' },
  MEDIUM:   { bg: 'bg-amber-500/15 border border-amber-500/30',  text: 'text-amber-400',  dot: 'bg-amber-400' },
  HIGH:     { bg: 'bg-orange-500/15 border border-orange-500/30',text: 'text-orange-400', dot: 'bg-orange-400' },
  CRITICAL: { bg: 'bg-red-500/15 border border-red-500/30',      text: 'text-red-400',    dot: 'bg-red-400'   },
};

export const RiskBadge: React.FC<RiskBadgeProps> = ({ score, category }) => {
  const c = CONFIG[category] ?? CONFIG.LOW;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {category} {score}%
    </span>
  );
};

export default RiskBadge;
