import React from 'react';

interface IconProps {
  className?: string;
}

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const CubeIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="M3.3 7 12 12l8.7-5M12 22V12" />
  </svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const RoomIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M3 21V8l9-5 9 5v13" />
    <path d="M3 21h18M9 21v-6h6v6" />
  </svg>
);

export const FitIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const PlayIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className} fill="currentColor" stroke="none">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
  </svg>
);

export const AlertIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const PauseIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4.2" height="15" rx="1" />
    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1" />
  </svg>
);

export const StepForwardIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M6 5v14l9-7z" fill="currentColor" stroke="none" />
    <path d="M19 5v14" />
  </svg>
);

export const StepBackIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M18 5v14l-9-7z" fill="currentColor" stroke="none" />
    <path d="M5 5v14" />
  </svg>
);

export const ResetIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);
