import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, active }) => {
  return (
    <div 
      onClick={onClick}
      className={`
        bg-white border backdrop-blur-sm rounded-2xl p-5 transition-all duration-300 shadow-sm
        ${active ? 'border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.2)]' : 'border-slate-200 hover:border-slate-300'}
        ${onClick ? 'cursor-pointer hover:shadow-md' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};